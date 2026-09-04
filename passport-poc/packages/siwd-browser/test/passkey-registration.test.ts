import { describe, expect, it } from "vitest";
import {
  buildPasskeyCreationOptions,
  PasskeyRegistrationError,
  registerPasskey,
} from "../src/index.js";

describe("buildPasskeyCreationOptions", () => {
  it("builds ES256 platform passkey creation options", () => {
    const options = buildPasskeyCreationOptions({
      rpId: "localhost",
      rpName: "Passport PoC",
      userId: Uint8Array.from([1, 2, 3]),
      userName: "alice",
      userDisplayName: "Alice",
      challenge: Uint8Array.from([4, 5, 6]),
    });

    expect(options.rp).toEqual({ id: "localhost", name: "Passport PoC" });
    expect(options.pubKeyCredParams).toEqual([{ type: "public-key", alg: -7 }]);
    expect(options.authenticatorSelection).toEqual({
      residentKey: "preferred",
      userVerification: "preferred",
    });
    expect(new Uint8Array(options.challenge)).toEqual(Uint8Array.from([4, 5, 6]));
    expect(new Uint8Array(options.user.id)).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it("allows explicit authenticator preferences", () => {
    const options = buildPasskeyCreationOptions({
      rpId: "example.com",
      rpName: "Passport PoC",
      userId: Uint8Array.from([1]),
      userName: "alice",
      userDisplayName: "Alice",
      challenge: Uint8Array.from([2]),
      residentKey: "required",
      userVerification: "required",
    });

    expect(options.authenticatorSelection).toEqual({
      residentKey: "required",
      userVerification: "required",
    });
  });
});

describe("registerPasskey", () => {
  it("returns raw attestation data from a WebAuthn credential", async () => {
    const result = await registerPasskey(
      {
        rpId: "localhost",
        rpName: "Passport PoC",
        userId: Uint8Array.from([1]),
        userName: "alice",
        userDisplayName: "Alice",
        challenge: Uint8Array.from([2]),
      },
      {
        async create() {
          return {
            id: "credential-1",
            rawId: Uint8Array.from([9, 9]).buffer,
            response: {
              attestationObject: Uint8Array.from([1, 2]).buffer,
              clientDataJSON: Uint8Array.from([3, 4]).buffer,
            },
          } as PublicKeyCredential;
        },
      },
    );

    expect(result).toEqual({
      credentialId: "credential-1",
      rawId: Uint8Array.from([9, 9]),
      attestationObject: Uint8Array.from([1, 2]),
      clientDataJSON: Uint8Array.from([3, 4]),
    });
  });

  it("names unavailable WebAuthn support", async () => {
    await expect(
      registerPasskey(
        {
          rpId: "localhost",
          rpName: "Passport PoC",
          userId: Uint8Array.from([1]),
          userName: "alice",
          userDisplayName: "Alice",
          challenge: Uint8Array.from([2]),
        },
        undefined,
      ),
    ).rejects.toThrow(PasskeyRegistrationError);
  });

  it("wraps browser registration failures", async () => {
    await expect(
      registerPasskey(
        {
          rpId: "localhost",
          rpName: "Passport PoC",
          userId: Uint8Array.from([1]),
          userName: "alice",
          userDisplayName: "Alice",
          challenge: Uint8Array.from([2]),
        },
        {
          async create() {
            throw new Error("not allowed");
          },
        },
      ),
    ).rejects.toThrow("Passkey registration failed: not allowed");
  });
});

