"use strict";

/**
 * SuccessFactors career hub / login has no jobReqId. Nav chrome must not
 * become the job title or lock a fake posting.
 */
module.exports = {
  name: "SuccessFactors — refuse careers hub without jobReqId",
  url: "https://career8.successfactors.com/careers?company=Grainger",
  html: `<!doctype html>
<html>
<head><title>Careers</title></head>
<body>
  <h1>Already have an account?</h1>
  <nav>About Us Inclusion, Opportunity What we do Working with us</nav>
  <a>Sign in</a>
</body>
</html>`,
  expected: {
    company: "Grainger",
    role: "Unknown role",
    source: "successfactors",
    jobKey: null,
    captureConfidence: "low",
  },
};
