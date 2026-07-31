"use strict";

module.exports = {
  name: "UKG/UltiPro tos1002tabs tenant — company Toshiba, not Tostabs",
  url: "https://recruiting.ultipro.com/tos1002tabs/JobBoard/OpportunityDetail?opportunityId=98765",
  html: `<!doctype html>
<html>
<head><title>Software Engineer II | tos1002tabs</title></head>
<body>
  <h1>Software Engineer II</h1>
</body>
</html>`,
  expected: {
    company: "Toshiba",
    role: "Software Engineer II",
    source: "ultipro",
    jobKey: "ultipro:98765",
  },
};
