# S9: steps that need a dashboard (Nov 11, 2026)

## Sentry (not added: no DSN exists)
1. Create a Next.js project at sentry.io (EU region), copy its DSN.
2. Vercel, project `cotsil`, Settings, Environment Variables: add `NEXT_PUBLIC_SENTRY_DSN` (Production and Preview).
3. Tell Claude Code: "add Sentry with the DSN env var". It will run `npx @sentry/wizard@latest -i nextjs --skip-connect`, keep the tunnel off, and wire `error.tsx`, `global-error.tsx` and the server actions to `captureException`.

## Vercel Firewall rate limits (Project, Firewall, Custom Rules)
Rate limit rules use a fixed window per IP; action "Deny" (or "Challenge" for the first rule).
1. Name `search-api`: path starts with `/api/search` OR `/api/catalog` OR `/api/family`, 120 requests per 60 s.
2. Name `auth`: path equals `/login` OR `/signup` OR `/invite` AND method POST, 10 requests per 60 s.
3. Name `part-requests`: path starts with `/catalog` AND method POST, 30 requests per 60 s.
4. Name `revalidate`: path equals `/api/revalidate`, 10 requests per 60 s.
Publish the rules, then check Firewall, Traffic for false positives after a day.

## Lighthouse CI
Done: `lighthouserc.js` and `.github/workflows/lighthouse.yml` run on each successful Vercel deployment. If previews are password-protected, add the repo secret `VERCEL_AUTOMATION_BYPASS_SECRET` (Vercel, Settings, Deployment Protection, Protection Bypass for Automation). By hand: `LHCI_BASE_URL=<url> npx lhci collect`.

## Not done, on purpose
- **CSP nonce.** A nonce needs per-request rendering for every page, which undoes the static shells. `next.config.ts` ships a CSP with `script-src 'unsafe-inline'` plus framing, object, base and form restrictions. Revisit only if pages go fully dynamic anyway.
- **Playwright smoke test in CI.** `npm run e2e` exists and runs locally (needs `npm run supabase:start`, `env:local`, `seed` and a synced catalog). Not in CI: a runner has no catalog.
- **Supplier images copied or proxied.** Not cheap (storage, sync step, hotlink fallback); open.
