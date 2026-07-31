"use strict";

module.exports = {
  name: 'Ashby role with "@ Company" suffix',
  url: "https://jobs.ashbyhq.com/sage-care/1a2b3c4d-5e6f-7890-abcd-ef1234567890",
  html: `<!doctype html>
<html>
<head><title>Software Engineer, AI Research & Prototyping @ Sage Care Inc</title></head>
<body>
  <h1>Software Engineer, AI Research & Prototyping @ Sage Care Inc</h1>
</body>
</html>`,
  expected: {
    company: "Sage Care Inc",
    role: "Software Engineer, AI Research & Prototyping",
    source: "ashby",
    jobKey: "ashby:1a2b3c4d-5e6f-7890-abcd-ef1234567890",
  },
};
