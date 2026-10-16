# Enable accounts, cloud sync, and optional AI on Render

The browser features work without credentials. To enable account features, connect the Supabase project you already own. Do not paste secret keys into chat or commit them to GitHub.

## 1. Create the private workspace table

In the Supabase dashboard for `https://inhqxwratimjvzsnuwik.supabase.co`:

1. Open **SQL Editor → New query**.
2. Copy the complete contents of [`supabase/schema.sql`](../supabase/schema.sql), paste them into the editor, and run the query.
3. The query creates `resume_workspaces`, enables row-level security, and allows each signed-in user to access only their own row. Revision checks prevent an older device from overwriting a newer saved workspace. It can be run again safely for this schema.

Do not disable row-level security. The app uses a public publishable/anon key plus each user's own sign-in token; it never needs a service-role key.

## 2. Enable email sign-in

In Supabase **Authentication**:

- Enable the **Email** provider.
- Keep email confirmation enabled if you want users to verify their address. New users must follow the confirmation email before signing in.
- In **URL Configuration**, set **Site URL** to your actual Render website address, such as `https://your-service.onrender.com`.
- Add that same address to the redirect allowlist for confirmation and password-reset emails. If testing locally, add your exact local origin separately.
- Configure an email sender if your Supabase plan/provider requires one for delivery beyond test users. The app does not bypass confirmation or email delivery requirements.

The app supports sign-up, sign-in, sign-out, reset-password emails, and setting a new password after following the recovery link. New passwords entered through the app must be at least 12 characters.

## 3. Add Render environment variables

Open your Render web service → **Environment**, then add:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | `https://inhqxwratimjvzsnuwik.supabase.co` |
| `SUPABASE_ANON_KEY` | The **publishable** key (`sb_publishable_…`) or legacy **anon** key from your Supabase project's API settings |

Never use a Supabase secret key (`sb_secret_…`) or service-role JWT. The public key is intentionally delivered to browsers, and the server rejects secret/service-role configuration instead of exposing it. Data access is enforced by the database policies and the user's session.

Keep the build command `npm ci --include=dev && npm run build` and the start command `npm start`. Save the environment changes and deploy the latest commit.

## 4. Connect the workspace

1. Download a JSON backup of your existing browser workspace first.
2. Open **Account & sync**, create an account or sign in, and confirm your email if required.
3. The account has a separate browser workspace. Use **Copy guest workspace here** if you want to bring your previous local work into the account.
4. Click **Load cloud status**. On the first device choose **Upload browser copy**. On another device sign in, load cloud status, then choose **Use cloud copy**.
5. After choosing a copy, edits save locally and then sync automatically. Wait for **Synced to your account** before closing a device. **Sync now** also sends a saved copy immediately.

Loading a cloud copy or overwriting a remote copy first downloads a recovery backup. If another device saves first, sync stops and keeps your browser draft. Load cloud status, back up whichever copies you need, and explicitly choose which one to use. The app syncs whole workspaces; it does not silently merge simultaneous edits.

Sign-out returns to the guest workspace. Account data is cached under a separate local key per user. Browser storage and JSON backups are not encrypted by the app: use trusted devices, sign out on shared devices, and clear site data when appropriate.

## 5. Optional AI tailoring

To enable AI, add `RESUME_AI_API_KEY` in Render's environment settings. Optionally set `RESUME_AI_MODEL` (default `gpt-4o-mini`). Keep the provider key server-side. No `VITE_` prefix is needed.

AI requests require a valid signed-in Supabase session, which the server verifies with Supabase. The server allows 10 requests per account per hour per running server instance. This in-memory limit resets on restart and is not shared across scaled instances; set provider billing limits as needed for your deployment. Manual keyword recommendations are always available without AI or sign-in.

Clicking AI recommendations sends only the selected resume's profile and target job description to OpenAI. Suggestions explain which supplied sections support them, remain review-only, and are saved with that version. They do not automatically change your resume. Verify every suggestion for accuracy.

## Validation and limits

The local release checks include real PostgreSQL schema tests (PGlite) for row-level security and revisions, simulated Supabase Auth/database browser tests for cross-device sync and conflicts, and mocked AI-provider tests. These do not establish that your hosted project's email delivery, keys, or policies are configured. After adding settings, test signing in and syncing between two browsers on your actual Render site.

Documents are imported as reviewed extracted text; original upload files are not archived. Scanned PDFs require external OCR. Structured parsing is based on common headings and may need corrections. History retains up to 20 snapshots within a storage budget; large workspaces may retain fewer. Keep downloadable backups. PDF exports embed bundled Roboto fonts; unsupported scripts may require editing/exporting the Word file with an appropriate font.
