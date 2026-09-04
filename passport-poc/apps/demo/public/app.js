const state = {
  config: null,
  message: "",
  credentialId: "",
  didKey: "",
  lastProof: null,
};

const P256_N =
  0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const SECP256K1_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  for (const id of [
    "configStatus",
    "didInput",
    "keyIdInput",
    "nonceButton",
    "messageOutput",
    "registerButton",
    "updateDidButton",
    "passkeySignInButton",
    "credentialOutput",
    "didKeyOutput",
    "passkeyStatus",
    "walletSignButton",
    "walletSubmitButton",
    "walletSignatureInput",
    "walletStatus",
    "replayButton",
    "verifyOutput",
    "sessionOutput",
    "refreshSessionButton",
    "clearSessionButton",
  ]) {
    els[id] = document.getElementById(id);
  }

  els.nonceButton.addEventListener("click", requestNonce);
  els.registerButton.addEventListener("click", registerPasskey);
  els.updateDidButton.addEventListener("click", updateDidDocument);
  els.passkeySignInButton.addEventListener("click", signInWithPasskey);
  els.walletSignButton.addEventListener("click", requestWalletSignature);
  els.walletSubmitButton.addEventListener("click", submitWalletProof);
  els.replayButton.addEventListener("click", replayLastProof);
  els.refreshSessionButton.addEventListener("click", refreshSession);
  els.clearSessionButton.addEventListener("click", clearSession);

  void loadConfig();
  void refreshSession();
});

async function loadConfig() {
  const body = await getJson("/api/config");
  state.config = body;
  els.configStatus.textContent = `${body.network} | ${body.expectedOrigin} | DID update ${
    body.didUpdateEnabled && body.hasDidLockSigner ? "enabled" : "disabled"
  }`;
}

async function requestNonce() {
  await withButton(els.nonceButton, async () => {
    const did = readInput(els.didInput, "DID");
    const keyId = readInput(els.keyIdInput, "Key ID");
    const body = await getJson(
      `/api/nonce?did=${encodeURIComponent(did)}&keyId=${encodeURIComponent(keyId)}`,
    );
    state.message = body.message;
    els.messageOutput.value = body.message;
    showJson(els.verifyOutput, {
      ok: true,
      nonce: body.nonce,
      issuedAt: body.issuedAt,
      expirationTime: body.expirationTime,
    });
  }, els.verifyOutput);
}

async function registerPasskey() {
  await withButton(els.registerButton, async () => {
    requireWebAuthn();
    const did = readInput(els.didInput, "DID");
    const keyId = readInput(els.keyIdInput, "Key ID");
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: {
          id: state.config.rpId,
          name: "CKB Passport PoC",
        },
        user: {
          id: randomBytes(16),
          name: did,
          displayName: keyId,
        },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
        timeout: 60_000,
        attestation: "direct",
      },
    });

    if (!isPublicKeyCredential(credential)) {
      throw new Error("passkey registration returned no public-key credential");
    }

    const attestationObject = bytesToBase64Url(
      new Uint8Array(credential.response.attestationObject),
    );
    const converted = await postJson("/api/passkey/did-key", { attestationObject });

    state.credentialId = bytesToBase64Url(new Uint8Array(credential.rawId));
    state.didKey = converted.didKey;
    els.credentialOutput.value = state.credentialId;
    els.didKeyOutput.value = state.didKey;
    showJson(els.passkeyStatus, converted);
  }, els.passkeyStatus);
}

async function updateDidDocument() {
  await withButton(els.updateDidButton, async () => {
    const did = readInput(els.didInput, "DID");
    const keyId = readInput(els.keyIdInput, "Key ID");
    const didKey = state.didKey || readInput(els.didKeyOutput, "did:key");
    const result = await postJson("/api/did/update", { did, keyId, didKey });
    showJson(els.passkeyStatus, result);
  }, els.passkeyStatus);
}

