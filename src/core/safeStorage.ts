/**
 * Never-throwing localStorage write helpers (RI-022 / RI-043 / RI-045 / RI-059).
 *
 * `localStorage.setItem`/`removeItem` can throw — quota exceeded, Safari
 * private mode, storage disabled. A thrown write inside an operator action
 * would break a live service, so every persistence write goes through these
 * helpers: they warn (with the key, for diagnosability) and report failure
 * instead of throwing.
 *
 * In-memory state must always be updated independently of these calls; they
 * only make the disk write best-effort, preserving last-known-good state on
 * disk when a write fails.
 */

/** Write to localStorage without ever throwing. Returns true on success. */
export function safeLocalSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`[safeStorage] Failed to persist "${key}":`, error);
    return false;
  }
}

/** Remove from localStorage without ever throwing. Returns true on success. */
export function safeLocalRemove(key: string): boolean {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(`[safeStorage] Failed to remove "${key}":`, error);
    return false;
  }
  return true;
}
