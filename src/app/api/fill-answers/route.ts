import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { fillFromAnswerBank, isAnswerBankEmpty } from "@/lib/answer-bank";
import { requireUser } from "@/lib/auth";

const questionSchema = z.object({
  id: z.string(),
  label: z.string(),
  currentValue: z.string().optional(),
});

const bodySchema = z.object({
  questions: z.array(questionSchema).max(50),
  company: z.string().max(200).optional(),
  role: z.string().max(200).optional(),
  jobDescription: z.string().max(20000).optional(),
});

/**
 * Non-LLM autofill: matches scraped form questions against the user's
 * answer bank with keyword rules only. Never calls OpenAI/Anthropic/Gateway.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { questions, jobDescription } = parsed.data;
  const company = parsed.data.company || "";
  const role = parsed.data.role || "";

  if (questions.length === 0) {
    return NextResponse.json({ error: "No questions found on the page." }, { status: 400 });
  }

  const db = getDb();
  const rows = await db
    .select({ answerBank: users.answerBank })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const bank = rows[0]?.answerBank || {};

  if (isAnswerBankEmpty(bank)) {
    return NextResponse.json(
      {
        error:
          "Your answer bank is empty. Go to Dashboard → Application profile → Answer bank, fill in a few answers, and Save.",
      },
      { status: 400 },
    );
  }

  const { matched, unmatched } = fillFromAnswerBank(questions, bank, {
    company,
    role,
    jobDescription,
  });

  return NextResponse.json({ answers: matched, unmatched });
}
