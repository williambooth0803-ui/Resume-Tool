# Resume Studio

A resume workspace with manual editing, reviewed document imports, automatic saving, recoverable history, application tracking, and optional accounts, cloud sync, and AI tailoring.

## Run

Requires Node.js 24.x and npm. The bounded `engines.node` range keeps hosting services on Node 24.

```sh
npm ci
npm run dev
```

Vite serves the interface on port 5173 and proxies `/api` to the Node server on port 3001. For a production build locally:

```sh
npm run build
npm start
```

The server binds to loopback on port 3001 by default (override with `HOST` and `PORT`). On Render (`RENDER=true`), it binds to `0.0.0.0` and uses the supplied `PORT`.

## Features

- **Master profile and resume versions:** Each version starts as an independent profile copy. Choose included sections and edit without changing other resumes.
- **Reviewed imports:** Read PDF, DOCX, and TXT documents in the browser. Analyze common headings into profile fields, edit suggestions, choose approved fields, and skip duplicate section lines. Ambiguous material remains in the extracted source for manual review. Scanned PDFs need external OCR. Original files are not stored.
- **Autosave and recovery:** Typing saves after a short pause, with a two-second maximum during continuous input. Leaving fields or the page flushes edits. The header distinguishes saved, pending, and failed writes. Download backups when storage is unavailable.
- **Undo, redo, and history:** Recover changes and deleted resumes/documents/applications, restore workspace snapshots, and create named checkpoints. Up to 20 snapshots are retained within a storage budget; large workspaces may retain fewer. Download JSON backups for longer-term retention.
- **Templates and exports:** Choose Classic, Modern, or Compact layouts. Download editable Word documents and PDFs with selectable text. Preview formatting is approximate; PDF fonts are bundled Roboto. Use Word with a suitable font for unsupported scripts.
- **Application tracking:** Store role, employer, job URL, status, application date, and notes. Attach a resume snapshot that remains unchanged if the source resume is edited or deleted. Export attached documents later.
- **Quality checks:** Flag missing contact details, inconsistent or reversed dates, long resumes, and broad wording. These are practical checks, not a guarantee of compatibility with every hiring system.
- **Manual tailoring:** Rank existing profile sections using job-description keywords and identify unmatched terms. Add only existing information, with duplicate lines skipped. No credentials are needed.
- **AI tailoring:** Optional, authenticated recommendations explain the supplied source sections and suggested relevance. Suggestions remain review-only and are saved with the resume version.
- **Comparisons:** Compare changed profile fields and included/excluded sections between two versions.
- **Accounts and cloud sync:** Supabase email accounts, separate browser workspaces per account, private per-user database rows, explicit initial upload/download, and revision-checked syncing that stops on conflicts.

Existing browser workspaces and older JSON backups migrate automatically. Backups include history and applications, but never account tokens or provider keys. Restoring replaces the current workspace after confirmation and keeps the previous core workspace in history when it fits the retention budget.

Manual use stores data in this browser's local storage and sends no resume content to a server. Connected cloud sync sends the workspace to your Supabase account. AI sends the selected resume and job description to OpenAI only when requested. Use backups, particularly when moving between browsers or website origins.

## Enable Supabase and AI on Render

See [the deployment guide](docs/DEPLOYMENT.md) for your project URL, SQL migration, authentication settings, Render environment variables, and the first-device/second-device workflow.

- Build command: `npm ci --include=dev && npm run build` (no trailing period).
- Start command: `npm start`.
- Health check: `/api/health`.
- Node version: Node 24.x from `engines.node`.

The `render.yaml` file supports creating a new Render Blueprint; it does not modify an existing service's dashboard settings. Publishing a Codex environment does not push source changes or update a Render service.

Accounts need `SUPABASE_URL` and `SUPABASE_ANON_KEY` plus the database migration. Use only a publishable/anon key, never a service-role key. Optional AI needs `RESUME_AI_API_KEY`; `RESUME_AI_MODEL` is optional. `.env.example` documents names; `npm start` does not automatically read `.env`. Set variables in the process environment or use Node's supported `--env-file` option during local development.

## Validation

```sh
npm test
npm run build
# Start npm run dev in another terminal, then:
npx playwright install chromium
npm run test:browser
npm run test:autosave
npm run test:features
npm run test:cloud
npm run test:connection
```

Set `RESUME_TEST_URL` to a different local server. Browser checks use system Chromium if available, otherwise Playwright's installed Chromium. Core checks cover migrations, history, parsing/deduplication, quality checks, application snapshots, AI authentication and rate limiting, and PostgreSQL row policies. Browser checks exercise Word/PDF contents, imports, autosave/recovery, new workflows, mobile layout, and simulated cross-device cloud sync. Live Supabase/AI services are not exercised without deployment configuration and credentials.
