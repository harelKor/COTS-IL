// Lighthouse CI on preview deploys (.github/workflows/lighthouse.yml). Mobile, the default preset.
// Fails on accessibility and SEO; performance and CLS only warn.
const base = (process.env.LHCI_BASE_URL || "https://cots-il.vercel.app").replace(/\/$/, "");
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

module.exports = {
  ci: {
    collect: {
      url: [`${base}/`, `${base}/catalog?category=gears`, `${base}/catalog/p/steel-spur-gear-20-dp`],
      numberOfRuns: 2,
      settings: {
        chromeFlags: "--no-sandbox",
        // Next streams <meta> into <body> for ordinary browsers and puts it in <head> for crawlers that can't run
        // JavaScript; Lighthouse only reads <head>. This UA (a mobile Chrome plus a bot token) gets what those crawlers get.
        emulatedUserAgent:
          "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse bingbot/2.0",
        ...(bypass ? { extraHeaders: JSON.stringify({ "x-vercel-protection-bypass": bypass }) } : {}),
      },
    },
    assert: {
      assertions: {
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:seo": ["error", { minScore: 0.95 }],
        "categories:performance": ["warn", { minScore: 0.9 }],
        "cumulative-layout-shift": ["warn", { maxNumericValue: 0.1 }],
      },
    },
    upload: { target: "temporary-public-storage" },
  },
};
