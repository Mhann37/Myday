// Encrypted device storage. The unlock key exists only in this page's memory.
// A separate device passphrase is required after a fresh launch; never store it.
let key = null;
const DB = "myday-private-v1";
async function db() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("vault");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function get(name) {
  const d = await db();
  try {
    return await new Promise((resolve, reject) => {
      const tx = d.transaction("vault", "readonly");
      const r = tx.objectStore("vault").get(name);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    d.close();
  }
}
async function put(values) {
  const d = await db();
  try {
    await new Promise((resolve, reject) => {
      const tx = d.transaction("vault", "readwrite");
      for (const [name, value] of Object.entries(values))
        tx.objectStore("vault").put(value, name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    d.close();
  }
}
async function derive(passphrase, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
async function encode(value, k = key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    k,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return { iv, bytes };
}
export async function metadata() {
  return (await get("meta")) ?? null;
}
export function isUnlocked() {
  return key !== null;
}
export async function configure(passphrase, payload) {
  if (passphrase.length < 8)
    throw new Error("Use at least 8 characters for your device passphrase.");
  if (await metadata())
    throw new Error("Device storage is already enabled. Unlock it first.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const candidate = await derive(passphrase, salt);
  await put({ meta: { salt }, payload: await encode(payload, candidate) });
  key = candidate;
  if (navigator.storage?.persist)
    await navigator.storage.persist().catch(() => false);
}
export async function unlock(passphrase) {
  const meta = await metadata();
  if (!meta)
    throw new Error("Offline storage has not been enabled on this device.");
  const candidate = await derive(passphrase, meta.salt);
  try {
    const record = await get("payload");
    const bytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: record.iv },
      candidate,
      record.bytes,
    );
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    key = candidate;
    return payload;
  } catch {
    throw new Error("The device passphrase did not unlock your offline data.");
  }
}
export async function read() {
  if (!key) throw new Error("Unlock device storage before saving.");
  const r = await get("payload");
  const bytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: r.iv },
    key,
    r.bytes,
  );
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function update(fn) {
  if (!navigator.locks)
    throw new Error(
      "This browser cannot safely coordinate offline saves. Use a supported browser.",
    );
  return navigator.locks.request("myday-vault-write", async () => {
    const next = await fn(await read());
    await put({ payload: await encode(next) });
    return next;
  });
}
export function lock() {
  key = null;
}
export async function wipe() {
  await navigator.locks.request("myday-vault-write", async () => {
    const payload = await read();
    if (payload.queue?.length)
      throw new Error("Sync device changes before removing the copy.");
    const d = await db();
    try {
      await new Promise((resolve, reject) => {
        const tx = d.transaction("vault", "readwrite");
        tx.objectStore("vault").clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      key = null;
    } finally {
      d.close();
    }
  });
}
