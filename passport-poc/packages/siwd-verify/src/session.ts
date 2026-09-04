import { randomBytes } from "node:crypto";

export type PassportSession = {
  did: string;
  keyId: string;
  issuedAt: Date;
  expirationTime: Date;
};

export type IssuedPassportSession = {
  token: string;
  session: PassportSession;
};

export type SessionIssueOptions = {
  ttlMs?: number;
  now?: () => Date;
  tokenBytes?: number;
};

const DEFAULT_SESSION_TTL_MS = 60 * 60 * 1000;
const DEFAULT_TOKEN_BYTES = 32;

export class InMemorySessionService {
  private readonly sessions = new Map<string, PassportSession>();
  private readonly ttlMs: number;
  private readonly now: () => Date;
  private readonly tokenBytes: number;

  constructor(options: SessionIssueOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
    this.now = options.now ?? (() => new Date());
    this.tokenBytes = options.tokenBytes ?? DEFAULT_TOKEN_BYTES;

    if (this.ttlMs <= 0) {
      throw new Error("Session TTL must be positive");
    }
    if (this.tokenBytes < 16) {
      throw new Error("Session token must be at least 16 random bytes");
    }
  }

  issue(did: string, keyId: string, token = generateSessionToken(this.tokenBytes)): IssuedPassportSession {
    const issuedAt = this.now();
    const session = {
      did,
      keyId,
      issuedAt,
      expirationTime: new Date(issuedAt.getTime() + this.ttlMs),
    };
    this.sessions.set(token, session);
    return {
      token,
      session: cloneSession(session),
    };
  }

  get(token: string | undefined): PassportSession | undefined {
    if (!token) {
      return undefined;
    }
    const session = this.sessions.get(token);
    if (!session) {
      return undefined;
    }
    if (this.now().getTime() >= session.expirationTime.getTime()) {
      this.sessions.delete(token);
      return undefined;
    }
    return cloneSession(session);
  }

  clear(token: string | undefined): boolean {
    return token ? this.sessions.delete(token) : false;
  }
}

export function generateSessionToken(byteLength = DEFAULT_TOKEN_BYTES): string {
  if (byteLength < 16) {
    throw new Error("Session token must be at least 16 random bytes");
  }
  return randomBytes(byteLength).toString("base64url");
}

function cloneSession(session: PassportSession): PassportSession {
  return {
    did: session.did,
    keyId: session.keyId,
    issuedAt: new Date(session.issuedAt),
    expirationTime: new Date(session.expirationTime),
  };
}
