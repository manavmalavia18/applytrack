"use strict";

module.exports = {
  name: "Pinpoint HQ — desmos.pinpointhq.com posting via JSON-LD JobPosting",
  url: "https://desmos.pinpointhq.com/en/postings/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  html: `<!doctype html>
<html>
<head><title>Software Engineer, Remote | Desmos Studio PBC Careers</title></head>
<body>
  <script type="application/ld+json">${JSON.stringify({
    "@type": "JobPosting",
    title: "Software Engineer, Remote",
    hiringOrganization: { name: "Desmos Studio PBC" },
  })}</script>
</body>
</html>`,
  expected: {
    company: "Desmos Studio PBC",
    role: "Software Engineer, Remote",
    source: "pinpoint",
    jobKey: "pinpoint:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  },
};
