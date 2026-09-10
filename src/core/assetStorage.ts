// IndexedDB-based asset storage for offline image persistence
// Stores logo and background images as Blobs (bypasses localStorage's 5MB limit)
//
// Keys:
//   'logo'                   → single church logo
//   'softBackground'         → legacy single soft background (kept for back-compat)
//   `bg:<uuid>`              → user-uploaded backgrounds (max 7, see MAX_BACKGROUNDS)

const DB_NAME = 'bible_projection_assets';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

export const MAX_BACKGROUNDS = 7;
export const BG_PREFIX = 'bg:';

export type AssetType = 'logo' | 'softBackground';
export type AssetKey = AssetType | string; // string for `bg:<uuid>`

interface AssetRecord {
  id: AssetKey;
  file: Blob;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAsset(key: AssetKey, file: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record: AssetRecord = { id: key, file, createdAt: Date.now() };
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function loadAsset(key: AssetKey): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => {
      const record = req.result as AssetRecord | undefined;
      resolve(record?.file ?? null);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function deleteAsset(key: AssetKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/** List all keys currently stored. */
export async function listAssetKeys(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAllKeys();
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Loads all known assets into a map of `key → object URL`.
 * Includes legacy `logo` and `softBackground` plus every `bg:<uuid>` entry.
 * Caller is responsible for revoking URLs when replacing the map.
 */
export async function loadAllAssets(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  try {
    const keys = await listAssetKeys();
    await Promise.all(
      keys.map(async (k) => {
        const blob = await loadAsset(k);
        if (blob) result[k] = URL.createObjectURL(blob);
      })
    );
  } catch (e) {
    console.error('Failed to load assets from IndexedDB:', e);
  }
  // Ensure stable shape for legacy callers
  if (!('logo' in result)) result.logo = '';
  if (!('softBackground' in result)) result.softBackground = '';
  return result;
}

// Validation
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Unsupported format. Use PNG, JPG, or WEBP.';
  }
  if (file.size > MAX_SIZE) {
    return 'File too large. Maximum size is 10 MB.';
  }
  return null;
}

/** Generate a new unique background asset key. */
export function newBackgroundKey(): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${BG_PREFIX}${uuid}`;
}
