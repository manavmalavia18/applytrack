"use strict";

/**
 * SuccessFactors often paints nav/wizard chrome in <h1> ("Quick links",
 * "Let's begin! …") while the real title lives in JSON-LD / .jobTitle and
 * the employer is in ?company= — never lock ATS chrome or "SuccessFactors".
 */
module.exports = {
  name: "SuccessFactors — reject Quick links / Let's begin chrome, keep SAP title",
  url: "https://career2.successfactors.eu/career?company=SAP&career_job_req_id=5123456&navBarLevel=JOB_SEARCH",
  html: `<!doctype html>
<html>
<head>
  <title>Careers</title>
  <meta property="og:site_name" content="SuccessFactors" />
  <script type="application/ld+json">${JSON.stringify({
    "@type": "JobPosting",
    title: "Forward Deployed AI Engineer",
    hiringOrganization: { name: "SAP" },
  })}</script>
</head>
<body>
  <h1>Quick links</h1>
  <h2>Let's begin! Software Engineer</h2>
  <div class="jobTitle">Forward Deployed AI Engineer</div>
  <nav>My Applications · Cookie · Accept all</nav>
</body>
</html>`,
  expected: {
    company: "SAP",
    role: "Forward Deployed AI Engineer",
    source: "successfactors",
    jobKey: "successfactors:5123456",
  },
};
