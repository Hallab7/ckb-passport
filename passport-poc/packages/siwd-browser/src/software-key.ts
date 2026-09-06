import {
  base64UrlEncode,
  bytesFromUtf8,
  encodeDidKey,
  normalizeRawEcdsaSignature,
} from "@ckb-passport/siwd-core";
import { compressP256PublicKey } from "./passkey-did-key.js";

export const DEFAULT_SOFTWARE_AUTH_KEY_STORAGE_KEY =
  "ckb-passport:software-auth-key:v1";

const DEFAULT_DB_NAME = "ckb-passport";
const DEFAULT_STORE_NAME = "software-auth-keys";

export type SoftwareProofEnvelope = {
  v: 1;
  did: string;
  keyId: string;
  message: string;
  mode: "software";
  signature: string;
};

export type SoftwareAuthKeyRecord = {
  didKey: string;
  createdAt: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
};

export type SoftwareAuthKeyState = {
  didKey: string;
  keyPair: CryptoKeyPair;
  record: SoftwareAuthKeyRecord;
};

export type SoftwareAuthKeyStore = {
  load(storageKey: string): Promise<SoftwareAuthKeyRecord | null>;
  save(storageKey: string, record: SoftwareAuthKeyRecord): Promise<void>;
  remove(storageKey: string): Promise<void>;
};

export type GenerateSoftwareAuthKeyOptions = {
  storageKey?: string;
  store?: SoftwareAuthKeyStore;
  crypto?: Crypto;
  now?: () => Date;
};

export type SignInWithSoftwareKeyOptions = {
  did: string;
  keyId: string;
  message: string;
  storageKey?: string;
  keyPair?: CryptoKeyPair;
  store?: SoftwareAuthKeyStore;
  crypto?: Crypto;
};

export type LoadSoftwareAuthKeyOptions = {
  storageKey?: string;
  store?: SoftwareAuthKeyStore;
  crypto?: Crypto;
};

export class SoftwareAuthKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SoftwareAuthKeyError";
  }
}

export class IndexedDbSoftwareAuthKeyStore implements SoftwareAuthKeyStore {
  constructor(
    private readonly dbName = DEFAULT_DB_NAME,
    private readonly storeName = DEFAULT_STORE_NAME,
  ) {}

  async load(storageKey: string): Promise<SoftwareAuthKeyRecord | null> {
    const db = await this.openDb();
    try {
      return await requestResult<SoftwareAuthKeyRecord | undefined>(
        db
          .transaction(this.storeName, "readonly")
          .objectStore(this.storeName)
          .get(storageKey),
      ).then((record) => record ?? null);
    } finally {
      db.close();
    }
  }

  async save(
    storageKey: string,
    record: SoftwareAuthKeyRecord,
  ): Promise<void> {
    const db = await this.openDb();
    try {
      await requestResult(
        db
          .transaction(this.storeName, "readwrite")
          .objectStore(this.storeName)
          .put(record, storageKey),
      );
    } finally {
      db.close();
    }
  }

  async remove(storageKey: string): Promise<void> {
    const db = await this.openDb();
    try {
      await requestResult(
        db
          .transaction(this.storeName, "readwrite")
          .objectStore(this.storeName)
          .delete(storageKey),
      );
    } finally {
      db.close();
    }
  }

  private openDb(): Promise<IDBDatabase> {
    if (!globalThis.indexedDB) {
      throw new SoftwareAuthKeyError("IndexedDB is unavailable");
    }

    return new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(this.storeName)) {
          request.result.createObjectStore(this.storeName);
        }
      };
      request.onerror = () =>
        reject(
          new SoftwareAuthKeyError(
            request.error?.message ?? "Failed to open software key storage",
          ),
        );
      request.onsuccess = () => resolve(request.result);
    });
  }
}

export async function generateSoftwareAuthKey(
  options: GenerateSoftwareAuthKeyOptions = {},
): Promise<SoftwareAuthKeyState> {
  const crypto = getCrypto(options.crypto);
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const didKey = await didKeyFromP256PublicKey(crypto, keyPair.publicKey);
  const record: SoftwareAuthKeyRecord = {
    didKey,
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
    publicKeyJwk: await crypto.subtle.exportKey("jwk", keyPair.publicKey),
    privateKeyJwk: await crypto.subtle.exportKey("jwk", keyPair.privateKey),
  };

  await getStore(options.store).save(
    options.storageKey ?? DEFAULT_SOFTWARE_AUTH_KEY_STORAGE_KEY,
    record,
  );

  return { didKey, keyPair, record };
}

export async function loadSoftwareAuthKey(
  options: LoadSoftwareAuthKeyOptions = {},
): Promise<SoftwareAuthKeyState | null> {
  const record = await getStore(options.store).load(
    options.storageKey ?? DEFAULT_SOFTWARE_AUTH_KEY_STORAGE_KEY,
  );
  if (!record) {
    return null;
  }

  const crypto = getCrypto(options.crypto);
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    record.publicKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    record.privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );

  return {
    didKey: record.didKey,
    keyPair: { publicKey, privateKey },
    record,
  };
}

export async function clearSoftwareAuthKey(
  options: Pick<LoadSoftwareAuthKeyOptions, "storageKey" | "store"> = {},
): Promise<void> {
  await getStore(options.store).remove(
    options.storageKey ?? DEFAULT_SOFTWARE_AUTH_KEY_STORAGE_KEY,
  );
}

export async function signInWithSoftwareKey(
  options: SignInWithSoftwareKeyOptions,
): Promise<SoftwareProofEnvelope> {
  const crypto = getCrypto(options.crypto);
  const keyPair =
    options.keyPair ??
    (await loadSoftwareAuthKey({
      storageKey: options.storageKey,
      store: options.store,
      crypto,
    }))?.keyPair;
  if (!keyPair) {
    throw new SoftwareAuthKeyError("No software auth key is registered");
  }

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.privateKey,
      toArrayBuffer(bytesFromUtf8(options.message)),
    ),
  );
  const lowSSignature = normalizeRawEcdsaSignature("p256", signature);

  return {
    v: 1,
    did: options.did,
    keyId: options.keyId,
    message: options.message,
    mode: "software",
    signature: base64UrlEncode(lowSSignature),
  };
}

async function didKeyFromP256PublicKey(
  crypto: Crypto,
  publicKey: CryptoKey,
): Promise<string> {
  const rawPublicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", publicKey),
  );
  if (rawPublicKey.length !== 65 || rawPublicKey[0] !== 0x04) {
    throw new SoftwareAuthKeyError("P-256 public key must be uncompressed");
  }

  const compressed = compressP256PublicKey(
    rawPublicKey.slice(1, 33),
    rawPublicKey.slice(33),
  );
  return encodeDidKey("p256", compressed);
}

function getStore(store?: SoftwareAuthKeyStore): SoftwareAuthKeyStore {
  return store ?? new IndexedDbSoftwareAuthKeyStore();
}

function getCrypto(crypto?: Crypto): Crypto {
  const implementation = crypto ?? globalThis.crypto;
  if (!implementation?.subtle) {
    throw new SoftwareAuthKeyError("WebCrypto subtle API is unavailable");
  }
  return implementation;
}

function requestResult<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () =>
      reject(
        new SoftwareAuthKeyError(
          request.error?.message ?? "Software key storage request failed",
        ),
      );
    request.onsuccess = () => resolve(request.result);
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
