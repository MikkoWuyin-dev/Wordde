// Wordde - Shortcut Registry
//
// SINGLE SOURCE OF TRUTH for operator keyboard shortcuts. Both consumers
// derive from this file and only this file:
//
//   1. `useGlobalKeyboard` (inputController.ts) — dispatches actions for the
//      keys declared here. `src/test/shortcutRegistry.test.ts` enforces that
//      every advertised dispatchable key has a handler case, and that no
//      handler case exists without a registry entry (drift in either
//      direction fails the suite).
//   2. The Settings & More "Keyboard Shortcuts" view — renders exactly what
//      is advertised here, so the help can never drift from the behavior.
//
// To add or change a shortcut: edit REGISTRY, then add/remove the matching
// `case` in inputController's switch. The integrity test names any mismatch.
// Per MCD §18: inspect listeners, inputs, propagation and collisions when
// touching keyboard behavior; per RI-037, removed shortcuts must stay removed
// (delete the row here AND its case — leftovers fail the integrity test).

export const HELP_TOGGLE_EVENT = 'wordde:toggle-shortcut-help';
export const NEXT_SERVICE_PLAN_EVENT = 'nextServicePlanPassage';

export type ShortcutGroup = 'Navigation' | 'Projection' | 'Service Plan' | 'General';

export interface ShortcutDef {
  /** Canonical `KeyboardEvent.key` the dispatcher matches (exact case). */
  keys: string;
  /** Extra `KeyboardEvent.key` values that map to the same action (e.g. 'z' vs 'Z'). */
  displayKeys?: string[];
  /** Rows are shown in the help view; `helpOnly` rows have no dispatch case. */
  helpOnly?: boolean;
  /** True when the key passes the focused-but-empty search input and reaches the dispatcher. */
  emptyInputPassThrough: boolean;
  /** Modifier gate the dispatcher applies (plain letters must not hijack OS combos). */
  requiresCtrlMeta?: boolean;
  label: string;
  group: ShortcutGroup;
}

const NAVIGATION_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] as const;

/**
 * REGISTRY — every operator-facing shortcut, in help-view order.
 */
const REGISTRY: ShortcutDef[] = [
  { keys: 'ArrowRight', emptyInputPassThrough: true, label: 'Navigate passages (next slide)', group: 'Navigation' },
  { keys: 'ArrowLeft', emptyInputPassThrough: true, label: 'Navigate passages (previous slide)', group: 'Navigation' },
  { keys: 'PageDown', emptyInputPassThrough: true, label: 'Next chapter', group: 'Navigation' },
  { keys: 'PageUp', emptyInputPassThrough: true, label: 'Previous chapter', group: 'Navigation' },
  // ArrowUp/Down act inside the search field (useInputController), not via a
  // global dispatch case — advertised in the help, flagged helpOnly so the
  // integrity test enforces that no global case is ever added without also
  // deciding what it should do.
  { keys: 'ArrowDown', emptyInputPassThrough: true, label: 'Select next search result (in search field)', group: 'Navigation', helpOnly: true },
  { keys: 'ArrowUp', emptyInputPassThrough: true, label: 'Select previous search result (in search field)', group: 'Navigation', helpOnly: true },
  { keys: 'p', displayKeys: ['P'], emptyInputPassThrough: false, label: 'Project current slide', group: 'Projection' },
  { keys: 'b', displayKeys: ['B'], emptyInputPassThrough: false, label: 'Blank / unblank screen', group: 'Projection' },
  { keys: 'c', displayKeys: ['C'], emptyInputPassThrough: false, label: 'Load chapter as queue', group: 'Projection' },
  { keys: 'z', displayKeys: ['Z'], emptyInputPassThrough: false, requiresCtrlMeta: true, label: 'Undo last projection', group: 'Projection' },
  { keys: 'Escape', emptyInputPassThrough: true, label: 'Clear preview', group: 'Projection' },
  { keys: 'n', displayKeys: ['N'], emptyInputPassThrough: false, label: 'Next service plan passage', group: 'Service Plan' },
  { keys: 'Enter', emptyInputPassThrough: false, label: 'Next service plan passage (with Shift)', group: 'Service Plan' },
  { keys: '?', emptyInputPassThrough: true, label: 'Show this help', group: 'General' },
];

/** Rows rendered by the help view — the help shows even help-only entries. */
export const ADVERTISED_SHORTCUTS: readonly ShortcutDef[] = REGISTRY;

/** Rows backed by a dispatcher case — help-only entries excluded. */
export const DISPATCHABLE_SHORTCUTS: readonly ShortcutDef[] = REGISTRY.filter(s => !s.helpOnly);

/** Group headers, in stable display order. */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ['Navigation', 'Projection', 'Service Plan', 'General'];

/** All `KeyboardEvent.key` values that reach the dispatcher for this shortcut. */
function dispatchKeysOf(s: ShortcutDef): string[] {
  return [s.keys, ...(s.displayKeys ?? [])];
}

/**
 * True when `key` is any advertised key (including uppercase letter variants
 * and display-only rows). Used by the integrity test — not by the dispatcher,
 * which owns its own switch.
 */
export function isAdvertisedKey(key: string): boolean {
  return REGISTRY.some(s => dispatchKeysOf(s).includes(key));
}

/**
 * Keys the focused-but-empty search input lets through to the global
 * dispatcher (non-printing navigation keys only — letters must never pass,
 * or typing would double-fire shortcuts; RI-036).
 */
export const INPUT_PASS_THROUGH_KEYS: readonly string[] = [
  ...NAVIGATION_KEYS,
  'PageUp', 'PageDown', 'Escape', '?',
];

/** Display string for the help view's <kbd> column (canonical human form). */
export function shortcutDisplayKeys(s: ShortcutDef): string {
  switch (s.keys) {
    case 'ArrowRight': return '→';
    case 'ArrowLeft': return '←';
    case 'ArrowUp': return '↑';
    case 'ArrowDown': return '↓';
    case 'PageUp': return 'PgUp';
    case 'PageDown': return 'PgDn';
    case 'Escape': return 'Esc';
    case 'Enter': return 'Shift+Enter';
    default:
      return s.requiresCtrlMeta ? `⌘${s.keys.toUpperCase()}` : s.keys.toUpperCase();
  }
}
