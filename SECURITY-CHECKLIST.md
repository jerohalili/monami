# SECURITY-CHECKLIST — MonAmi

Filled before going public. Every row: Yes / No / N/A + one line of evidence in my own words.

## Secrets and credentials

| # | Check | Yes / No / N/A | Evidence |
|---|-------|----------------|----------|
| 1 | .env is gitignored and is not in the repository | Yes | `.gitignore:6-7` lists `.env` and `.env*.local`; `git ls-files` shows only `.env.example`, `git status` clean |
| 2 | A .env.example with placeholder values only is committed | Yes | `.env.example:1-4` has `user:password@ep-xxx` placeholder and empty `AUTH_*=""` |
| 3 | No connection string, key, token or password is hardcoded in source, comments or commented-out code | Yes | `prisma/schema.prisma:12` uses `env("DATABASE_URL")`; `src/lib/auth.ts`/`db.ts` have zero secret literals; only intentional demo `GUEST_PASSWORD="guest123"` in `auth/guest/route.ts:6-7` (low-priv shared demo, hardened against modify/delete) |
| 4 | Git history is clean: I searched git log -p for password, secret, api key and postgres:// | Yes | Ran `git log -p --all -S password -S secret -S "api key" -S postgres://`; no credential hits |
| 5 | Any credential that was ever committed has been rotated | N/A | No credential was ever committed; live `.env` on disk never entered git |
| 6 | Production credentials live only in my hosting provider's environment settings | Yes | Prod `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GITHUB_*` set in Vercel env settings only |

## GitHub Actions

Project has no workflows — rows 7–11 are N/A for that reason.

| # | Check | Yes / No / N/A | Evidence |
|---|-------|----------------|----------|
| 7 | No secret value is written literally in any workflow YAML file | N/A | No `.github/` directory exists |
| 8 | Secrets are stored in repository Actions secrets and read with ${{ secrets.NAME }} | N/A | No workflows to audit |
| 9 | No workflow step echoes, dumps or debug-prints a secret, and I opened a recent run's log to confirm | N/A | No workflows, no runs |
| 10 | Uploaded build artifacts contain no .env, key file or generated config | N/A | No workflows; Next.js build output only |
| 11 | Third-party actions are pinned to a commit SHA, not a moveable tag | N/A | No workflows |
| 12 | Secret scanning and push protection are enabled on the repository | Yes | Checked Settings → Code security after last push; both on |

## Database

| # | Check | Yes / No / N/A | Evidence |
|---|-------|----------------|----------|
| 13 | Every query taking user input uses parameters, never string concatenation | Yes | All Prisma calls use object `where` (`db.person/edge/user.*`); zero `$queryRaw`/`$executeRaw` |
| 14 | The database is not open to the whole internet, or is reachable only by the app | Yes | Neon pooled URL, password-gated; only holder of `DATABASE_URL` can connect |
| 15 | The database user the app connects as has only the permissions it needs | No | Neon single-owner string has full rights to this DB; mitigated by per-project DB, env-only storage, no raw DDL in app |
| 16 | Seed and sample data is invented, not real people's data | Yes | No `prisma/seed.*`; `prisma/*.db` gitignored; only runtime auto-create `You` node (`graph/route.ts:24-36`) |
| 17 | Debug, seed and reset routes are removed before going public | Yes | 16 API routes only, no debug/seed/reset/test routes; `package.json:13 db:reset --force-reset` is local CLI only, documented as danger |

## Access control

| # | Check | Yes / No / N/A | Evidence |
|---|-------|----------------|----------|
| 18 | The app has an access layer: Cloudflare Zero Trust, an app-level password, or a real login | Yes | NextAuth v5 JWT with GitHub + Credentials + guest (`src/lib/auth.ts:8-40`, `pages.signIn:/login`) |
| 19 | If Supabase or Firebase: Row Level Security or security rules are on, and I tested it signed out | N/A | Not used; Neon + Prisma only |
| 20 | If Zero Trust: tjakoen.s@gmail.com is on the access policy. If an app password: the credentials are in my private workspace project/README.md | N/A | No Zero Trust or app password; real login covers access |
| 21 | The gate covers every route, including the ones that only change data | Yes | `src/middleware.ts` redirects unauthenticated pages; every non-auth API route calls `requireUserId()` → 401 and scopes `where:{id,userId}` / `source:{userId}`; 409 on duplicate tie/existing email |
| 22 | The credentials for the gate are environment variables, not in source | Yes | `AUTH_SECRET`, `AUTH_GITHUB_ID/SECRET` via env; GitHub scope minimal `read:user user:email`, token+expiry stored and cleared on unlink; passwords `bcryptjs` hashed (cost 10) |

## Input and output

| # | Check | Yes / No / N/A | Evidence |
|---|-------|----------------|----------|
| 23 | Input from the user is validated on the server, not only in the browser | Yes | `name` required → 400, self-link rejected, `strength` clamped 1–3, `origin` allowlisted (`ORIGIN_KEYS`), email `includes(@)`, `currentPassword` required for changes |
| 24 | User-supplied text is escaped when rendered, so it cannot inject markup or script | Yes | Default JSX escaping everywhere; only `dangerouslySetInnerHTML` is the static theme script (no user data); avatars via `remotePatterns` + `encodeURIComponent` |
| 25 | Error responses do not expose stack traces, file paths or connection details | No | Mostly generic `{error}` with status codes, but `github/repos`, `sync-profile`, `sync-connections` return upstream `e.message` (may echo GitHub body) — will sanitize to generic 502/500 |
| 26 | CORS is not a wildcard on routes that change data | Yes | No `Access-Control-*` headers; same-origin `fetch("/api/…")` only, no CORS config in `next.config.ts` |

## Repository and privacy

| # | Check | Yes / No / N/A | Evidence |
|---|-------|----------------|----------|
| 27 | No student number, personal email, phone number or home address in the repository or in commit messages | Yes | Searched repo + `git log`; only `github.com/jerohalili/monami` and live URL |
| 28 | No classmate's personal data in the repository | Yes | No other people's data; `User/Person/Edge` schema holds only app data |
| 29 | Dependencies come from official registries, and node_modules is gitignored | Yes | `next`, `react`, `@prisma/client`, `next-auth@5-beta`, `bcryptjs` from npm, `private:true`; `node_modules/` gitignored + untracked |
| 30 | Images, fonts and other assets are mine, licensed, or credited | Yes | DiceBear avatars, GitHub avatars (remote pattern), hand-drawn SVG icons, system fonts |
| 31 | Repository visibility is deliberate, and I checked it after my last push | Yes | Public by intent for grading; visibility re-checked after final push |

## Anything I found and fixed

The checklist caught three real items I hadn't written down: GitHub `e.message` passthrough that can echo upstream bodies, a 6-vs-8 password-length inconsistency between register and account change, and the `db:reset --force-reset` footgun. Documented here as known issues; next change is sanitizing to generic errors, unifying to 8+, and keeping the demo `guest123` account hardened.
