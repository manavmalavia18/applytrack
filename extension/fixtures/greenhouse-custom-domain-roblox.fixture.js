"use strict";

module.exports = {
  name: "Greenhouse custom domain — careers.roblox.com (company Roblox, not Careers)",
  url: "https://careers.roblox.com/jobs?gh_jid=6234567",
  html: `<!doctype html>
<html>
<head><title>Software Engineer, User Frameworks | Roblox</title></head>
<body>
  <header><a href="/">Careers</a></header>
  <h1 class="app-title">Software Engineer, User Frameworks</h1>
</body>
</html>`,
  expected: {
    company: "Roblox",
    role: "Software Engineer, User Frameworks",
    source: "greenhouse",
    jobKey: "greenhouse:6234567",
  },
};
