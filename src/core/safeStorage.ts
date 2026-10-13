/**
 * Never-throwing localStorage helpers (RI-022 / RI-043 / RI-045 / RI-059).
 *
 * `localStorage.getItem`/`setItem`/`removeItem` can throw — quota exceeded,
 * Safari private mode, storage disabled (the browser may also throw on *read*,
 * e.g. `SecurityError` when storage is blocked). A throw on the boot or
 * projection path would blank a live service, so every access goes through
 * these helpers: they warn (with the key, for diagnosability) and report
 * failure instead of throwing.
 *
 * In-memory state must always be updated independently of these calls; they
 * only make the disk write best-effort, preserving last-known-good state on
 * disk when a write fails.
 */

/**
 * Read from localStorage without ever throwing. Returns null when the value is
 * absent **or** when storage is unavailable. A null here must be treated as
 * "no persisted state" — never as a reason to abort the caller.
 */
export function safeLocalGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn(`[safeStorage] Failed to read "${key}":`, error);
    return null;
  }
}

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
