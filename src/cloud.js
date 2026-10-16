import { createClient } from "@supabase/supabase-js";
import { validateState } from "./model.js";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function createCloud(ctx) {
  let client = null,
    session = null,
    remote = null,
    connected = false,
    status = "Checking cloud configuration…",
    timer,
    sending = false,
    pending = false,
    generation = 0,
    recovery = false;
  const notify = () => {
    document
      .querySelectorAll("#cloud-state,#cloud-summary")
      .forEach((badge) => (badge.textContent = status));
  };
  const refresh = () => {
    notify();
    if (ctx.page() === "account") ctx.render();
  };
  async function init() {
    try {
      const config = await (await fetch("/api/config")).json();
      if (!config.supabaseUrl || !config.supabaseAnonKey) {
        status = "Local workspace · cloud not configured";
        refresh();
        return;
      }
      client = createClient(config.supabaseUrl, config.supabaseAnonKey);
      client.auth.onAuthStateChange((event, next) => {
        queueMicrotask(() => handleSession(event, next));
      });
    } catch {
      status = "Cloud unavailable · local editing works";
      refresh();
    }
  }
  function handleSession(event, next) {
    const previous = session?.user?.id;
    session = next;
    if (event === "PASSWORD_RECOVERY") recovery = true;
    if (previous === next?.user?.id) {
      refresh();
      return;
    }
    generation++;
    clearTimeout(timer);
    pending = false;
    sending = false;
    connected = false;
    remote = null;
    status = next
      ? "Signed in · choose a cloud copy"
      : "Local workspace · signed out";
    ctx.switchAccount(next?.user?.id || null);
    refresh();
  }
  async function getRemote() {
    if (sending) throw Error("Wait for the current cloud save to finish.");
    if (!session) throw Error("Sign in first.");
    clearTimeout(timer);
    pending = false;
    connected = false;
    status = "Checking your cloud workspace…";
    notify();
    const expected = generation;
    const { data, error } = await client
      .from("resume_workspaces")
      .select("revision,data")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (expected !== generation) throw Error("Account changed. Try again.");
    if (error)
      throw Error(
        "Could not read your cloud workspace. Check connectivity and run the Supabase database migration.",
      );
    remote = data
      ? {
          revision: data.revision,
          data: validateState(structuredClone(data.data)),
        }
      : { revision: 0, data: null };
    connected = false;
    status = remote.data
      ? "Choose which workspace to use"
      : "No cloud copy yet · upload your browser workspace";
    refresh();
    return remote;
  }
  async function push() {
    if (sending) {
      pending = true;
      return;
    }
    if (!session || !remote) return;
    const expected = generation,
      userId = session.user.id;
    const snapshot = structuredClone(ctx.getState());
    pending = false;
    sending = true;
    status = "Syncing to your account…";
    notify();
    try {
      const revision = remote.revision;
      const query =
        revision === 0
          ? client
              .from("resume_workspaces")
              .insert({ user_id: userId, data: snapshot, revision: 1 })
              .select("revision")
          : client
              .from("resume_workspaces")
              .update({ data: snapshot, revision: revision + 1 })
              .eq("user_id", userId)
              .eq("revision", revision)
              .select("revision");
      const { data, error } = await query;
      if (expected !== generation) return;
      if (error || data?.length !== 1)
        throw Error(
          "Cloud changed or could not be saved. Load cloud status and choose a copy; browser edits are retained.",
        );
      remote = { revision: data[0].revision, data: snapshot };
      connected = true;
      status = "Synced to your account";
    } catch (e) {
      if (expected !== generation) return;
      connected = false;
      remote = null;
      status = e.message;
    } finally {
      if (expected === generation) {
        sending = false;
        refresh();
        if (pending && connected) queue();
      }
    }
  }
  function queue() {
    if (!connected || !session) return;
    pending = true;
    status = "Saved here · cloud sync pending";
    notify();
    if (sending) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void push();
    }, 800);
  }
  async function checkConnection() {
    try {
      const response = await fetch("/api/cloud-check", { cache: "no-store" });
      if (!response.ok) throw Error();
      const result = await response.json();
      if (typeof result.message !== "string") throw Error();
      status = result.message;
      notify();
      ctx.toast(
        result.message,
        !result.ok || result.emailProviderEnabled === false,
      );
    } catch {
      ctx.toast(
        "Could not run the connection check. Check that the latest app version is deployed and try again.",
        true,
      );
    }
  }
  async function auth(action) {
    if (!client) return;
    ctx.flush();
    if (ctx.isDirty())
      return ctx.toast(
        "Download a backup and resolve the save error before switching accounts.",
        true,
      );
    const email = document.querySelector("#account-email")?.value.trim(),
      password = document.querySelector("#account-password")?.value;
    try {
      if (action === "signup" && (!password || password.length < 12))
        throw Error("Use at least 12 characters for a new account password.");
      let result;
      if (action === "signin")
        result = await client.auth.signInWithPassword({ email, password });
      if (action === "signup")
        result = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: location.origin },
        });
      if (action === "reset")
        result = await client.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin,
        });
      if (result.error) throw result.error;
      ctx.toast(
        action === "signup"
          ? "Account request accepted. Check your email for a confirmation link if required."
          : action === "reset"
            ? "If an account exists, check its email for a recovery link."
            : "Signed in.",
      );
    } catch (e) {
      if (/invalid api key/i.test(e.message)) {
        await checkConnection();
        return;
      }
      ctx.toast(e.message, true);
    }
  }
  function html() {
    return `<section class="card"><h2>${session ? "Your private account" : "Keep your work across devices"}</h2><p id="cloud-state" class="muted" role="status">${esc(status)}</p><button class="secondary spaced" id="check-connection">Check Supabase connection</button>${!client ? "<p>Cloud sign-in needs two Render environment variables: <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code>. Run the database migration in <code>supabase/schema.sql</code> first. See the deployment guide in the repository. Local features continue to work.</p>" : session ? `<p>Signed in as <strong>${esc(session.user.email)}</strong></p><p class="muted">Your account has a separate browser workspace. Signing out returns to the local guest workspace. Cloud sync starts only after you choose a copy below.</p><div class="actions wrap"><button class="secondary" id="load-cloud">Load cloud status</button><button class="secondary" id="copy-guest">Copy guest workspace here</button><button class="secondary" id="signout">Sign out</button></div>${remote ? `<div class="sync-choice"><p>${remote.data ? "A cloud copy exists. Choose explicitly before syncing; concurrent updates are checked to prevent overwrites." : "No cloud copy exists yet."}</p><div class="actions wrap">${remote.data ? '<button class="secondary" id="use-cloud">Use cloud copy</button><button class="secondary" id="cloud-backup">Download cloud backup</button>' : ""}<button class="primary" id="use-local">Upload browser copy</button>${connected ? '<button class="secondary" id="sync-now">Sync now</button>' : ""}</div></div>` : ""}${recovery ? '<label class="field spaced">New password<input id="new-password" type="password" minlength="12" autocomplete="new-password"></label><button class="primary spaced" id="update-password">Set new password</button>' : ""}` : `<form id="account-form"><div class="fields"><label class="field">Email<input id="account-email" type="email" required autocomplete="email"></label><label class="field">Password<input id="account-password" type="password" autocomplete="current-password" required></label></div><div class="actions spaced wrap"><button type="submit" class="primary">Sign in</button><button type="button" class="secondary" id="signup">Create account</button><button type="button" class="secondary" id="reset-password">Reset password</button></div></form>`}</section><section class="card"><h2>Your data stays under your control</h2><p>Manual editing, imports, comparisons, checks, and exports run in your browser. Cloud sync sends the workspace, including history and applications, to your private Supabase account. AI recommendations send the selected resume and job description to OpenAI only when requested. AI organization sends the selected imported text, including any reference contacts, only after your confirmation.</p><p class="muted">Keep JSON backups. Pending cloud changes may not finish if you close the page immediately; check for “Synced to your account.” Shared-device users should sign out and clear site data after downloading any needed backups.</p></section>`;
  }
  function bind() {
    const on = (id, fn) =>
      document.getElementById(id)?.addEventListener("click", () =>
        Promise.resolve()
          .then(fn)
          .catch((e) => {
            status = e.message;
            refresh();
            ctx.toast(e.message, true);
          }),
      );
    on("check-connection", checkConnection);
    document.querySelector("#account-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      void auth("signin");
    });
    on("signup", () => auth("signup"));
    on("reset-password", () => auth("reset"));
    on("signout", async () => {
      ctx.flush();
      if (ctx.isDirty())
        throw Error("Save failed. Download a backup before signing out.");
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
    });
    on("load-cloud", getRemote);
    on("copy-guest", () => {
      if (sending) throw Error("Wait for the current cloud save to finish.");
      if (
        confirm(
          "Replace this account’s browser workspace with the guest workspace? The current copy will be saved as a backup.",
        )
      ) {
        ctx.backup();
        clearTimeout(timer);
        pending = false;
        connected = false;
        remote = null;
        ctx.copyGuest();
        status = "Browser copy changed · load cloud status to connect";
        refresh();
      }
    });
    on("use-cloud", () => {
      if (sending) throw Error("Wait for the current cloud save to finish.");
      if (!remote?.data) return;
      if (
        !confirm(
          "Use the cloud workspace? Download a backup first if you need this browser copy.",
        )
      )
        return;
      ctx.backup();
      clearTimeout(timer);
      pending = false;
      ctx.replaceWorkspace(remote.data);
      connected = true;
      status = "Synced to your account";
      refresh();
    });
    on("cloud-backup", () => ctx.backup(remote.data));
    on("use-local", async () => {
      if (!remote) return;
      if (
        remote.data &&
        !confirm(
          "Replace the cloud workspace with this browser copy? A cloud backup will download first.",
        )
      )
        return;
      if (remote.data) ctx.backup(remote.data);
      await push();
    });
    on("sync-now", () => {
      ctx.flush();
      return push();
    });
    on("update-password", async () => {
      const password = document.querySelector("#new-password").value;
      if (password.length < 12) throw Error("Use at least 12 characters.");
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      recovery = false;
      refresh();
      ctx.toast("Password updated.");
    });
  }
  return {
    init,
    html,
    bind,
    queue,
    updateStatus: notify,
    token: async () => {
      if (!client) return null;
      const { data } = await client.auth.getSession();
      return data.session?.access_token || null;
    },
    signedIn: () => !!session,
  };
}
