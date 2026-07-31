"use strict";

module.exports = {
  name: "SmartRecruiters oneclick-ui — IE11 banner must not become the role",
  url: "https://www.smartrecruiters.com/oneclick-ui/company/AbbVie/publication/3743990014350476",
  html: `<!doctype html>
<html>
<head><title>Internet Explorer is no longer supported</title></head>
<body>
  <h1>Your browser is not supported. Please upgrade.</h1>
</body>
</html>`,
  expected: {
    company: "AbbVie",
    role: "Unknown role",
    source: "smartrecruiters",
    jobKey: "smartrecruiters:3743990014350476",
  },
};
