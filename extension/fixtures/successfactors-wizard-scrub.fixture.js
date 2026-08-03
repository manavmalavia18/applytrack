"use strict";

/**
 * When JSON-LD is missing, scrub "Let's begin!" from the heading and use
 * ?company= — never fall back to hostname "SuccessFactors".
 */
module.exports = {
  name: "SuccessFactors — scrub Let's begin prefix; company from URL param",
  url: "https://career2.successfactors.com/career?company=SAP&jobId=9988776",
  html: `<!doctype html>
<html>
<head><title>Let's begin! Software Engineer | Careers</title></head>
<body>
  <h1>Let's begin! Software Engineer</h1>
  <p>Apply to join the team.</p>
</body>
</html>`,
  expected: {
    company: "SAP",
    role: "Software Engineer",
    source: "successfactors",
    jobKey: "successfactors:9988776",
  },
};
