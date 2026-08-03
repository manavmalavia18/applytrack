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

  ashby: {
    /**
     * Ashby headers/titles often append the company:
     * "Software Engineer, AI Research & Prototyping @ Sage Care Inc"
     */
    scrubRole(t) {
      let s = (t || "").trim().replace(/\s+/g, " ");
      // "Role @ Company"
      s = s.replace(/\s+@\s+.+$/i, "").trim();
      // "Role at Company Inc/LLC/…" (avoid bare "at Scale"-style titles)
      s = s
        .replace(
          /\s+at\s+.+?\s+(Inc\.?|LLC|L\.?L\.?C\.?|Ltd\.?|Corp\.?|Corporation|Company|Group|Co\.?)\.?$/i,
          "",
        )
        .trim();
      // Trailing " – Company Inc" / " | Company LLC"
      s = s
        .replace(
          /\s*[-–—|]\s*[A-Z][\w.&'’\-]*(?:\s+[\w.&'’\-]+){0,6}\s+(Inc\.?|LLC|L\.?L\.?C\.?|Ltd\.?|Corp\.?|Corporation|Company|Group|Co\.?)\.?$/i,
          "",
        )
        .trim();
      return s;
    },
    isWeakCompany(t) {
      return /^ashby$/i.test(t);
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
      const s = (t || "").trim();
      if (!s) return true;
      if (/\bcareers?\s*$/i.test(s)) return true;
      // Brand / legal entity mistaken for a title (e.g. "The Kroger Co.")
      if (
        /^(the\s+)?[\w.&'’\-]+(?:\s+[\w.&'’\-]+){0,5}\s+(co\.?|inc\.?|llc|ltd\.?|corp\.?|corporation|company|group)\.?$/i.test(
          s,
        )
      ) {
        return true;
      }
      if (
        /\b(inc\.?|llc|ltd\.?|corp\.?|corporation|co\.)\s*$/i.test(s) &&
        !/\b(engineer|developer|analyst|manager|intern|director|specialist|architect|scientist|designer|lead|associate|consultant|coordinator|officer|programmer)\b/i.test(
          s,
        )
      ) {
        return true;
      }
      // Company + country mistaken for a title (e.g. "GM Financial United States")
      if (
        /\b(united states|united kingdom|canada|australia|germany|india)\s*$/i.test(s) &&
        !/\b(engineer|developer|analyst|manager|intern|director|specialist|architect|scientist|designer|lead|associate|consultant|coordinator|officer|programmer)\b/i.test(
          s,
        )
      ) {
        return true;
      }
      return false;
    },
    isWeakCompany(t) {
      const s = (t || "").trim();
      // Never use SaaS tenant host / Oracle product / opaque tenant codes (hcgn, eluq, …)
      return (
        /^fa[-_]/i.test(s) ||
        /saasfaprod/i.test(s) ||
        /oraclecloud/i.test(s) ||
        /^oracle(\s+cloud)?(\s+hcm)?(\s+career)?$/i.test(s) ||
        /^[a-z]{2,6}$/i.test(s) || // bare tenant labels like hcgn / eluq
        /^(my\s*)?profile|candidate\s*experience|my\s*applications$/i.test(s)
      );
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
      // Org/client ids in the path (e.g. /fng/119397/jobs/…) are never company names
      if (/^\d+$/.test(c)) return "";
      // Portal / apply-wizard path chrome (e.g. …/hightower/candidateportal/jobs/…)
      if (
        /^(candidate\s*portal|manual(\s*application)?|apply|jobs?|portal|home|sign[\s-]?in|my\s*profile|application)$/i.test(
          c,
        ) ||
        /^(en|fr|es|de|pt)([\s\-_][a-z]{2})?$/i.test(c)
      ) {
        return "";
      }
      // Broken header alts like "Bank Mid 200"
      if (/^bankmid\d+$/i.test(compact) || /^bank\s*mid\s*\d+$/i.test(c)) return "Bank Midwest";
      if (/^bankmidwest$/i.test(compact) || /^bank\s*midwest$/i.test(c)) return "Bank Midwest";
      if (/^nbhbank$/i.test(compact) || /^nbh\s*bank$/i.test(c)) return "NBH Bank";
      // Short client codes → known brands (map key only; never leave as final name)
      if (/^fng$/i.test(compact)) return "Flex-N-Gate";
      if (/^flex[\s\-]*n[\s\-]*gate$/i.test(c)) return "Flex-N-Gate";
      return c;
    },
    isWeakRole(t) {
      return /^(search jobs|sign in|careers|job description|apply|save|share|posted|this is a virtual position|manual application|manual apply|application form|candidate profile)$/i.test(
        t,
      );
    },
    isWeakCompany(t) {
      const c = (t || "").trim();
      const compact = c.replace(/\s/g, "");
      // Pure digits (path org ids) and opaque short client codes (fng) are never final company
      // Also reject portal/wizard path segments mistaken for the employer
      return (
        /^dayforce$/i.test(c) ||
        /^bank\s*mid\s*\d+$/i.test(c) ||
        /^\d+$/.test(c) ||
        /^[a-z]{2,4}$/i.test(c) ||
        /^(candidate\s*portal|manual(\s*application)?|apply|jobs?|portal|home|sign[\s-]?in|my\s*profile|application)$/i.test(
          c,
        ) ||
        /^candidateportal$/i.test(compact) ||
        /^manualapplication$/i.test(compact) ||
        /^(en|fr|es|de|pt)([\s\-_][a-z]{2})?$/i.test(c)
      );
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

  teamtailor: {
    scrubCompany(t) {
      const c = (t || "").trim().replace(/\s+/g, " ");
      if (/^loadup$/i.test(c) || /^goloadup$/i.test(c.replace(/\s/g, ""))) {
        return "LoadUp Technologies";
      }
      return c;
    },
    isWeakRole(t) {
      return /^(apply now|who we are|about the role|what you('|’)ll do|what you bring|cookie|accept all|department|locations|our purpose|already working|this website uses cookies)$/i.test(
        t,
      );
    },
    isWeakCompany(t) {
      return /^teamtailor$/i.test(t);
    },
  },

  smartrecruiters: {
    scrubCompany(t) {
      const c = (t || "").trim().replace(/\s+/g, " ");
      if (/^abbvie$/i.test(c)) return "AbbVie";
      return c;
    },
    isWeakRole(t) {
      const s = (t || "").trim();
      // oneclick-ui injects a browser-support banner that often lands in <h1>
      if (
        /internet explorer|no longer supported|browser (is )?not supported|\bie\s*11\b|unsupported browser|upgrade your browser/i.test(
          s,
        )
      ) {
        return true;
      }
      return /^(i'?m interested|refer a friend|company description|job description|about |other jobs|apply|share|salary|hybrid mode|full[- ]?time|workday global grade|oneclick|start application)$/i.test(
        s,
      );
    },
    isWeakCompany(t) {
      return /^smartrecruiters$/i.test(t) || /^oneclick(-ui)?$/i.test(t);
    },
  },

  lever: {
    scrubCompany(t) {
      let c = (t || "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\s+logo$/i, "")
        .trim();
      const compact = c.replace(/\s/g, "");
      if (/^atomcomputing$/i.test(compact) || /^atom\s*computing$/i.test(c)) {
        return "Atom Computing";
      }
      return c;
    },
    isWeakCompany(t) {
      const s = (t || "").trim();
      // Never use Lever host labels as the employer
      if (/^(jobs|lever|www)$/i.test(s)) return true;
      // Job titles mistaken for company (old title-parse / bad locks)
      if (
        /\b(engineer|developer|scientist|analyst|manager|designer|architect|specialist|director|intern|coordinator|consultant|officer|associate|recruiter)\b/i.test(
          s,
        )
      ) {
        return true;
      }
      return false;
    },
  },

  /**
   * UKG Pro / UltiPro — recruiting.ultipro.com/{tenant}/JobBoard/...
   * Opaque tenants (tos1002tabs) must never become fake companies (Tostabs).
   */
  ultipro: {
    scrubCompany(t) {
      let c = (t || "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\s+logo$/i, "")
        .replace(/^logo\s+(of\s+)?/i, "")
        .trim();
      const compact = c.replace(/\s/g, "");
      if (
        /^(toshiba|tostabs|tos1002tabs)$/i.test(compact) ||
        /^toshiba$/i.test(c)
      ) {
        return "Toshiba";
      }
      if (
        /^(powersecure|powpows|pow1009pows)$/i.test(compact) ||
        /^power\s*secure$/i.test(c)
      ) {
        return "PowerSecure";
      }
      // ALL-CAPS logo alts → Title case
      if (/^[A-Z0-9][A-Z0-9 .&'’-]*$/.test(c) && /[A-Z]/.test(c) && c.length <= 40) {
        c = c
          .toLowerCase()
          .replace(/\b\w/g, (ch) => ch.toUpperCase())
          .trim();
      }
      return c;
    },
    isWeakCompany(t) {
      const s = (t || "").trim();
      const compact = s.replace(/\s/g, "");
      if (/^(ukg|ultipro|ulti\s*pro)$/i.test(s)) return true;
      // Opaque tenant path segments
      if (/^[a-z]{2,}\d+[a-z]{2,}$/i.test(compact)) return true;
      if (/^[a-z0-9]{6,}$/i.test(compact) && /\d/.test(compact) && /[a-z]/i.test(compact)) {
        return true;
      }
      // Digit-stripped mangled tenants (tos1002tabs → Tostabs)
      if (/^(tostabs|powpows)$/i.test(compact)) return true;
      return false;
    },
  },

  /**
   * Pinpoint HQ — {org}.pinpointhq.com/en/postings/{uuid}
   * Prefer brand logo / JSON-LD over subdomain slug.
   */
  pinpoint: {
    scrubCompany(t) {
      let c = (t || "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\s*[-–—|]\s*(home|logo|careers?)\s*$/i, "")
        .replace(/\s+careers?\s*$/i, "")
        .trim();
      const compact = c.replace(/\s/g, "");
      if (/^desmosstudio(pbc)?$/i.test(compact) || /^desmos\s*studio(\s*pbc)?$/i.test(c)) {
        return "Desmos Studio PBC";
      }
      return c;
    },
    isWeakRole(t) {
      return /^(apply now|department|employment type|location|workplace type|compensation|cookie|accept all|view all opportunities|register your interest|not quite right)$/i.test(
        t,
      );
    },
    isWeakCompany(t) {
      return /^pinpoint(hq)?$/i.test(t) || /^careers?$/i.test(t);
    },
  },

  /**
   * Rippling ATS — ats.rippling.com/{locale}/{board}/jobs/{uuid}
   * Prefer visible brand / NEXT_DATA companyName over board slug or host "ats".
   */
  rippling: {
    scrubCompany(t) {
      let c = (t || "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\s+logo$/i, "")
        .replace(/^logo\s+(of\s+)?/i, "")
        .replace(/\s*[-–—|]\s*(home|careers?|recruiting)\s*$/i, "")
        .replace(/\s+(careers?|recruiting)\s*$/i, "")
        .trim();
      // og:site_name / product chrome
      if (/^rippling(\s+recruiting)?$/i.test(c)) return "";
      return c;
    },
    isWeakRole(t) {
      const s = (t || "").trim();
      if (
        /^(apply now|apply|department|engineering|location|employment type|compensation|cookie|accept all|careers?|jobs?|home|sign in|submit application)$/i.test(
          s,
        )
      ) {
        return true;
      }
      // Bare department labels mistaken for titles
      if (/^(engineering|foundational|product|design|sales|marketing|operations|finance|people|hr|legal|support)$/i.test(s)) {
        return true;
      }
      return false;
    },
    isWeakCompany(t) {
      const s = (t || "").trim();
      // Never host / product chrome — board slugs (joinroot) are last-resort only in the parser
      return /^(rippling(\s+recruiting)?|ats|www|careers?|jobs?)$/i.test(s);
    },
  },

  /**
   * Greenhouse embeds on custom career sites often paint "Loading job details"
   * in the parent frame while the real title lives in a cross-origin iframe.
   * Custom domains (careers.roblox.com?gh_jid=…) must not lock nav chrome as company.
   */
  greenhouse: {
    scrubCompany(t) {
      let c = (t || "").trim().replace(/\s+/g, " ");
      // Nav phrases — drop entirely (do not strip to "Early")
      if (/^early careers?$/i.test(c) || /^work at .+$/i.test(c)) return "";
      c = c
        .replace(/\s+logo$/i, "")
        .replace(/^logo\s+(of\s+)?/i, "")
        .replace(/\s*[-–—|]\s*(home|logo|careers?|jobs?|recruiting)\s*$/i, "")
        .replace(/\s+(corporate|careers?|jobs?|recruiting)\s*$/i, "")
        .trim();
      const compact = c.replace(/\s/g, "");
      if (/^laika$/i.test(c)) return "LAIKA";
      if (/flock\s*homes/i.test(c) || /^flockhomes$/i.test(compact)) return "Flock Homes";
      return c;
    },
    isWeakRole(t) {
      return /^loading(\s+job\s+details?)?\b/i.test(t) || /^job details$/i.test(t);
    },
    isWeakCompany(t) {
      const s = (t || "").trim();
      if (!s) return true;
      // Nav / career-site chrome — never the employer (careers.roblox.com → "Careers")
      if (
        /^(careers?|jobs?|opportunities|newsroom|home|about|overview|early careers?|work at .+|all jobs|job boards?|greenhouse)$/i.test(
          s,
        )
      ) {
        return true;
      }
      return false;
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
    /^(bamboohr|greenhouse|lever|ashby|workday|icims|oracle|successfactors|paylocity|ultipro|ukg|phenom|workable|salesforce|simplify|applytrack|pinpoint|pinpointhq|rippling|selector software|career center|recruitment)$/i.test(
      t,
    )
  ) {
    return true;
  }
  // Custom Greenhouse parents often show "Loading job details" before the embed paints
  if (/^loading\b/i.test(t) || /^please wait\b/i.test(t)) return true;
  return /^(you have applied for|thank you|thanks for applying|enter your (information|info)|create (a |your )?login|connect your account|sign in|log in|login|resume( upload)?|personal information|additional information|work experience|education|equal opportunity|review|application( form)?|my profile|work summary|demographics|preferences|candidate(\s+profile)?|profile|follow your application|careers?|jobs?|career center|manual application|manual apply|start (your )?application|submit application)\b/i.test(
    t,
  );
}

function isWeakCompanyBase(company) {
  const t = (company || "").trim();
  if (!t || t.length < 2) return true;
  return /^(unknown|greenhouse|ashby|lever|workday|icims|oracle|successfactors|paylocity|ultipro|ukg|web|careers?|pinpoint|pinpointhq|rippling|ats)\b/i.test(
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

/**
 * Apply/wizard/thank-you surfaces — form steps, oneclick banners, and confirmation
 * pages. Shared by the merge path so a fresh (even non-"weak") parse of page chrome
 * never displaces an already-usable session lock while the candidate is mid-flow.
 * @param {string} url
 * @param {string} [source]
 * @param {string} [text] optional page text/title for thank-you copy detection
 */
const WIZARD_URL_RE =
  /\/apply\b|\/application\b|\/applications\/new|\/oneclick-ui\/|manualapplication|applicationsubmitted|application-submitted|\/submit(ted)?\b|thank-?you|\/candidateportal\/[^/]*\/apply/i;

const ATS_WIZARD_URL_PATTERNS = {
  dayforce: /\/apply\b|manualapplication|\/candidateportal\/[^/]*\/apply/i,
  smartrecruiters: /\/oneclick-ui\/|\/application\b/i,
  lever: /\/apply\b/i,
  greenhouse: /\/apply\b|applicationsubmitted|thank-?you/i,
  ashby: /\/application\b|\/apply\b/i,
  workday: /\/apply\b|createaccount/i,
  taleo: /application\.jss|\/apply\b/i,
  ultipro: /opportunityapply|\/application\b/i,
  icims: /\/apply\b|jobsummary/i,
  rippling: /\/apply\b|\/applications?\b/i,
  pinpoint: /\/applications\/new/i,
  teamtailor: /\/applications?\b/i,
  workable: /\/apply\b|\/candidates\b/i,
  oracle: /\/apply\b|applicantflow|\/my-profile\b|\/myapplications\b/i,
  paycom: /\/apply\b/i,
};

const THANK_YOU_TEXT_RE =
  /thank you for (your application|applying)|thanks for applying|application (submitted|received|complete)|you('ve| have) successfully applied|your application (has been|was) (submitted|received)/i;

function isApplicationWizardPage(url, source, text) {
  const href = String(url || "");
  let path = href;
  try {
    path = new URL(href, "https://x.invalid").pathname;
  } catch {
    /* keep raw href as fallback */
  }
  if (WIZARD_URL_RE.test(href) || WIZARD_URL_RE.test(path)) return true;
  const extra = source && ATS_WIZARD_URL_PATTERNS[source];
  if (extra && (extra.test(href) || extra.test(path))) return true;
  if (text && THANK_YOU_TEXT_RE.test(String(text))) return true;
  return false;
}

/** Apply source-specific scrubbers to a parsed payload. */
function normalizeParsed(parsed) {
  if (!parsed?.source) return parsed;
  const role = scrubRole(parsed.role, parsed.source) || parsed.role;
  const company = scrubCompany(parsed.company, parsed.source) || parsed.company;
  if (role === parsed.role && company === parsed.company) return parsed;
  return { ...parsed, role, company };
}
