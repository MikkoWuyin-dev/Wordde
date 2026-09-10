// Cross-tab synchronization using BroadcastChannel API
// Syncs committedPassage from Operator → Projection tab on same machine

import type { Passage } from './types';

const CHANNEL_NAME = 'bible-projection-sync';

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
  localStorage.setItem('blankSettings', JSON.stringify(settings));
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

let channel: BroadcastChannel | null = null;

export function getChannel(): BroadcastChannel {
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

/** Broadcast committed passage to all other tabs */
export function broadcastCommit(passage: Passage): void {
  getChannel().postMessage({ type: 'COMMIT_PASSAGE', payload: passage } satisfies BroadcastMessage);
}

/** Broadcast clear to all other tabs */
export function broadcastClear(): void {
  getChannel().postMessage({ type: 'CLEAR_PASSAGE' } satisfies BroadcastMessage);
}

/** Broadcast blank screen to all other tabs */
export function broadcastBlank(settings?: BlankSettings): void {
  getChannel().postMessage({ type: 'BLANK_SCREEN', payload: settings } satisfies BroadcastMessage);
}

/** Broadcast unblank screen to all other tabs */
export function broadcastUnblank(): void {
  getChannel().postMessage({ type: 'UNBLANK_SCREEN' } satisfies BroadcastMessage);
}

/** Request current state from operator tab (used when projection opens) */
export function requestCurrentState(): void {
  getChannel().postMessage({ type: 'REQUEST_STATE' } satisfies BroadcastMessage);
}

/** Respond with current state (called by operator tab) */
export function broadcastStateResponse(passage: Passage | null): void {
  getChannel().postMessage({ type: 'STATE_RESPONSE', payload: passage } satisfies BroadcastMessage);
}

/** Tell projection tab to reload images from IndexedDB */
export function broadcastReloadAssets(): void {
  getChannel().postMessage({ type: 'RELOAD_ASSETS' } satisfies BroadcastMessage);
}

/** Send heartbeat from projector */
export function broadcastHeartbeat(): void {
  getChannel().postMessage({ type: 'HEARTBEAT', timestamp: Date.now() } satisfies BroadcastMessage);
}

/** Send periodic state sync from operator */
export function broadcastSync(passage: Passage | null, isBlanked: boolean, blankSettings?: BlankSettings): void {
  getChannel().postMessage({ type: 'SYNC', payload: passage, isBlanked, blankSettings } satisfies BroadcastMessage);
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
  localStorage.setItem(PROJECTION_STATE_KEY, JSON.stringify(state));
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
    callback(event.data);
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}
