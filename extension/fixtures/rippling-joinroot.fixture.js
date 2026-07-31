"use strict";

module.exports = {
  name: "Rippling ATS — ats.rippling.com job board via __NEXT_DATA__",
  url: "https://ats.rippling.com/joinroot/jobs/11111111-2222-3333-4444-555555555555",
  html: `<!doctype html>
<html>
<head><title>Backend Engineer</title></head>
<body>
  <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        apiData: {
          jobPost: { name: "Backend Engineer", companyName: "Root Insurance" },
        },
      },
    },
  })}</script>
</body>
</html>`,
  expected: {
    company: "Root Insurance",
    role: "Backend Engineer",
    source: "rippling",
    jobKey: "rippling:11111111-2222-3333-4444-555555555555",
  },
};
