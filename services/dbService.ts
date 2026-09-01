
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

export const storeImage = async (id: string, blob: Blob, hash?: string): Promise<void> => {
  const db = await initDB();
  const actualHash = hash || (await calculateBlobHash(blob));

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, HASH_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const hashStore = transaction.objectStore(HASH_STORE_NAME);

    store.put({ id, blob, hash: actualHash });
    hashStore.put({ hash: actualHash, fileId: id });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      console.error('Error storing image:', transaction.error);
      reject('Error storing image');
    };
  });
};

export const getFileIdByHash = async (hash: string): Promise<string | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HASH_STORE_NAME, 'readonly');
    const store = transaction.objectStore(HASH_STORE_NAME);
    const request = store.get(hash);
    request.onsuccess = () => resolve(request.result?.fileId || null);
    request.onerror = () => {
      console.error('Error finding image by hash:', request.error);
      resolve(null);
    };
  });
};

export const getImage = async (id: string): Promise<Blob | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result?.blob || null);
    request.onerror = () => {
      console.error('Error getting image:', request.error);
      reject('Error getting image');
    };
  });
};

export const deleteImage = async (id: string): Promise<void> => {
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

// Initialize the database on startup
initDB().catch(err => console.error("Failed to initialize DB:", err));
