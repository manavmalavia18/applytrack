"use strict";

module.exports = {
  name: "UKG/UltiPro one1018onso confirmation — company OneStream, not Firefox logo alt",
  url: "https://recruiting.ultipro.com/one1018onso/JobBoard/1955ffa6-bda6-4c95-8412-2c731d693ab2/OpportunityApply/ApplicationSubmitted?applicationId=34545e53-84b6-4bf0-9aeb-26b9a0155ae6",
  html: `<!doctype html>
<html>
<head><title>You have applied for Software Engineer I</title></head>
<body>
  <h1>You have applied for Software Engineer I</h1>
  <p>Thank you! Your application has been submitted.</p>
  <a href="https://www.onestream.com/careers/">Work at OneStream</a>
  <a href="https://www.mozilla.org/en-US/firefox/new/">
    <img alt="Firefox logo" src="/Content/images/browsers/firefox.png" />
    Download Firefox
  </a>
  <a href="https://www.google.com/chrome/browser/">
    <img alt="Chrome logo" src="/Content/images/browsers/chrome.png" />
    Download Chrome
  </a>
</body>
</html>`,
  expected: {
    company: "OneStream",
    role: "Software Engineer I",
    source: "ultipro",
  },
};
