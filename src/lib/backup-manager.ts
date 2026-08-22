/**
 * KLE Editor Backup Manager — IndexedDB based auto-backup
 *
 * Safety guarantees:
 * - Keeps at most 3 entries (2 latest + 1 new) — auto-prunes the oldest
 * - Only saves when data actually changes (compares hash)
 * - Each entry ~1-5 KB, total < 15 KB
 * - IndexedDB is sandboxed by the browser
 * - All DB operations in a single transaction to minimize overhead
 */

const DB_NAME = "custom-key-pcb-tool-backups";
const DB_VERSION = 1;
const STORE_NAME = "backups";

export interface BackupEntry {
  id?: number;
  timestamp: number;
  hostname: string;
  keyboardName: string;
  rawData: string;
}

/** Format timestamp as YYYYMMDD-HHmm (local time) */
export function formatBackupTime(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${y}${M}${D}-${h}${m}`;
}

/** Generate backup filename: hostname-keyboardName-YYYYMMDD-HHmm.json */
export function generateBackupFilename(hostname: string, keyboardName: string, ts: number): string {
  const safeHost = hostname.replace(/[^a-zA-Z0-9_-]/g, "_") || "kle";
  const safeName = (keyboardName || "unnamed").replace(/[^a-zA-Z0-9_\u{0080}-\u{10FFFF}-]/gu, "_") || "unnamed";
  return `${safeHost}-${safeName}-${formatBackupTime(ts)}.json`;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Hash a string to quickly detect if data changed (not crypto, just comparison) */
function quickHash(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const chr = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

let lastHash = 0;

/** Promise queue mutex: serializes concurrent saveBackup calls to prevent race conditions */
let _saveQueue = Promise.resolve();

/**
 * Save a backup snapshot. Only writes if data has changed since last save.
 * Keeps at most 3 entries: before saving, prunes old entries.
 * All DB operations use a single transaction.
 */
export async function saveBackup(rawData: string, keyboardName: string): Promise<void> {
  // Serialize via promise queue to prevent concurrent read-then-write races
  const p = _saveQueue.then(() => _saveBackup(rawData, keyboardName));
  _saveQueue = p.then(() => {}, () => {});
  return p;
}

async function _saveBackup(rawData: string, keyboardName: string): Promise<void> {
  const h = quickHash(rawData);
  if (h === lastHash) return; // No change, skip

  const db = await openDB();

  // Single readwrite transaction: read existing entries → prune → add new
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const index = store.index("timestamp");

  const all = await new Promise<BackupEntry[]>((resolve, reject) => {
    const req = index.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  // Keep only the 2 newest, delete the rest
  if (all.length >= 2) {
    all.sort((a, b) => b.timestamp - a.timestamp);
    for (const entry of all.slice(2)) {
      if (entry.id !== undefined) store.delete(entry.id);
    }
  }

  // Add the new entry
  store.add({
    timestamp: Date.now(),
    hostname: "localhost",
    keyboardName: keyboardName || "unnamed",
    rawData,
  } as BackupEntry);

  await new Promise<void>((resolve, reject) => {
    // Bug 2 fix: lastHash only updated AFTER successful write to prevent data loss
    tx.oncomplete = () => { lastHash = h; resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

/** Get all backups, newest first */
export async function getBackups(): Promise<BackupEntry[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const index = store.index("timestamp");

  const all = await new Promise<BackupEntry[]>((resolve, reject) => {
    const req = index.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  all.sort((a, b) => b.timestamp - a.timestamp);
  return all;
}

/** Delete a single backup by id */
export async function deleteBackup(id: number): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.delete(id);
  await new Promise<void>((resolve, reject) => {
    // Bug 6 fix: reset lastHash so next same-content write is not skipped
    tx.oncomplete = () => { lastHash = 0; resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

/** Clear all backups */
export async function clearAllBackups(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  lastHash = 0;
}

/** Download a backup as a JSON file */
export async function downloadBackup(entry: BackupEntry): Promise<void> {
  const filename = generateBackupFilename(entry.hostname, entry.keyboardName, entry.timestamp);

  const { getPlatform, saveFile } = await import("./platform-bridge");
  if (getPlatform() === "tauri") {
    await saveFile(entry.rawData, {
      defaultName: filename,
      mimeType: "application/json",
    });
    return;
  }

  // Web fallback: browser download
  const blob = new Blob([entry.rawData], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
