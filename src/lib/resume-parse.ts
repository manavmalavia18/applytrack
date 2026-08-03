import type { AnswerBank } from "@/lib/answer-bank";

export type ResumeFacts = {
  skills: string;
  companies: string[];
  firstRole: string;
  projectHint: string;
};

/** Pull a few usable facts from plain resume text — no LLM. */
export function extractResumeFacts(resumeText: string): ResumeFacts {
  const text = String(resumeText || "").replace(/\r/g, "");
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const skillsLine =
    lines.find((l) => /^(languages|skills|technical skills|frameworks)\b/i.test(l)) ||
    lines.find((l) => /typescript|python|react|aws|kubernetes/i.test(l) && l.length < 280) ||
    "";

  const companies: string[] = [];
  for (const line of lines) {
    const m =
      line.match(
        /(?:Software Engineer|Engineer|Developer|Intern|Teaching Assistant).*?\|\s*([^|(]+?)(?:\s*\(|\s*\||$)/i,
      ) || line.match(/^([A-Z][\w&.\- ]{2,40})\s*\|\s*(Software|Engineer|Developer)/i);
    if (m?.[1]) {
      const co = m[1].replace(/\s+/g, " ").trim();
      if (co.length > 2 && co.length < 48 && !companies.includes(co)) companies.push(co);
    }
    if (companies.length >= 4) break;
  }
  // Fallback: lines like "Company Name — Role" or "at Acme"
  if (!companies.length) {
    for (const line of lines) {
      const at = line.match(/\bat\s+([A-Z][\w&.\- ]{2,40})\b/);
      if (at?.[1] && !/Boston|United|University|India|Texas/i.test(at[1])) {
        companies.push(at[1].trim());
      }
      if (companies.length >= 3) break;
    }
  }

  const firstRole =
    lines.find((l) => /software engineer|full[- ]?stack|backend|platform engineer/i.test(l))?.slice(0, 80) ||
    "software engineer";

  // Prefer named side projects (not job bullets) — "proud of" questions often ask for off-resume work.
  const projectHint =
    (() => {
      const named = text.match(
        /\b(DebugPilot|[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,2})\b[^.\n]{0,40}\b(built|created|launched|side project|personal project)/i,
      );
      if (named) return named[0].replace(/\s+/g, " ").slice(0, 200);
      const dbg = lines.find((l) => /debugpilot/i.test(l));
      if (dbg) return dbg.replace(/^[-•*]\s*/, "").slice(0, 200);
      return "";
    })();

  return {
    skills: skillsLine.replace(/^(languages|skills|technical skills|frameworks)\s*:?\s*/i, "").slice(0, 220),
    companies,
    firstRole,
    projectHint,
  };
}

export type ParseExtras = {
  workAuth?: string;
  sponsorship?: string;
  location?: string;
  salary?: string;
  startDate?: string;
};

/**
 * Build a full answer bank from resume text + optional facts.
 * Deterministic templates only — no model calls.
 */
export function buildAnswerBankFromResume(resumeText: string, extras: ParseExtras = {}): AnswerBank {
  const facts = extractResumeFacts(resumeText);
  const coList =
    facts.companies.length > 0
      ? facts.companies.slice(0, 3).join(" and ")
      : "startup and product teams";
  const skills =
    facts.skills ||
    "full-stack development, backend systems, cloud, CI/CD, and production support";

  const location =
    extras.location?.trim() ||
    "I'm open to roles anywhere in the United States — remote, hybrid, or willing to relocate.";
  const workAuth =
    extras.workAuth?.trim() ||
    "Yes. I am currently authorized to work in the U.S. on F-1 STEM OPT, but I would require future employer sponsorship, such as H-1B, to continue working long term.";
  const sponsorship =
    extras.sponsorship?.trim() ||
    "I am on F-1 STEM OPT now and will need future H-1B sponsorship for long-term employment.";
  const salary = extras.salary?.trim() || "Open to discussing based on role, level, and location.";
  const startDate = extras.startDate?.trim() || "I can start within 2 weeks of an offer.";

  return {
    whyCompany: `I'm interested in [Company] because the work feels practical, technical, and impactful. The role matches my background in ${skills}, and I'd be excited to help build reliable software for real users.`,
    whyRole: `I'm applying because this [Role] role matches the work I want to keep growing in: building reliable software, solving practical problems, and supporting production systems. My experience has prepared me to take ownership, move quickly, and contribute across the stack.`,
    whyLooking:
      "I'm currently employed, but I'm exploring long-term opportunities with more ownership, growth, and larger-scale software work.",
    // Keep this off-resume oriented; never paste a truncated job bullet.
    proudWork: facts.projectHint
      ? `Outside of what's listed as day-to-day job bullets, I'm proud of ${facts.projectHint.replace(/^one thing i'm proud of:\s*/i, "")}. I owned the hard parts end-to-end and learned a lot shipping it.`
      : `Outside of my resume bullets, I'm proud of mentoring and teaching applied AI/ML concepts — breaking down RAG, evaluation, and practical LLM workflows so others could actually build with them. That kind of clarity under pressure is something I care about as an engineer too.`,
    aiExperience: /ai|llm|rag|langchain|openai|claude|machine learning|nlp/i.test(resumeText)
      ? `I have hands-on AI/ML experience from my resume work — including RAG/LLM workflows and related tooling where listed. I'm comfortable applying those skills to practical product problems.`
      : `I've worked with modern AI tooling in engineering workflows and am comfortable learning and applying LLM/RAG patterns when a role calls for it.`,
    startupExperience: `I've worked at ${coList}, where I learned to take ownership, move quickly, work across the stack, and support real users in production. I'm comfortable with ambiguity, fast releases, and debugging.`,
    testing: /playwright|cypress|jest|pytest|unit test|e2e|testing/i.test(resumeText)
      ? "Yes. I write automated tests as a normal part of my work, including regression and end-to-end coverage on critical flows."
      : "Yes. I write tests as part of normal development and validate changes in staging before shipping.",
    cloud: /aws|azure|gcp|kubernetes|docker|terraform/i.test(resumeText)
      ? `I have hands-on cloud and infra experience (${skills.includes("AWS") || /aws/i.test(resumeText) ? "AWS" : "cloud"}, containers, CI/CD, databases, and production support).`
      : "I have hands-on experience deploying and operating services with modern cloud, containers, CI/CD, and monitoring.",
    microservices: /microservice|redis|kubernetes|docker|production/i.test(resumeText)
      ? "Yes. I've worked on service-based systems with APIs, databases, caches, CI/CD, logs, and monitoring. I troubleshoot by checking logs, metrics, recent deploys, and validating fixes in staging or production."
      : "Yes. I've supported production systems and debug issues using logs, metrics, recent changes, and careful validation before/after fixes.",
    workAuth,
    location,
    salary,
    startDate,
    sponsorship,
  };
}
