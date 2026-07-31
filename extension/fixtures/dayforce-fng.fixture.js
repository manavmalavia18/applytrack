"use strict";

module.exports = {
  name: "Dayforce fng/119397 path — company Flex-N-Gate, not 119397",
  url: "https://jobs.dayforcehcm.com/en-US/fng/119397/jobs/14233",
  html: `<!doctype html>
<html>
<head><title>Production Supervisor</title></head>
<body>
  <h1>Production Supervisor</h1>
</body>
</html>`,
  expected: {
    company: "Flex-N-Gate",
    role: "Production Supervisor",
    source: "dayforce",
    jobKey: "dayforce:fng:14233",
  },
};
