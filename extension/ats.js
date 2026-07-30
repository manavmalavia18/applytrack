/**
 * Per-ATS rules — KEEP FIXES HERE, not in shared lock/merge.
 *
 * Shared code (rememberJob / mergeRememberedJob / isWeakRole base) must stay
 * source-agnostic. When an ATS mis-parses, add scrub/weak rules under that
 * source key only so other ATS types are unaffected.
 *
 * Each entry may define:
 *   scrubRole(role)       → clean a captured title
 *   scrubCompany(company) → clean a captured company
 *   isWeakRole(role)      → extra "don't lock this title" checks
 *   isWeakCompany(company)→ extra "don't lock this company" checks
 */
const ApplyTrackATS = {
  workday: {
    /** "Full Stack Software Engineer II R 108283 1" → title only */
    scrubRole(t) {
      let s = (t || "").trim().replace(/\s+/g, " ");
      // Trailing Workday req: R-108283, R 108283 1, _R-108283-1 (underscore has no \b)
      for (let i = 0; i < 3; i++) {
        const next = s
          .replace(
            /[\s_\-–—]*((?:JR|R|REQ)[-_\s]?\d{3,}(?:[-_\s]\d+)*)\s*$/i,
            "",
          )
          .replace(/\s+/g, " ")
          .trim();
        if (next === s) break;
        s = next;
      }
      return s;
    },
    isWeakRole(t) {
      return /^(start your apply|autofil|my applications|job description|workday|next|submit|review)$/i.test(
        t,
      );
    },
  },

  oracle: {
    scrubRole(t) {
      return (t || "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\s*[-–—|]\s+.+?\s+careers?\s*$/i, "")
        .replace(/\s*[-–—|]\s+[^|–—]+?\s+united states\s*$/i, "")
        .trim();
    },
    scrubCompany(t) {
      return (t || "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\s+technology\s*$/i, "")
        .replace(
          /\s*,?\s*(united states|united kingdom|usa|uk|canada|australia|india|germany)\s*$/i,
          "",
        )
        .trim();
    },
    isWeakRole(t) {
      if (/\bcareers?\s*$/i.test(t)) return true;
      // Company + country mistaken for a title (e.g. "GM Financial United States")
      if (
        /\b(united states|united kingdom|canada|australia|germany|india)\s*$/i.test(t) &&
        !/\b(engineer|developer|analyst|manager|intern|director|specialist|architect|scientist|designer|lead|associate|consultant|coordinator|officer|programmer)\b/i.test(
          t,
        )
      ) {
        return true;
      }
      return false;
    },
    isWeakCompany(t) {
      // SaaS tenant host: FA-EXVU-SAASFAPROD1
      return /^fa[-_]/i.test(t) || /saasfaprod/i.test(t) || /^oracle(\s+career)?$/i.test(t);
    },
  },

  icims: {
    scrubCompany(t) {
      let c = (t || "").trim().replace(/\s+/g, " ");
      // Portal chrome left in the name
      c = c.replace(/^apply\d*\s+/i, "").trim();
      if (/^Alaskaair$/i.test(c)) return "Alaska Airlines";
      if (/^Republicfinance$/i.test(c.replace(/\s/g, ""))) return "Republic Finance";
      if (/publicis\s*groupe/i.test(c) || /^publicisgroupe$/i.test(c.replace(/\s/g, ""))) {
        return "Publicis Groupe";
      }
      return c;
    },
    isWeakCompany(t) {
      return /^apply\d*\b/i.test(t);
    },
  },

  taleo: {
    scrubCompany(t) {
      const c = (t || "").trim().replace(/\s+/g, " ");
      if (/^uhg$/i.test(c) || /^united\s*health(\s*group)?$/i.test(c)) return "UnitedHealth Group";
      if (/^unitedhealthcare$/i.test(c.replace(/\s/g, ""))) return "UnitedHealth Group";
      if (/^optum$/i.test(c)) return "Optum";
      return c;
    },
    isWeakRole(t) {
      // Apply wizard steps — never lock as the job title
      return /^(privacy agreement|welcome\.?|you are not signed in|sign in|select a language|job applicant personal information|personal information handling|my profile|my dashboard|work here|our culture|hiring process|early careers|talent community|questionnaire|eeo|equal opportunity|submit application|review application|attachment|e-?signature)$/i.test(
        t,
      );
    },
    isWeakCompany(t) {
      return /^taleo$/i.test(t);
    },
  },

  dayforce: {
    scrubCompany(t) {
      const c = (t || "").trim().replace(/\s+/g, " ");
      const compact = c.replace(/\s/g, "");
      // Broken header alts like "Bank Mid 200"
      if (/^bankmid\d+$/i.test(compact) || /^bank\s*mid\s*\d+$/i.test(c)) return "Bank Midwest";
      if (/^bankmidwest$/i.test(compact) || /^bank\s*midwest$/i.test(c)) return "Bank Midwest";
      if (/^nbhbank$/i.test(compact) || /^nbh\s*bank$/i.test(c)) return "NBH Bank";
      return c;
    },
    isWeakRole(t) {
      return /^(search jobs|sign in|careers|job description|apply|save|share|posted|this is a virtual position|manual application|manual apply|application form|candidate profile)$/i.test(
        t,
      );
    },
    isWeakCompany(t) {
      return /^dayforce$/i.test(t) || /^bank\s*mid\s*\d+$/i.test(t);
    },
  },

  paycom: {
    scrubCompany(t) {
      return (t || "")
        .trim()
        .replace(/\s+/g, " ")
        // "Fortior Solutions Corporate - Hillsboro, OR 97124"
        .replace(/\s+corporate\s*[-–—].*$/i, "")
        .replace(/\s*[-–—]\s*[A-Za-z .]+,\s*[A-Z]{2}(?:\s+\d{5})?.*$/i, "")
        .trim();
    },
    isWeakRole(t) {
      return /^(overview|description|apply|position type|essential duties|job summary|paycom|full time|part time|search jobs|loading\.{0,3}|please wait)$/i.test(
        t,
      );
    },
    isWeakCompany(t) {
      return /^paycom$/i.test(t);
    },
  },

  // Other sources inherit shared base rules only — add keys when needed.
};

function atsOf(source) {
  if (!source) return null;
  return ApplyTrackATS[source] || null;
}

/** Shared form/vendor chrome — never use as a job title (all ATS). */
function isWeakRoleBase(role) {
  const t = (role || "").trim();
  if (!t || t === "Unknown role") return true;
  if (
    /^(bamboohr|greenhouse|lever|ashby|workday|icims|oracle|successfactors|paylocity|ultipro|ukg|phenom|workable|salesforce|simplify|applytrack|selector software|career center|recruitment)$/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/^loading\.{0,3}$/i.test(t) || /^please wait\b/i.test(t)) return true;
  return /^(you have applied for|thank you|thanks for applying|enter your (information|info)|create (a |your )?login|connect your account|sign in|log in|login|resume( upload)?|personal information|additional information|work experience|education|equal opportunity|review|application( form)?|my profile|work summary|demographics|preferences|candidate(\s+profile)?|profile|follow your application|careers?|jobs?|career center|manual application|manual apply|start (your )?application|submit application)\b/i.test(
    t,
  );
}

function isWeakCompanyBase(company) {
  const t = (company || "").trim();
  if (!t || t.length < 2) return true;
  return /^(unknown|greenhouse|ashby|lever|workday|icims|oracle|successfactors|paylocity|ultipro|ukg|web|career)\b/i.test(
    t,
  );
}

/** @param {string} role @param {string} [source] */
function isWeakRole(role, source) {
  if (isWeakRoleBase(role)) return true;
  const ats = atsOf(source);
  return Boolean(ats?.isWeakRole?.(role));
}

/** @param {string} company @param {string} [source] */
function isWeakCompany(company, source) {
  if (isWeakCompanyBase(company)) return true;
  const ats = atsOf(source);
  return Boolean(ats?.isWeakCompany?.(company));
}

function scrubRole(role, source) {
  const ats = atsOf(source);
  if (ats?.scrubRole) return ats.scrubRole(role);
  return (role || "").trim().replace(/\s+/g, " ");
}

function scrubCompany(company, source) {
  const ats = atsOf(source);
  if (ats?.scrubCompany) return ats.scrubCompany(company);
  return (company || "").trim().replace(/\s+/g, " ");
}

/** Apply source-specific scrubbers to a parsed payload. */
function normalizeParsed(parsed) {
  if (!parsed?.source) return parsed;
  const role = scrubRole(parsed.role, parsed.source) || parsed.role;
  const company = scrubCompany(parsed.company, parsed.source) || parsed.company;
  if (role === parsed.role && company === parsed.company) return parsed;
  return { ...parsed, role, company };
}