async function signInWithPasskey() {
  await withButton(els.passkeySignInButton, async () => {
    requireWebAuthn();
    const did = readInput(els.didInput, "DID");
    const keyId = readInput(els.keyIdInput, "Key ID");
    const message = readMessage();
    const requestOptions = {
      challenge: await sha256(message),
      rpId: state.config.rpId,
      userVerification: "preferred",
    };
    if (state.credentialId) {
      requestOptions.allowCredentials = [
        {
          type: "public-key",
          id: base64UrlToBytes(state.credentialId),
        },
      ];
    }

    const credential = await navigator.credentials.get({
      publicKey: requestOptions,
    });
    if (!isPublicKeyAssertion(credential)) {
      throw new Error("passkey assertion returned no public-key assertion");
    }

    const rawSignature = derEcdsaSignatureToRaw(
      new Uint8Array(credential.response.signature),
    );
    const proof = {
      v: 1,
      did,
      keyId,
      message,
      mode: "webauthn",
      signature: bytesToBase64Url(normalizeRawSignature(rawSignature, P256_N)),
      clientDataJSON: bytesToBase64Url(
        new Uint8Array(credential.response.clientDataJSON),
      ),
      authenticatorData: bytesToBase64Url(
        new Uint8Array(credential.response.authenticatorData),
      ),
      credentialId: credential.id,
    };
    await submitProof(proof);
  }, els.verifyOutput);
}

async function requestWalletSignature() {
  await withButton(els.walletSignButton, async () => {
    const signer = findWalletSigner();
    if (!signer) {
      throw new Error("wallet signer unavailable");
    }
    const signature = await signer(readMessage());
    els.walletSignatureInput.value = signature;
    showJson(els.walletStatus, { ok: true, signature });
  }, els.walletStatus);
}

async function submitWalletProof() {
  await withButton(els.walletSubmitButton, async () => {
    const did = readInput(els.didInput, "DID");
    const keyId = readInput(els.keyIdInput, "Key ID");
    const rawSignature = walletSignatureHexToRawBytes(
      readInput(els.walletSignatureInput, "Signature Hex"),
    );
    const proof = {
      v: 1,
      did,
      keyId,
      message: readMessage(),
      mode: "wallet",
      signature: bytesToBase64Url(normalizeRawSignature(rawSignature, SECP256K1_N)),
    };
    await submitProof(proof);
  }, els.walletStatus);
}

async function replayLastProof() {
  await withButton(els.replayButton, async () => {
    if (!state.lastProof) {
      throw new Error("no proof has been submitted");
    }
    const result = await postJson("/api/verify", { proof: state.lastProof });
    showJson(els.verifyOutput, result);
    await refreshSession();
  }, els.verifyOutput);
}

async function submitProof(proof) {
  state.lastProof = proof;
  const result = await postJson("/api/verify", { proof });
  showJson(els.verifyOutput, result);
  await refreshSession();
}

async function refreshSession() {
  const result = await getJson("/api/session");
  showJson(els.sessionOutput, result);
}

async function clearSession() {
  await withButton(els.clearSessionButton, async () => {
    const result = await postJson("/api/session/clear", {});
    showJson(els.verifyOutput, result);
    await refreshSession();
  }, els.verifyOutput);
}

async function getJson(path) {
  const response = await fetch(path);
  return parseApiResponse(response);
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse(response);
}

async function parseApiResponse(response) {
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.message || response.statusText);
    error.details = body;
    throw error;
  }
  return body;
}

