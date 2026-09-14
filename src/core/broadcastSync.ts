// Cross-tab synchronization using BroadcastChannel API
// Syncs committedPassage from Operator → Projection tab on same machine
// Protocol (§20): every outgoing message is stamped with PROTOCOL_VERSION by
// post(); receivers ignore messages with a mismatched version.

import type { Passage } from './types';
import { safeLocalSet } from './safeStorage';

const CHANNEL_NAME = 'bible-projection-sync';

/**
 * Protocol version (§20 / MCD §24.5). Stamped onto every outgoing message and
 * checked on every incoming message. BUMP THIS on any change to the message
 * schema (a new/changed `type` or `payload` shape): during an upgrade, mixed
 * old/new windows must not cross-talk, and mismatched messages must never
 * mutate operator/projection state (RI-020).
 */
export const PROTOCOL_VERSION = 1;

export type BlankStyle = 'black' | 'logo' | 'soft' | 'session';

export interface SessionScreen {
  id: string;
  title: string;
  subtitle: string;
}

/** A reference to a user-uploaded background image stored in IndexedDB. */
export interface BackgroundImageRef {
  id: string;        // matches the IndexedDB key, e.g. `bg:<uuid>`
  name: string;      // human-readable label
  createdAt: number;
}

export interface BlankSettings {
  style: BlankStyle;
  logoUrl: string;             // legacy, unused for new uploads
  softBgUrl: string;           // legacy
  sessionScreens: SessionScreen[];
  activeSessionId: string;
  backgrounds: BackgroundImageRef[];
  activeBackgroundId: string;  // id of selected background, '' = none
}

export const DEFAULT_SESSION_SCREENS: SessionScreen[] = [
  { id: 'prayer', title: 'Prayer Time', subtitle: 'Let us pray together' },
  { id: 'worship', title: 'Worship', subtitle: 'Let us worship the Lord' },
  { id: 'offering', title: 'Offering', subtitle: 'Give cheerfully unto the Lord' },
  { id: 'sermon-end', title: 'End of Sermon', subtitle: '' },
  { id: 'closing', title: 'Service Closing', subtitle: 'Go in peace' },
];

export function loadBlankSettings(): BlankSettings {
  const fallback: BlankSettings = {
    style: 'black',
    logoUrl: '',
    softBgUrl: '',
    sessionScreens: DEFAULT_SESSION_SCREENS,
    activeSessionId: 'prayer',
    backgrounds: [],
    activeBackgroundId: '',
  };
  try {
    const stored = localStorage.getItem('blankSettings');
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<BlankSettings>;
      // Merge with fallback to handle migrations (old payloads lack new fields)
      return {
        ...fallback,
        ...parsed,
        sessionScreens: parsed.sessionScreens ?? fallback.sessionScreens,
        backgrounds: parsed.backgrounds ?? fallback.backgrounds,
        activeBackgroundId: parsed.activeBackgroundId ?? fallback.activeBackgroundId,
      };
    }
  } catch {}
  return fallback;
}

export function saveBlankSettings(settings: BlankSettings): void {
  // Guarded internally (RI-022/RI-043): a storage failure must not break the
  // operator regardless of caller. Deliberate, justified edit to this
  // protected file — limited to this function; no message shapes or protocol
  // changes.
  safeLocalSet('blankSettings', JSON.stringify(settings));
}

export type BroadcastMessage =
  | { type: 'COMMIT_PASSAGE'; payload: Passage }
  | { type: 'CLEAR_PASSAGE' }
  | { type: 'BLANK_SCREEN'; payload?: BlankSettings }
  | { type: 'UNBLANK_SCREEN' }
  | { type: 'REQUEST_STATE' }
  | { type: 'STATE_RESPONSE'; payload: Passage | null }
  | { type: 'RELOAD_ASSETS' }
  | { type: 'HEARTBEAT'; timestamp: number }
  | { type: 'PROJECTOR_READY' }
  | { type: 'SYNC'; payload: Passage | null; isBlanked: boolean; blankSettings?: BlankSettings };

