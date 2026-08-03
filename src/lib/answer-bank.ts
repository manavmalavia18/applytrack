/**
 * Non-LLM answer-bank matcher: maps scraped application-question labels to
 * canned answers a user pre-writes once in their profile. No AI/model calls.
 */

export const ANSWER_BANK_KEYS = [
  "whyCompany",
  "whyRole",
  "whyLooking",
  "proudWork",
  "aiExperience",
  "startupExperience",
  "testing",
  "cloud",
  "microservices",
  "workAuth",
  "location",
  "salary",
  "startDate",
  "sponsorship",
] as const;

export type AnswerBankKey = (typeof ANSWER_BANK_KEYS)[number];

export type AnswerBank = Partial<Record<AnswerBankKey, string>>;

export type AnswerBankFieldMeta = {
  key: AnswerBankKey;
  label: string;
  placeholder: string;
  templated?: boolean;
};

/**
 * UI metadata + example placeholders shown in the Profile editor.
 * These are examples only — never written to the DB unless the user hits Save.
 */
export const ANSWER_BANK_FIELDS: AnswerBankFieldMeta[] = [
  {
    key: "whyCompany",
    label: "Why this company",
    templated: true,
    placeholder:
      "I'm interested in [Company] because the work feels practical, technical, and impactful. The role matches my background in full-stack development, backend systems, cloud, CI/CD, production support, and startup environments, and I'd be excited to help build reliable software for real users.",
  },
  {
    key: "whyRole",
    label: "Why this role",
    templated: true,
    placeholder:
      "I'm applying because this [Role] role matches the work I want to keep growing in: building reliable software, solving practical problems, and supporting production systems. My recent startup experience has prepared me to take ownership, move quickly, and contribute across frontend, backend, cloud, and debugging work.",
  },
  {
    key: "whyLooking",
    label: "Why looking / leaving current role",
    placeholder:
      "I'm currently employed, but I'm exploring long-term opportunities with more ownership, growth, and larger-scale software work.",
  },
  {
    key: "proudWork",
    label: "Proudest project / accomplishment",
    placeholder:
      "One thing I'm proud of is building DebugPilot, an AI-powered DevOps debugger that turns Kubernetes, Terraform, and CI/CD logs into root-cause diagnoses and fix steps. I built the backend, React UI, AI/RAG workflow, caching, ingestion, and deployment.",
  },
  {
    key: "aiExperience",
    label: "AI / ML / LLM experience",
    placeholder:
      "I have experience building AI/RAG workflows using Claude, OpenAI, LangChain, FastEmbed, vector databases, and Python/FastAPI. My main project was DebugPilot, which analyzes infrastructure logs and returns root-cause diagnoses, debug commands, and fix steps.",
  },
  {
    key: "startupExperience",
    label: "Startup / fast-paced experience",
    placeholder:
      "I've worked at startups including PittBos and Allthenticate, where I learned to take ownership, move quickly, work across the stack, and support real users in production. I'm comfortable with ambiguity, fast releases, debugging, and helping wherever the team needs support.",
  },
  {
    key: "testing",
    label: "Testing / QA experience",
    placeholder:
      "Yes. I write automated tests as a normal part of my work. I've used Playwright and Cypress for regression and end-to-end testing across React workflows, forms, authentication flows, API-driven pages, and staging validation.",
  },
  {
    key: "cloud",
    label: "Cloud (AWS/Azure/GCP) experience",
    placeholder:
      "I have hands-on cloud experience with AWS, Azure, Docker, Kubernetes, CI/CD, databases, monitoring, and production support. I've used services like EC2, RDS, ElastiCache, S3, CloudWatch, EKS, Cognito, Azure App Services, Azure SQL, Azure Functions, Azure DevOps pipelines, and Application Insights.",
  },
  {
    key: "microservices",
    label: "Microservices / production debugging",
    placeholder:
      "Yes. I've worked on microservice-based systems involving REST APIs, databases, Redis, Docker, Kubernetes, AWS, CI/CD, logs, and monitoring. I usually troubleshoot by checking logs, metrics, recent deployments, API errors, database/cache behavior, and then validating fixes through staging or production monitoring.",
  },
  {
    key: "workAuth",
    label: "Work authorization status",
    placeholder:
      "Yes. I am currently authorized to work in the U.S. on F-1 STEM OPT, but I would require future employer sponsorship, such as H-1B, to continue working long term.",
  },
  {
    key: "location",
    label: "Location / relocation / remote",
    placeholder:
      "I'm open to roles anywhere in the United States — remote, hybrid, or willing to relocate.",
  },
  {
    key: "salary",
    label: "Salary / compensation expectations",
    placeholder: "Open to discussing based on role, level, and location.",
  },
  {
    key: "startDate",
    label: "Start date / availability",
    placeholder: "I can start within 2 weeks of an offer.",
  },
  {
    key: "sponsorship",
    label: "Visa sponsorship needs",
    placeholder:
      "I am on F-1 STEM OPT now and will need future H-1B sponsorship for long-term employment.",
  },
];

