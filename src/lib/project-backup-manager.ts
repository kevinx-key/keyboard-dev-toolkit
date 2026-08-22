/**
 * Project Backup Manager — IndexedDB based auto-backup for full project data
 *
 * Separate from the raw-data backup-manager.ts.
 * Stores the same content as Save All Data (KLE layout + plate rotations + PCB rotations).
 *
 * Rules:
 * - Keeps at most 3 entries (oldest pruned when saving the 4th)
 * - NOT cleared on app startup (retained across sessions, pruned only by limit)
 * - Each entry stores the full project JSON string
 */

const DB_NAME = "custom-key-pcb-tool-project-backups";
const DB_VERSION = 1;
const STORE_NAME = "project_backups";

export interface ProjectBackupEntry {
  id?: number;
  timestamp: number;
  keyboardName: string;
  projectData: string; // Full project JSON (same as Save All Data)
}

/** Format timestamp as YYYYMMDDHHmm (local time, no separator) */
export function formatBackupTimeCompact(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${y}${M}${D}${h}${m}`;
}

/** Generate backup filename: KeyboardName-YYYYMMDDHHmm-backup.json */
export function generateProjectBackupFilename(keyboardName: string, ts: number): string {
  const safeName = (keyboardName || "Untitled").replace(/[^a-zA-Z0-9_一-鿿-]/g, "_") || "Untitled";
  return `${safeName}-${formatBackupTimeCompact(ts)}-backup.json`;
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

/** Promise queue mutex: serializes concurrent saveProjectBackup calls */
let _saveQueue = Promise.resolve();

/**
 * Save a project backup snapshot.
 * Prunes to max 3 entries (keeps the 2 newest + the new one).
 */
export async function saveProjectBackup(projectData: string, keyboardName: string): Promise<void> {
  // Serialize via promise queue to prevent concurrent read-then-write races
  const p = _saveQueue.then(() => _saveProjectBackup(projectData, keyboardName));
  _saveQueue = p.then(() => {}, () => {});
  return p;
}

async function _saveProjectBackup(projectData: string, keyboardName: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const index = store.index("timestamp");

  const all = await new Promise<ProjectBackupEntry[]>((resolve, reject) => {
    const req = index.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  // Prune: keep the 2 newest, delete the rest
  if (all.length >= 2) {
    all.sort((a, b) => b.timestamp - a.timestamp);
    for (const entry of all.slice(2)) {
      if (entry.id !== undefined) store.delete(entry.id);
    }
  }

  store.add({
    timestamp: Date.now(),
    keyboardName: keyboardName || "Untitled",
    projectData,
  } as ProjectBackupEntry);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Get all project backups, newest first */
export async function getProjectBackups(): Promise<ProjectBackupEntry[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const index = store.index("timestamp");

  const all = await new Promise<ProjectBackupEntry[]>((resolve, reject) => {
    const req = index.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  all.sort((a, b) => b.timestamp - a.timestamp);
  return all;
}

/** Clear all project backups (called on app startup) */
export async function clearProjectBackups(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
