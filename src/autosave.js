// Keep writes synchronous so pending edits can be saved during page exit.
export function createAutosave({getState, persist, onStatus = () => {}, savedAt = null, delay = 400, maxWait = 2000}) {
  let status = {phase: savedAt ? 'saved' : 'idle', savedAt, dirty: false};
  let debounceTimer, deadlineTimer;
  function notify(patch) {
    status = {...status, ...patch};
    onStatus({...status});
  }
  function clearTimers() {
    clearTimeout(debounceTimer);
    clearTimeout(deadlineTimer);
    debounceTimer = deadlineTimer = undefined;
  }
  function flush() {
    clearTimers();
    if (!status.dirty) return true;
    const savedAt = new Date().toISOString();
    try {
      persist({...getState(), savedAt});
      notify({phase: 'saved', savedAt, dirty: false});
      return true;
    } catch {
      // Keep the last successful timestamp and the in-memory draft for retry/backup.
      notify({phase: 'error', dirty: true});
      return false;
    }
  }
  function changed({defer = false} = {}) {
    notify({phase: 'pending', dirty: true});
    if (!defer) return flush();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, delay);
    deadlineTimer ??= setTimeout(flush, maxWait);
  }
  function reset(savedAt) {
    clearTimers();
    notify({phase: 'saved', savedAt, dirty: false});
  }
  return {changed, flush, reset, getStatus: () => ({...status})};
}