const FIELD_META_BY_KEY = new Map(ANSWER_BANK_FIELDS.map((f) => [f.key, f]));

/** Ordered rules — first pattern match wins. More specific keys come first. */
const MATCH_RULES: { key: AnswerBankKey; pattern: RegExp }[] = [
  { key: "sponsorship", pattern: /\bsponsor(ship|ed|ing)?\b/i },
  {
    key: "workAuth",
    pattern:
      /(authoriz\w*\s*to\s*work|work\s*authoriz|work\s*permit|\bvisa\b|\bopt\b|\bh-?1b\b|\bcpt\b|legally\s*(authorized|eligible)|employment\s*eligib)/i,
  },
  {
    key: "location",
    pattern:
      /(relocat|willing\s*to\s*(move|relocate)|open\s*to\s*relocation|remote\s*work|current\s*location|where\s*(are\s*you\s*)?(currently\s*)?(based|located)|city\s*(and|&)\s*state|onsite|hybrid|time\s*zone)/i,
  },
  {
    key: "salary",
    pattern:
      /(salary|compensation|expected\s*(pay|salary)|pay\s*range|desired\s*(salary|compensation)|expect\s*to\s*make|rate\s*expectation)/i,
  },
  {
    key: "startDate",
    pattern:
      /(start\s*date|available\s*to\s*start|notice\s*period|when\s*can\s*you\s*start|earliest\s*(start|availability))/i,
  },
  {
    key: "aiExperience",
    pattern:
      /(\bai\b|\bllm\b|machine\s*learning|generative\s*ai|artificial\s*intelligence|large\s*language\s*model)/i,
  },
  {
    key: "testing",
    pattern: /(\btest(ing)?\b|playwright|cypress|selenium|\bqa\b|quality\s*assurance|test\s*automation)/i,
  },
  {
    key: "cloud",
    pattern: /(\baws\b|\bazure\b|\bgcp\b|google\s*cloud|amazon\s*web\s*services|cloud\s*(infrastructure|platform|native))/i,
  },
  {
    key: "microservices",
    pattern: /(microservice|production\s*(debug|incident)|distributed\s*system|on-?call|incident\s*response)/i,
  },
  {
    key: "startupExperience",
    pattern: /(startup|early-stage|fast-paced\s*(startup|environment))/i,
  },
  {
    key: "proudWork",
    pattern: /(proud|accomplishment|project\s*you.?re\s*proud|greatest\s*achievement|proudest|something\s*you\s*built|biggest\s*challenge)/i,
  },
  {
    key: "whyLooking",
    pattern:
      /(why\s*(are\s*you\s*)?leaving|looking\s*for\s*(a\s*)?new|seeking\s*(a\s*)?new\s*opportunit|why\s*(are\s*you\s*)?job.?search|reason\s*for\s*leaving|why\s*(do\s*you\s*want\s*to\s*)?(leave|change)\s*(your\s*)?(current\s*)?(job|role|company))/i,
  },
  {
    key: "whyRole",
    pattern:
      /(why.*(this|the)\s*(role|position|job)|why\s*(do\s*you\s*want|would\s*you\s*like)\s*this\s*role|what\s*interests\s*you\s*(about|in)\s*this\s*(role|position)|why\s*(are\s*you\s*)?interested\s*in\s*(this|the)\s*(role|position)|why\s*(do\s*you\s*)?want\s*(this|to\s*work\s*in\s*this)\s*(role|position)|why\s*apply)/i,
  },
  {
    key: "whyCompany",
    pattern:
      /(why.*(this\s*company|working\s*(here|at)|join(ing)?\s*(us|the\s*team)|work\s*for\s*us|our\s*(company|team)|about\s*(working\s*at|joining))|what\s*(interests|attracts)\s*you\s*(about|to)\s*(us|this\s*company)|why\s*(do\s*you\s*want\s*to\s*work|are\s*you\s*interested\s*in\s*working)\s*(here|at))/i,
  },
];

