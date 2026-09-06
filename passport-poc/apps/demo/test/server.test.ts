import { ccc } from "@ckb-ccc/core";
import type { PassportPocConfig, VerifySiwdProofResult } from "@ckb-passport/siwd-verify";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoServer, type DemoProofVerifier } from "../src/server.js";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const config: PassportPocConfig = {
  network: "ckb-testnet",
  ckbRpcUrl: "http://127.0.0.1:8114/",
  ckbIndexerUrl: "http://127.0.0.1:8116/",
  didCodeHash: `0x${"99".repeat(32)}`,
  didHashType: "type",
  expectedOrigin: "http://localhost:3000",
};

const did = "did:ckb:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const keyId = "auth-1";
const servers: Server[] = [];

describe("demo server", () => {
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
  });

  it("issues a nonce and canonical message for the configured testnet origin", async () => {
    const { baseUrl } = await startServer();
    const configResponse = await fetch(`${baseUrl}/api/config`);
    const configBody = await configResponse.json();
    const response = await fetch(`${baseUrl}/api/nonce?did=${did}&keyId=${keyId}`);
    const body = await response.json();

    expect(configBody).toMatchObject({
      ok: true,
      didUpdateEnabled: false,
      hasDidLockSigner: false,
    });
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      expectedOrigin: "http://localhost:3000",
      network: "ckb-testnet",
      rpId: "localhost",
    });
    expect(body.nonce).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(body.message).toContain(`${new URL(config.expectedOrigin).host} wants you to sign in`);
    expect(body.message).toContain(`DID:\n${did}`);
    expect(JSON.stringify(body)).not.toContain("address");
  });

  it("serves the browser demo page and assets", async () => {
    const { baseUrl } = await startServer();
    const pageResponse = await fetch(`${baseUrl}/`);
    const page = await pageResponse.text();
    const scriptResponse = await fetch(`${baseUrl}/app.js`);
    const script = await scriptResponse.text();

    expect(pageResponse.headers.get("content-type")).toContain("text/html");
    expect(page).toContain("Wallet-first DID demo");
    expect(page).toContain("CCC wallet connection");
    expect(page).not.toContain("id=\"didInput\"");
    expect(page).not.toContain("Submit Wallet Proof");
    expect(scriptResponse.headers.get("content-type")).toContain("text/javascript");
    expect(script).toContain("demoLink");
    expect(script).not.toContain("mode: \"wallet\"");
    expect(script).not.toContain("localStorage");
  });

  it("returns named verification failures without creating a session", async () => {
    const { baseUrl } = await startServer({
      verifyProof: async () => ({
        ok: false,
        code: "domain_mismatch",
        message: "message domain does not match expected origin host",
      }),
    });
    const response = await fetch(`${baseUrl}/api/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proof: { v: 1 } }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      ok: false,
      code: "domain_mismatch",
    });
  });

  it("creates a DID-only session after a successful proof", async () => {
    const { baseUrl } = await startServer({
      verifyProof: async () => ({
        ok: true,
        did,
        keyId,
        mode: "webauthn",
      }),
    });
    const verifyResponse = await fetch(`${baseUrl}/api/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proof: { v: 1, did, keyId } }),
    });
    const verifyBody = await verifyResponse.json();
    const cookie = verifyResponse.headers.get("set-cookie")?.split(";")[0];

    expect(verifyResponse.status).toBe(200);
    expect(cookie).toMatch(/^ckb_passport_session=/);
    expect(verifyBody.session).toMatchObject({ did, keyId });
    expect(JSON.stringify(verifyBody.session)).not.toContain("address");
    expect(JSON.stringify(verifyBody.session)).not.toContain("lock");

    const sessionResponse = await fetch(`${baseUrl}/api/session`, {
      headers: { cookie: cookie ?? "" },
    });
    const sessionBody = await sessionResponse.json();

    expect(sessionBody).toMatchObject({
      ok: true,
      authenticated: true,
      session: { did, keyId },
    });
    expect(Object.keys(sessionBody.session).sort()).toEqual([
      "did",
      "expirationTime",
      "issuedAt",
      "keyId",
    ]);
  });

  it("clears the current session cookie and session record", async () => {
    const { baseUrl } = await startServer({
      verifyProof: async () => ({
        ok: true,
        did,
        keyId,
        mode: "software",
      }),
    });
    const verifyResponse = await fetch(`${baseUrl}/api/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proof: { v: 1, did, keyId } }),
    });
    const cookie = verifyResponse.headers.get("set-cookie")?.split(";")[0];

    const clearResponse = await fetch(`${baseUrl}/api/session/clear`, {
      method: "POST",
      headers: { cookie: cookie ?? "" },
    });
    const clearBody = await clearResponse.json();
    const expiredCookie = clearResponse.headers.get("set-cookie");

    expect(clearBody).toEqual({ ok: true, cleared: true });
    expect(expiredCookie).toContain("Max-Age=0");

    const sessionResponse = await fetch(`${baseUrl}/api/session`, {
      headers: { cookie: cookie ?? "" },
    });
    const sessionBody = await sessionResponse.json();
    expect(sessionBody).toEqual({
      ok: true,
      authenticated: false,
      session: null,
    });
  });

  it("keeps DID update disabled unless the server opts in", async () => {
    const { baseUrl } = await startServer();
    const response = await fetch(`${baseUrl}/api/did/update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        did,
        keyId,
        didKey: "did:key:zDnaejgmAHMLkBPMBWnkBxyGxpXx8LgE4WJAYDhwZzyoRAddF",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      ok: false,
      code: "did_update_disabled",
    });
  });

  it("returns a named error for malformed passkey attestation input", async () => {
    const { baseUrl } = await startServer();
    const response = await fetch(`${baseUrl}/api/passkey/did-key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attestationObject: "AA" }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      ok: false,
      code: "passkey_attestation_invalid",
    });
  });
});

async function startServer(options: { verifyProof?: DemoProofVerifier } = {}): Promise<{
  baseUrl: string;
}> {
  const server = createDemoServer({
    config,
    client: {} as ccc.Client,
    verifyProof: options.verifyProof ?? okVerifier,
    env: {},
  });
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

const okVerifier = async (): Promise<VerifySiwdProofResult> => ({
  ok: true,
  did,
  keyId,
  mode: "software",
});
