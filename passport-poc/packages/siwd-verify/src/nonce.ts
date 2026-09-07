import { randomInt } from "node:crypto";

export type NonceRecord = {
  nonce: string;
  issuedAt: Date;
  expirationTime: Date;
  consumed: boolean;
  reserved: boolean;
};

export type NonceConsumeResult =
  | { ok: true; record: NonceRecord }
  | {
      ok: false;
      code: "nonce_unknown" | "nonce_expired" | "nonce_consumed" | "nonce_reserved";
    };

export type NonceServiceOptions = {
  ttlMs?: number;
  nonceLength?: number;
  now?: () => Date;
};

const DEFAULT_NONCE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_NONCE_LENGTH = 16;
const NONCE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export class InMemoryNonceService {
  private readonly records = new Map<string, NonceRecord>();
  private readonly ttlMs: number;
  private readonly nonceLength: number;
  private readonly now: () => Date;

  constructor(options: NonceServiceOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_NONCE_TTL_MS;
    this.nonceLength = options.nonceLength ?? DEFAULT_NONCE_LENGTH;
    this.now = options.now ?? (() => new Date());

    if (this.ttlMs <= 0) {
      throw new Error("Nonce TTL must be positive");
    }
    if (this.nonceLength < 8) {
      throw new Error("Nonce length must be at least 8");
    }
  }

  issue(nonce = generateNonce(this.nonceLength)): NonceRecord {
    if (!/^[a-zA-Z0-9]{8,}$/.test(nonce)) {
      throw new Error("Nonce must be at least 8 alphanumeric characters");
    }
    if (this.records.has(nonce)) {
      throw new Error("Nonce already exists");
    }

    const issuedAt = this.now();
    const record = {
      nonce,
      issuedAt,
      expirationTime: new Date(issuedAt.getTime() + this.ttlMs),
      consumed: false,
      reserved: false,
    };
    this.records.set(nonce, record);
    return { ...record };
  }

  consume(nonce: string): NonceConsumeResult {
    const reserved = this.reserve(nonce);
    if (!reserved.ok) {
      return reserved;
    }
    return this.commit(nonce);
  }

  reserve(nonce: string): NonceConsumeResult {
    const record = this.records.get(nonce);
    if (!record) {
      return { ok: false, code: "nonce_unknown" };
    }
    if (record.consumed) {
      return { ok: false, code: "nonce_consumed" };
    }
    if (record.reserved) {
      return { ok: false, code: "nonce_reserved" };
    }
    if (this.now().getTime() >= record.expirationTime.getTime()) {
      record.consumed = true;
      return { ok: false, code: "nonce_expired" };
    }

    record.reserved = true;
    return { ok: true, record: { ...record } };
  }

  commit(nonce: string): NonceConsumeResult {
    const record = this.records.get(nonce);
    if (!record) {
      return { ok: false, code: "nonce_unknown" };
    }
    if (record.consumed) {
      return { ok: false, code: "nonce_consumed" };
    }
    if (!record.reserved) {
      return { ok: false, code: "nonce_unknown" };
    }

    record.reserved = false;
    record.consumed = true;
    return { ok: true, record: { ...record } };
  }

  release(nonce: string): boolean {
    const record = this.records.get(nonce);
    if (!record || record.consumed || !record.reserved) {
      return false;
    }
    record.reserved = false;
    return true;
  }

  get(nonce: string): NonceRecord | undefined {
    const record = this.records.get(nonce);
    return record ? { ...record } : undefined;
  }
}

export function generateNonce(length = DEFAULT_NONCE_LENGTH): string {
  if (length < 8) {
    throw new Error("Nonce length must be at least 8");
  }

  let nonce = "";
  for (let index = 0; index < length; index += 1) {
    nonce += NONCE_ALPHABET[randomInt(NONCE_ALPHABET.length)];
  }
  return nonce;
}
