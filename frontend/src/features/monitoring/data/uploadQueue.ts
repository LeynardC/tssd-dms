// Offline upload queue — IndexedDB-backed, same "save now, sync later"
// spirit as the locked draft-autosave design, but for file uploads instead
// of form text. A queued upload survives a closed browser/laptop and
// retries automatically once connectivity returns.

import { uploadFileWithProgress, replaceFile } from "./fileStore";

const DB_NAME = "tssd-dms-upload-queue";
const DB_VERSION = 1;
const STORE_NAME = "pending-uploads";
const WARNING_THRESHOLD = 5;

export interface QueuedUpload {
  id: string;
  programId: string;
  folderId: number | null;
  fileName: string;
  fileBlob: Blob;
  parsedData?: unknown;
  queuedAt: string;
  // Set when this queued item is replacing an existing file's data (not
  // creating a new one) — flushQueue() branches on this to call replaceFile()
  // instead of uploadFileWithProgress().
  replaceTargetId?: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    Promise.resolve(fn(store))
      .then((result) => {
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
      })
      .catch(reject);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueUpload(entry: {
  programId: string;
  folderId: number | null;
  file: File;
  parsedData?: unknown;
  replaceTargetId?: number;
}): Promise<string> {
  const queued: QueuedUpload = {
    id: crypto.randomUUID(),
    programId: entry.programId,
    folderId: entry.folderId,
    fileName: entry.file.name,
    fileBlob: entry.file,
    parsedData: entry.parsedData,
    queuedAt: new Date().toISOString(),
    replaceTargetId: entry.replaceTargetId,
  };
  await withStore("readwrite", (store) => store.put(queued));
  return queued.id;
}

export async function getQueuedUploads(): Promise<QueuedUpload[]> {
  return withStore("readonly", (store) =>
    requestToPromise(store.getAll() as IDBRequest<QueuedUpload[]>),
  );
}

export async function removeQueuedUpload(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export function isQueueGettingLarge(count: number): boolean {
  return count >= WARNING_THRESHOLD;
}

// Attempts to upload every queued file, in the order they were queued.
// Successes are removed from the queue; failures stay queued for the next
// attempt (e.g. the next 'online' event, or the next app launch).
export async function flushQueue(
  onProgress?: (queuedId: string, percent: number) => void,
): Promise<{ succeeded: number; failed: number }> {
  const pending = await getQueuedUploads();
  let succeeded = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      const file = new File([item.fileBlob], item.fileName);
      if (item.replaceTargetId != null) {
        await replaceFile(
          item.replaceTargetId,
          file,
          (percent) => onProgress?.(item.id, percent),
          item.parsedData,
        );
      } else {
        await uploadFileWithProgress(
          item.programId,
          item.folderId,
          file,
          (percent) => onProgress?.(item.id, percent),
          item.parsedData,
        );
      }
      await removeQueuedUpload(item.id);
      succeeded++;
    } catch {
      // Leave it queued — network may still be flaky, or the server may
      // be briefly unreachable even though 'online' fired. Next trigger
      // (another online event, or next app launch) will retry it.
      failed++;
    }
  }

  return { succeeded, failed };
}