async function withButton(button, action, output) {
  button.disabled = true;
  try {
    await action();
  } catch (error) {
    showJson(output, error.details || {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    button.disabled = false;
  }
}

function readInput(input, label) {
  const value = input.value.trim();
  if (!value) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function readMessage() {
  const value = els.messageOutput.value;
  if (!value) {
    throw new Error("message is required");
  }
  return value;
}

function showJson(element, value) {
  element.textContent = JSON.stringify(value, null, 2);
}

function requireWebAuthn() {
  if (!globalThis.PublicKeyCredential || !navigator.credentials) {
    throw new Error("WebAuthn is unavailable in this browser context");
  }
  if (!state.config) {
    throw new Error("server config is not loaded");
  }
}

function findWalletSigner() {
  const candidates = [
    globalThis.ckbPassportWallet,
    globalThis.ckb,
    globalThis.nervos,
  ];
  for (const wallet of candidates) {
    if (wallet && typeof wallet.signMessage === "function") {
      return async (message) => {
        const result = await wallet.signMessage(message);
        return typeof result === "string" ? result : result.signature;
      };
    }
  }
  return undefined;
}

function isPublicKeyCredential(credential) {
  return Boolean(
    credential &&
      credential.type === "public-key" &&
      credential.rawId instanceof ArrayBuffer &&
      credential.response &&
      credential.response.attestationObject instanceof ArrayBuffer,
  );
}

function isPublicKeyAssertion(credential) {
  return Boolean(
    credential &&
      credential.type === "public-key" &&
      credential.response &&
      credential.response.signature instanceof ArrayBuffer &&
      credential.response.clientDataJSON instanceof ArrayBuffer &&
      credential.response.authenticatorData instanceof ArrayBuffer,
  );
}

async function sha256(value) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(input) {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function walletSignatureHexToRawBytes(signatureHex) {
  if (!/^0x[0-9a-fA-F]{128}([0-9a-fA-F]{2})?$/.test(signatureHex)) {
    throw new Error("wallet signature must be 64-byte raw or 65-byte recoverable hex");
  }
  return hexToBytes(`0x${signatureHex.slice(2, 130)}`);
}

function hexToBytes(hex) {
  const value = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function normalizeRawSignature(rawSignature, order) {
  if (rawSignature.length !== 64) {
    throw new Error("raw ECDSA signature must be 64 bytes");
  }
  const normalized = new Uint8Array(rawSignature);
  const s = bytesToBigInt(normalized.slice(32));
  if (s > order / 2n) {
    normalized.set(bigIntToScalar(order - s), 32);
  }
  return normalized;
}

function bytesToBigInt(bytes) {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

function bigIntToScalar(value) {
  const bytes = new Uint8Array(32);
  let rest = value;
  for (let index = 31; index >= 0; index -= 1) {
    bytes[index] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return bytes;
}

function derEcdsaSignatureToRaw(signature) {
  let offset = 0;
  if (readByte(signature, offset) !== 0x30) {
    throw new Error("DER signature must start with a sequence");
  }
  offset += 1;

  const sequence = readDerLength(signature, offset);
  offset = sequence.nextOffset;
  if (offset + sequence.length !== signature.length) {
    throw new Error("DER sequence length is invalid");
  }

  const r = readDerInteger(signature, offset);
  offset = r.nextOffset;
  const s = readDerInteger(signature, offset);
  offset = s.nextOffset;
  if (offset !== signature.length) {
    throw new Error("DER signature has trailing bytes");
  }

  const raw = new Uint8Array(64);
  raw.set(leftPadScalar(r.value), 0);
  raw.set(leftPadScalar(s.value), 32);
  return raw;
}

function readDerInteger(bytes, offset) {
  if (readByte(bytes, offset) !== 0x02) {
    throw new Error("DER integer is missing");
  }
  const length = readDerLength(bytes, offset + 1);
  const start = length.nextOffset;
  const end = start + length.length;
  if (end > bytes.length || length.length === 0) {
    throw new Error("DER integer length is invalid");
  }
  return {
    value: bytes.slice(start, end),
    nextOffset: end,
  };
}

function readDerLength(bytes, offset) {
  const first = readByte(bytes, offset);
  if ((first & 0x80) === 0) {
    return { length: first, nextOffset: offset + 1 };
  }
  const lengthBytes = first & 0x7f;
  if (lengthBytes === 0 || lengthBytes > 2) {
    throw new Error("DER length is invalid");
  }
  if (offset + 1 + lengthBytes > bytes.length) {
    throw new Error("DER length is truncated");
  }
  let length = 0;
  for (let index = 0; index < lengthBytes; index += 1) {
    length = (length << 8) | bytes[offset + 1 + index];
  }
  return { length, nextOffset: offset + 1 + lengthBytes };
}

function leftPadScalar(value) {
  let scalar = value;
  while (scalar.length > 0 && scalar[0] === 0) {
    scalar = scalar.slice(1);
  }
  if (scalar.length > 32) {
    throw new Error("DER scalar is too large");
  }
  const padded = new Uint8Array(32);
  padded.set(scalar, 32 - scalar.length);
  return padded;
}

function readByte(bytes, offset) {
  if (offset >= bytes.length) {
    throw new Error("DER signature is truncated");
  }
  return bytes[offset];
}
