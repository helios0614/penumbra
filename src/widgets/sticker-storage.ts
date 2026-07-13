const STICKER_DATABASE_NAME = 'penumbra-widget-assets';
const STICKER_DATABASE_VERSION = 1;
const STICKER_STORE_NAME = 'images';
const DESKTOP_STICKER_KEY = 'desktop-sticker';

function openStickerDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前浏览器不支持贴纸图片存储'));
      return;
    }

    const request = indexedDB.open(STICKER_DATABASE_NAME, STICKER_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STICKER_STORE_NAME)) {
        database.createObjectStore(STICKER_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开贴纸图片存储'));
  });
}

function runStickerTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openStickerDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STICKER_STORE_NAME, mode);
    const request = operation(transaction.objectStore(STICKER_STORE_NAME));
    let result: T;

    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error ?? new Error('贴纸图片存储操作失败'));
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('贴纸图片存储事务失败'));
    };
  }));
}

export async function getStickerImage(): Promise<Blob | null> {
  const result = await runStickerTransaction<Blob | undefined>(
    'readonly',
    (store) => store.get(DESKTOP_STICKER_KEY),
  );
  return result ?? null;
}

export async function saveStickerImage(file: Blob): Promise<void> {
  await runStickerTransaction<IDBValidKey>(
    'readwrite',
    (store) => store.put(file, DESKTOP_STICKER_KEY),
  );
}
