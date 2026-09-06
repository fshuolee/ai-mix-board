
const DB_NAME = 'InfinityCanvasDB';
const STORE_NAME = 'images';
const HASH_STORE_NAME = 'image_hashes';
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;

const initDB = (): Promise<IDBDatabase> => {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject('Error opening DB');
    };
    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(HASH_STORE_NAME)) {
        db.createObjectStore(HASH_STORE_NAME, { keyPath: 'hash' });
      }
    };
  });
  return dbPromise;
};

export const calculateBlobHash = async (blob: Blob): Promise<string> => {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export function isDriveFileId(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  if (id.startsWith('gen_') || id.startsWith('node_') || /^\d{10,18}$/.test(id)) {
    return false;
  }
  return /^[a-zA-Z0-9_-]{18,60}$/.test(id);
}

// High performance in-memory Blob cache to avoid redundant IndexedDB async queries
const memoryBlobCache = new Map<string, Blob>();

export const storeImage = async (
  id: string,
  blob: Blob,
  hash?: string,
  isDriveAsset: boolean = false
): Promise<void> => {
  memoryBlobCache.set(id, blob);
  const db = await initDB();
  const actualHash = hash || (await calculateBlobHash(blob));

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, HASH_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const hashStore = transaction.objectStore(HASH_STORE_NAME);

    store.put({ id, blob, hash: actualHash });

    // CRITICAL: Only map hash -> fileId in HASH_STORE_NAME if it is a genuine Google Drive file ID!
    // Never store temporary local IDs (e.g. timestamp or gen_*),
    // otherwise uploadAssetToDrive will mistake local IDs for completed Drive uploads and skip uploading!
    if (isDriveAsset || isDriveFileId(id)) {
      hashStore.put({ hash: actualHash, fileId: id });
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      console.error('Error storing image:', transaction.error);
      reject('Error storing image');
    };
  });
};

export const associateDriveFileId = async (
  driveFileId: string,
  hash: string,
  blob?: Blob
): Promise<void> => {
  if (!isDriveFileId(driveFileId)) return;
  if (blob) {
    memoryBlobCache.set(driveFileId, blob);
  }
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, HASH_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const hashStore = transaction.objectStore(HASH_STORE_NAME);

    if (blob) {
      store.put({ id: driveFileId, blob, hash });
    }
    hashStore.put({ hash, fileId: driveFileId });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
};

export const getFileIdByHash = async (hash: string): Promise<string | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HASH_STORE_NAME, 'readonly');
    const store = transaction.objectStore(HASH_STORE_NAME);
    const request = store.get(hash);
    request.onsuccess = () => {
      const fileId = request.result?.fileId || null;
      if (fileId && isDriveFileId(fileId)) {
        resolve(fileId);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => {
      console.error('Error finding image by hash:', request.error);
      resolve(null);
    };
  });
};

export const getImage = async (id: string): Promise<Blob | null> => {
  if (memoryBlobCache.has(id)) {
    return memoryBlobCache.get(id)!;
  }
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => {
      const blob = request.result?.blob || null;
      if (blob) {
        memoryBlobCache.set(id, blob);
      }
      resolve(blob);
    };
    request.onerror = () => {
      console.error('Error getting image:', request.error);
      reject('Error getting image');
    };
  });
};

export const deleteImage = async (id: string): Promise<void> => {
  memoryBlobCache.delete(id);
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, HASH_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const hashStore = transaction.objectStore(HASH_STORE_NAME);

    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result;
      if (item?.hash) {
        hashStore.delete(item.hash);
      }
      store.delete(id);
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      console.error('Error deleting image:', transaction.error);
      reject('Error deleting image');
    };
  });
};

export const deleteMultipleImages = async (ids: string[]): Promise<void> => {
  if (!ids || ids.length === 0) return;
  ids.forEach(id => memoryBlobCache.delete(id));
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, HASH_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const hashStore = transaction.objectStore(HASH_STORE_NAME);

    let count = 0;
    for (const id of ids) {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (item?.hash) {
          hashStore.delete(item.hash);
        }
        store.delete(id);
      };
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      console.error('Error batch deleting images:', transaction.error);
      reject('Error batch deleting images');
    };
  });
};

export const clearAllLocalImages = async (): Promise<void> => {
  memoryBlobCache.clear();
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, HASH_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const hashStore = transaction.objectStore(HASH_STORE_NAME);

    store.clear();
    hashStore.clear();

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      console.error('Error clearing all local images:', transaction.error);
      reject('Error clearing local cache');
    };
  });
};

export interface LocalCacheStats {
  count: number;
  totalBytes: number;
}

export const getLocalCacheStats = async (): Promise<LocalCacheStats> => {
  const images = await getAllLocalImages();
  let totalBytes = 0;
  for (const img of images) {
    if (img.blob) {
      totalBytes += img.blob.size;
    }
  }
  return {
    count: images.length,
    totalBytes,
  };
};

export interface LocalImageRecord {
  id: string;
  blob: Blob;
  hash?: string;
}

/**
 * Retrieve all locally stored images from IndexedDB.
 */
export const getAllLocalImages = async (): Promise<LocalImageRecord[]> => {
  const db = await initDB();
  return new Promise(resolve => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const records: LocalImageRecord[] = (request.result || []).map((item: any) => ({
        id: item.id,
        blob: item.blob,
        hash: item.hash,
      }));
      resolve(records);
    };
    request.onerror = () => {
      console.error('Error getting all local images:', request.error);
      resolve([]);
    };
  });
};

// Initialize the database on startup
initDB().catch(err => console.error("Failed to initialize DB:", err));
