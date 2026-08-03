import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ANSWER_BANK_KEYS, type AnswerBank } from "@/lib/answer-bank";
import { getSessionUser } from "@/lib/auth";
import { buildAnswerBankFromResume } from "@/lib/resume-parse";

export const runtime = "nodejs";

async function extractPdfText(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : String(text || "");
}

function sanitizeAnswerBank(input: AnswerBank): AnswerBank {
  const out: AnswerBank = {};
  for (const key of ANSWER_BANK_KEYS) {
    const v = input[key];
    if (typeof v === "string" && v.trim()) out[key] = v.slice(0, 4000);
  }
  return out;
}

/**
 * Upload a resume (PDF/TXT) → extract text → fill answer bank with templates.
 * No LLM. Saves resumeText + answerBank on the user.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let resumeText = "";
  let extras = {
    workAuth: "",
    sponsorship: "",
    location: "",
    salary: "",
    startDate: "",
  };

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    extras = {
      workAuth: String(form.get("workAuth") || ""),
      sponsorship: String(form.get("sponsorship") || ""),
      location: String(form.get("location") || ""),
      salary: String(form.get("salary") || ""),
      startDate: String(form.get("startDate") || ""),
    };
    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const f = file as File;
      const name = (f.name || "").toLowerCase();
      const buf = Buffer.from(await f.arrayBuffer());
      if (name.endsWith(".pdf") || f.type === "application/pdf") {
        try {
          resumeText = await extractPdfText(buf);
        } catch {
          return NextResponse.json(
            { error: "Could not read that PDF. Try exporting as text, or paste plain text." },
            { status: 400 },
          );
        }
      } else {
        resumeText = buf.toString("utf8");
      }
    }
    const pasted = String(form.get("resumeText") || "");
    if (!resumeText.trim() && pasted.trim()) resumeText = pasted;
  } else {
    const body = await req.json().catch(() => ({}));
    resumeText = String(body.resumeText || "");
    extras = {
      workAuth: String(body.workAuth || ""),
      sponsorship: String(body.sponsorship || ""),
      location: String(body.location || ""),
      salary: String(body.salary || ""),
      startDate: String(body.startDate || ""),
    };
  }

  resumeText = resumeText.replace(/\u0000/g, "").trim().slice(0, 40000);
  if (resumeText.length < 80) {
    return NextResponse.json(
      { error: "Resume text is too short. Upload a PDF/TXT or paste more content." },
      { status: 400 },
    );
  }

  const answerBank = sanitizeAnswerBank(buildAnswerBankFromResume(resumeText, extras));
  const db = getDb();
  const [updated] = await db
    .update(users)
    .set({
      resumeText,
      answerBank,
    })
    .where(eq(users.id, session.id))
    .returning({
      email: users.email,
      displayName: users.displayName,
      headline: users.headline,
      resumeText: users.resumeText,
      writingStyle: users.writingStyle,
      answerBank: users.answerBank,
    });

  return NextResponse.json({
    profile: updated,
    filledKeys: Object.keys(answerBank),
  });
}