function normalize(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns the first matching answer-bank key for a scraped question label, or null. */
export function matchQuestionKey(label: string): AnswerBankKey | null {
  const q = normalize(label);
  if (!q) return null;
  for (const rule of MATCH_RULES) {
    if (rule.pattern.test(q)) return rule.key;
  }
  return null;
}

/** Replace [Company]/[COMPANY]/[Role]/[ROLE] (and lowercase variants) with real values. */
export function renderTemplate(text: string, vars: { company?: string; role?: string }): string {
  const company = (vars.company || "").trim();
  const role = (vars.role || "").trim();
  let out = text;
  if (company) {
    out = out.replace(/\[company\]/gi, (m) => (m === m.toUpperCase() ? company.toUpperCase() : company));
  }
  if (role) {
    out = out.replace(/\[role\]/gi, (m) => (m === m.toUpperCase() ? role.toUpperCase() : role));
  }
  return out;
}

/** Very small, deterministic heuristic — first substantive line of the JD, no LLM. */
function extractJdHighlight(jobDescription: string | undefined): string | null {
  if (!jobDescription) return null;
  const lines = jobDescription
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const heading = /^(about|who we are|overview|responsibilities|requirements|qualifications|benefits|perks|what you.?ll do|why join)\b/i;
  for (const line of lines) {
    if (line.length < 40 || line.length > 220) continue;
    if (heading.test(line)) continue;
    if (/^[A-Z\s&/-]+$/.test(line)) continue; // all-caps heading
    return line.replace(/\s+/g, " ");
  }
  return null;
}

export type FillQuestion = { id: string; label: string; currentValue?: string };
export type FillContext = { company?: string; role?: string; jobDescription?: string };
export type FillMatch = { id: string; label: string; answer: string; source: "bank"; key: AnswerBankKey };
export type FillUnmatched = { id: string; label: string };

export function isAnswerBankEmpty(bank: AnswerBank | null | undefined): boolean {
  if (!bank) return true;
  return !Object.values(bank).some((v) => typeof v === "string" && v.trim().length > 0);
}

export function fillFromAnswerBank(
  questions: FillQuestion[],
  bank: AnswerBank,
  ctx: FillContext = {},
): { matched: FillMatch[]; unmatched: FillUnmatched[] } {
  const matched: FillMatch[] = [];
  const unmatched: FillUnmatched[] = [];

  for (const q of questions) {
    const key = matchQuestionKey(q.label);
    const raw = key ? bank[key] : undefined;
    if (!key || !raw || !raw.trim()) {
      unmatched.push({ id: q.id, label: q.label });
      continue;
    }

    let answer = renderTemplate(raw.trim(), { company: ctx.company, role: ctx.role });

    if ((key === "whyCompany" || key === "whyRole") && ctx.jobDescription) {
      const highlight = extractJdHighlight(ctx.jobDescription);
      if (highlight) {
        answer += `\n\nWhat caught my eye in the posting: "${highlight}"`;
      }
    }

    matched.push({ id: q.id, label: q.label, answer, source: "bank", key });
  }

  return { matched, unmatched };
}

export function fieldMeta(key: AnswerBankKey): AnswerBankFieldMeta | undefined {
  return FIELD_META_BY_KEY.get(key);
}