/** Outgoing envelope: a protocol message plus its version stamp. */
type VersionedBroadcastMessage = BroadcastMessage & { version: number };

/**
 * Internal send wrapper (§20 / MCD §24.5): stamps the protocol version and
 * posts. ALL send helpers must route through this — never post to the channel
 * directly, so a schema change can never ship unversioned.
 */
function post(msg: BroadcastMessage): void {
  getChannel().postMessage({ ...msg, version: PROTOCOL_VERSION } satisfies VersionedBroadcastMessage);
}

let channel: BroadcastChannel | null = null;

export function getChannel(): BroadcastChannel {
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

/** Broadcast committed passage to all other tabs */
export function broadcastCommit(passage: Passage): void {
  post({ type: 'COMMIT_PASSAGE', payload: passage });
}

/** Broadcast clear to all other tabs */
export function broadcastClear(): void {
  post({ type: 'CLEAR_PASSAGE' });
}

/** Broadcast blank screen to all other tabs */
export function broadcastBlank(settings?: BlankSettings): void {
  post({ type: 'BLANK_SCREEN', payload: settings });
}

/** Broadcast unblank screen to all other tabs */
export function broadcastUnblank(): void {
  post({ type: 'UNBLANK_SCREEN' });
}

/** Request current state from operator tab (used when projection opens) */
export function requestCurrentState(): void {
  post({ type: 'REQUEST_STATE' });
}

/** Respond with current state (called by operator tab) */
export function broadcastStateResponse(passage: Passage | null): void {
  post({ type: 'STATE_RESPONSE', payload: passage });
}

/** Tell projection tab to reload images from IndexedDB */
export function broadcastReloadAssets(): void {
  post({ type: 'RELOAD_ASSETS' });
}

/** Send heartbeat from projector */
export function broadcastHeartbeat(): void {
  post({ type: 'HEARTBEAT', timestamp: Date.now() });
}

/** Send periodic state sync from operator */
export function broadcastSync(passage: Passage | null, isBlanked: boolean, blankSettings?: BlankSettings): void {
  post({ type: 'SYNC', payload: passage, isBlanked, blankSettings });
}

// --- Projection state persistence ---
const PROJECTION_STATE_KEY = 'projectionState';

export interface PersistedProjectionState {
  passage: Passage | null;
  isBlanked: boolean;
  blankSettings?: BlankSettings;
  timestamp: number;
}

export function persistProjectionState(state: PersistedProjectionState): void {
  // Guarded internally (RI-022/RI-043): never throws regardless of caller.
  // Deliberate, justified edit to this protected file — limited to this
  // function; no message shapes or protocol changes.
  safeLocalSet(PROJECTION_STATE_KEY, JSON.stringify(state));
}

export function loadPersistedProjectionState(): PersistedProjectionState | null {
  try {
    const raw = localStorage.getItem(PROJECTION_STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

/** Listen for committed passage updates from other tabs */
export function onBroadcastMessage(callback: (msg: BroadcastMessage) => void): () => void {
  const ch = getChannel();
  const handler = (event: MessageEvent<BroadcastMessage>) => {
    // §20 / RI-020 — protocol version guard: an unversioned or mismatched
    // message comes from a window running an incompatible protocol. Ignore it
    // (warn, never deliver) so it cannot mutate operator/projection state;
    // during an upgrade, mixed old/new windows simply do not cross-talk.
    const version = (event.data as { version?: unknown }).version;
    if (version !== PROTOCOL_VERSION) {
      console.warn(
        `[broadcastSync] Ignoring message with incompatible protocol version ` +
          `(received: ${String(version)}, expected: ${PROTOCOL_VERSION}).`,
      );
      return;
    }
    callback(event.data);
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}
