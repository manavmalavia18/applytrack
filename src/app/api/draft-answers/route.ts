import { eq } from "drizzle-orm";
import { generateText, Output } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";

const questionSchema = z.object({
  id: z.string(),
  label: z.string(),
  currentValue: z.string().optional(),
});

const draftSchema = z.object({
  answers: z.array(
    z.object({
      id: z.string(),
      answer: z.string(),
    }),
  ),
});

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const questions = z.array(questionSchema).max(25).parse(body.questions || []);
    const company = String(body.company || "").slice(0, 200);
    const role = String(body.role || "").slice(0, 200);

    if (questions.length === 0) {
      return NextResponse.json({ error: "No questions found on the page." }, { status: 400 });
    }

    const db = getDb();
    const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const profile = rows[0];
    if (!profile?.resumeText?.trim()) {
      return NextResponse.json(
        {
          error:
            "Add your resume/profile first: Dashboard → Extension token page → Profile section.",
        },
        { status: 400 },
      );
    }

    const { output } = await generateText({
      model: "openai/gpt-4o-mini",
      output: Output.object({ schema: draftSchema }),
      prompt: `You help a job applicant draft short, honest answers for an online application form.

Company: ${company || "Unknown"}
Role: ${role || "Unknown"}

Candidate profile / resume:
${profile.displayName ? `Name: ${profile.displayName}\n` : ""}${profile.headline ? `Headline: ${profile.headline}\n` : ""}
${profile.resumeText}

Writing preferences:
${profile.writingStyle || "Professional, concise, first person. No fluff. Match the question length — short questions get short answers."}

Questions (return one answer per id, same ids):
${questions.map((q, i) => `${i + 1}. id=${q.id}\nQ: ${q.label}\nCurrent: ${q.currentValue || "(empty)"}`).join("\n\n")}

Rules:
- Stay truthful to the resume; never invent employers or degrees.
- If a question needs info not in the resume, write a brief honest placeholder like "[add detail]" instead of fabricating.
- Prefer 2–5 sentences unless the question asks for yes/no or a short value.
- Do not wrap answers in quotes.`,
    });

    return NextResponse.json({
      answers: output?.answers || [],
      model: "openai/gpt-4o-mini",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Draft failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
