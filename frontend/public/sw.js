/**
 * Service Worker — intercepts /api/uploads/* requests and serves from IndexedDB.
 * This makes existing scene scripts that reference /api/uploads/<filename> work
 * without any backend.
 */

const DB_NAME = "siljangnim";
const DB_VERSION = 1;
const STORE_BLOBS = "blobs";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects");
      if (!db.objectStoreNames.contains(STORE_BLOBS)) db.createObjectStore(STORE_BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(store, key) {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getActiveProject() {
  // Read from localStorage (not available in SW, so we use a workaround)
  // SW doesn't have localStorage access, so we need to use IndexedDB or
  // accept a default. We'll scan blob keys to find matches.
  return null; // Will search all projects
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only intercept /api/uploads/* requests
  if (!url.pathname.startsWith("/api/uploads/")) return;

  event.respondWith(handleUploadRequest(url.pathname));
});

async function handleUploadRequest(pathname) {
  const filename = pathname.replace("/api/uploads/", "");
  if (!filename) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_BLOBS, "readonly");
    const store = tx.objectStore(STORE_BLOBS);

    // Get all keys and find the matching upload
    const allKeys = await new Promise((resolve, reject) => {
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    // Find key ending with /uploads/<filename>
    const matchKey = allKeys.find((k) => k.endsWith(`/uploads/${filename}`));
    if (!matchKey) {
      return new Response("Not found", { status: 404 });
    }

    const entry = await idbGet(store, matchKey);
    if (!entry || !entry.data) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(entry.data, {
      status: 200,
      headers: {
        "Content-Type": entry.mimeType || "application/octet-stream",
        "Content-Length": entry.size || entry.data.byteLength,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("[SW] Error serving upload:", err);
    return new Response("Internal error", { status: 500 });
  }
}
