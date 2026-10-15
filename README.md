# Resume Studio

A local-first resume workspace with a complete manual workflow and optional AI recommendations.

## Run

Requires Node.js 24.x and npm. The bounded `engines.node` range keeps hosting services on Node 24.

```sh
npm ci
npm run dev
```

Vite serves the interface on port 5173 and proxies `/api` to a local Node server on port 3001. To run a production build locally:

```sh
npm run build
npm start
```

The server binds to loopback on port 3001 by default (override with `HOST` and `PORT`). On Render (`RENDER=true`), it binds to `0.0.0.0` and uses Render’s supplied `PORT`. This first version is intended for a private local workspace, not deployment as a public multi-user service. Authentication, shared accounts, server storage, and server-side rate limits are not included.

## Workflow

1. Fill in your master profile, or import old PDF, DOCX, and TXT resumes in the Resume library.
2. Review extracted text, edit it, and append selected information to a profile section. Extraction is not automatic deduplication or structured parsing. Scanned PDFs need external OCR. Original files are not retained; extracted text is saved.
3. Create a resume version. Each is an independent snapshot of the master profile. Edit it, choose included sections, and optionally add a target job description.
4. Download an editable `.docx`. Duplicating a version preserves its content and included sections.
5. Download a JSON backup regularly. Restore replaces the current workspace after confirmation.

All profile data, imported text, and versions are stored in this browser’s local storage. They are not synchronized across devices. Clearing site data or using another browser loses access unless you restore a backup. Local storage and backups are unencrypted: use a trusted device. No resume content leaves the browser during the manual workflow.

## Optional AI

The full manual workflow needs no credentials. To enable recommendations, set `RESUME_AI_API_KEY` securely in the server environment before starting the app. Never put it in frontend code or commit a key. Optionally set `RESUME_AI_MODEL` (default `gpt-4o-mini`). The server calls `api.openai.com`; this destination must be allowed by your network policy.

AI is called only when the user clicks **Get AI recommendations**. The current resume version and job description are sent to OpenAI, not the imported document library. Recommendations appear as text; they never automatically edit a resume. Review them for factual accuracy. No AI credentials are shipped, and live AI behavior requires an authorized key and network access.

## Validation

```sh
npm test
npm run build
# Start npm run dev in another terminal, then:
npx playwright install chromium
npm run test:browser
```

Browser smoke checks cover profile persistence, imports, independent versions, inclusion toggles, DOCX content, duplication, and backup downloads. Set `RESUME_TEST_URL` to test a different local server.

## Deploy on Render

Push the application files, including `package.json` and `package-lock.json`, to GitHub first. Publishing a Codex environment does not push source changes.

Create a Node web service connected to this repository’s `main` branch, using the repository root (leave Root Directory blank):

- Build command: `npm ci --include=dev && npm run build` (no trailing period).
- Start command: `npm start`.
- Health check path: `/api/health`.
- Node version: resolved from `engines.node` as Node 24.x. Remove or update a conflicting `NODE_VERSION` override in the Render dashboard.

The included `render.yaml` also supports creating a new service as a Render Blueprint. It does not override an existing service’s dashboard settings.

Keep AI disabled on a public deployment until authentication and usage controls are added. The manual workspace needs no API key. Resume data remains local to each browser and website origin; use backup/restore to move data to the deployed site.
