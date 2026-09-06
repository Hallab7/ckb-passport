import {
  base64UrlDecode,
  decodeDidKey,
} from "@ckb-passport/siwd-core";
import { describe, expect, it } from "vitest";
import {
  clearSoftwareAuthKey,
  generateSoftwareAuthKey,
  signInWithSoftwareKey,
  type SoftwareAuthKeyRecord,
  type SoftwareAuthKeyStore,
} from "../src/index.js";

const did = "did:ckb:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const keyId = "auth-1";
const message = "example.test wants you to sign in with your CKB DID:";

describe("software auth key", () => {
  it("generates, stores, signs with, and clears a local software key", async () => {
    const store = new MemorySoftwareAuthKeyStore();
    const storageKey = "test-software-key";
    const generated = await generateSoftwareAuthKey({
      store,
      storageKey,
      now: () => new Date("2026-09-06T12:00:00Z"),
    });

    expect(decodeDidKey(generated.didKey)).toMatchObject({
      curve: "p256",
    });
    expect(await store.load(storageKey)).toMatchObject({
      didKey: generated.didKey,
      createdAt: "2026-09-06T12:00:00.000Z",
    });

    const proof = await signInWithSoftwareKey({
      did,
      keyId,
      message,
      store,
      storageKey,
    });

    expect(proof).toMatchObject({
      v: 1,
      did,
      keyId,
      message,
      mode: "software",
    });
    expect(base64UrlDecode(proof.signature)).toHaveLength(64);
    expect("clientDataJSON" in proof).toBe(false);
    expect("authenticatorData" in proof).toBe(false);

    await clearSoftwareAuthKey({ store, storageKey });
    expect(await store.load(storageKey)).toBeNull();
  });
});

class MemorySoftwareAuthKeyStore implements SoftwareAuthKeyStore {
  private readonly records = new Map<string, SoftwareAuthKeyRecord>();

  async load(storageKey: string): Promise<SoftwareAuthKeyRecord | null> {
    return this.records.get(storageKey) ?? null;
  }

  async save(
    storageKey: string,
    record: SoftwareAuthKeyRecord,
  ): Promise<void> {
    this.records.set(storageKey, record);
  }

  async remove(storageKey: string): Promise<void> {
    this.records.delete(storageKey);
  }
}
