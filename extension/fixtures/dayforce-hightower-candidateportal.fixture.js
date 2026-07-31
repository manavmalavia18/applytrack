"use strict";

module.exports = {
  name: "Dayforce hightower/candidateportal apply wizard — company Hightower, not Candidateportal",
  url: "https://jobs.dayforcehcm.com/hightower/candidateportal/jobs/8627/apply/manualApplication",
  html: `<!doctype html>
<html>
<head><title>Field Service Technician</title></head>
<body>
  <h1>Field Service Technician</h1>
</body>
</html>`,
  expected: {
    company: "Hightower",
    role: "Field Service Technician",
    source: "dayforce",
    jobKey: "dayforce:hightower:8627",
  },
};
