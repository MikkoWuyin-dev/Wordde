import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStateManager } from '@/core/stateManager';
import { saveBlankSettings, persistProjectionState } from '@/core/broadcastSync';

/**
 * RI-022 / RI-043 / RI-045 / RI-059 — persistence failure must never break
 * live operation. A localStorage write can throw (quota exceeded, Safari
 * private mode); when it does, the operator action must complete anyway and
 * in-memory (authoritative) state must still update.
 *
 * This suite targets the writes that are UNGUARDED before the Option A fix
 * (safeLocalSet helper + guards moved inside saveBlankSettings /
 * persistProjectionState). It is expected to FAIL against pre-fix code and
 * PASS once the fix lands — it ships in the same change.
 *
 * Behavioural by design: it asserts "does not throw + state still updates",
 * never that a specific helper exists, so any correct guarding satisfies it.
 */

let spy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  useStateManager.setState({ recentPassages: ['John 3:16'] });
  spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('QuotaExceededError');
  });
});

afterEach(() => {
  spy.mockRestore();
});

describe('RI-022 / RI-043 — localStorage writes survive a failing setItem', () => {
  it('addToRecent does not throw and still updates in-memory recents', () => {
    expect(() => useStateManager.getState().addToRecent('Romans 8:28')).not.toThrow();
    expect(useStateManager.getState().recentPassages[0]).toBe('Romans 8:28');
  });

  it('removeFromRecent does not throw and still updates in-memory recents', () => {
    expect(() => useStateManager.getState().removeFromRecent('John 3:16')).not.toThrow();
    expect(useStateManager.getState().recentPassages).not.toContain('John 3:16');
  });

  it('clearAllRecent does not throw and still clears in-memory recents', () => {
    expect(() => useStateManager.getState().clearAllRecent()).not.toThrow();
    expect(useStateManager.getState().recentPassages).toEqual([]);
  });

  it('saveBlankSettings does not throw when persistence fails', () => {
    expect(() =>
      saveBlankSettings({} as Parameters<typeof saveBlankSettings>[0]),
    ).not.toThrow();
  });

  it('persistProjectionState does not throw when persistence fails', () => {
    expect(() =>
      persistProjectionState({ passage: null, isBlanked: false, timestamp: Date.now() }),
    ).not.toThrow();
  });
});

describe('Recent Passages cap (MCD §15 — bounded history)', () => {
  it('caps the history at 20, newest-first, and re-projects move an entry to the front without duplicating it', () => {
    useStateManager.setState({ recentPassages: [] });
    for (let i = 1; i <= 25; i++) {
      useStateManager.getState().addToRecent(`Ref ${i}`);
    }
    const recents = useStateManager.getState().recentPassages;
    expect(recents).toHaveLength(20);
    expect(recents[0]).toBe('Ref 25');
    expect(recents[19]).toBe('Ref 6'); // oldest survivor
    useStateManager.getState().addToRecent('Ref 10');
    const after = useStateManager.getState().recentPassages;
    expect(after[0]).toBe('Ref 10');
    expect(after.filter(r => r === 'Ref 10')).toHaveLength(1);
  });
});
