import { writeFileSync } from "node:fs";
import {
  base64UrlEncode,
  buildSiwdMessage,
  encodeDidKey,
  sha256Bytes,
} from "@ckb-passport/siwd-core";
import { p256 } from "@noble/curves/nist.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { base58btc } from "multiformats/bases/base58";

const origin = "http://localhost:3000";
const did = `did:ckb:${"a".repeat(32)}`;
const keyId = "auth-1";
const now = "2026-09-04T08:00:00Z";
const p256PrivateKey = Uint8Array.from(new Array(32).fill(7));
const otherP256PrivateKey = Uint8Array.from(new Array(32).fill(8));
const secpPrivateKey = Uint8Array.from(new Array(32).fill(9));
const p256DidKey = encodeDidKey("p256", p256.getPublicKey(p256PrivateKey, true));
const otherP256DidKey = encodeDidKey(
  "p256",
  p256.getPublicKey(otherP256PrivateKey, true),
);
const secpDidKey = encodeDidKey(
  "secp256k1",
  secp256k1.getPublicKey(secpPrivateKey, true),
);
const ed25519DidKey = `did:key:${base58btc.encode(
  Uint8Array.from([0xed, 0x01, ...new Array(32).fill(5)]),
)}`;

const baseFields = {
  domain: "localhost:3000",
  did,
  statement: "Sign in to Passport PoC",
  keyId,
  uri: "http://localhost:3000/login",
  version: "1",
  network: "ckb-testnet",
  nonce: "ProofPlan123456",
  issuedAt: "2026-09-04T07:59:00Z",
  expirationTime: "2026-09-04T08:01:00Z",
};

const vectors = [
  pass("valid-webauthn", webauthnProof(), "valid WebAuthn baseline"),
  pass("valid-software", softwareProof(), "valid software auth key baseline"),
  fail("wrong-domain", softwareProof({ domain: "evil.example" }), "domain_mismatch", "2", "message domain differs from the verifier origin"),
  fail("wrong-uri-origin", softwareProof({ uri: "http://evil.example/login" }), "uri_origin_mismatch", "3", "message URI uses a different origin"),
  fail("bad-version", softwareProof({ version: "2" }), "version_invalid", "4", "message version is not supported"),
  fail("wrong-network", softwareProof({ network: "ckb-mainnet" }), "network_mismatch", "5", "message network differs from the verifier network"),
  fail("expired", softwareProof({ issuedAt: "2026-09-04T07:50:00Z", expirationTime: "2026-09-04T07:55:00Z" }), "message_expired", "6", "message expiration is in the past"),
  fail("future-issued", softwareProof({ issuedAt: "2026-09-04T08:02:01Z", expirationTime: "2026-09-04T08:04:00Z" }), "issued_at_too_far_future", "6", "issuedAt exceeds the allowed clock skew"),
  fail("replayed-nonce", softwareProof(), "nonce_consumed", "7 (second submission)", "the same nonce was already committed", { nonceState: "consumed" }),
  fail("malformed-did", softwareProof({ did: `did:ckb:${"a".repeat(31)}` }), "did_invalid", "8", "DID identifier is one character short"),
  fail("did-not-found", softwareProof(), "did_not_found_or_deactivated", "9d", "zero live cells includes nonexistent and deactivated DIDs", { resolver: { liveCells: 0 } }),
  fail("duplicate-cells", softwareProof(), "did_ambiguous", "9e", "two live cells for one type script fail closed", { resolver: { liveCells: 2, document: document(p256DidKey) } }),
  fail("keyid-absent", webauthnProof(), "verification_method_missing", "10", "requested key ID is absent", { resolver: { liveCells: 1, document: { verificationMethods: {} } } }),
  fail("unsupported-multicodec", webauthnProof(), "verification_method_invalid", "11", "Ed25519 is not supported by this PoC", { resolver: { liveCells: 1, document: document(ed25519DidKey) } }),
  fail("wrong-key-signature", softwareProof(), "signature_verification_failed", "12a / 12h", "proof is signed by a key not present in the DID document", { resolver: { liveCells: 1, document: document(otherP256DidKey) } }),
  fail("high-s", { ...softwareProof(), signature: highSSignature() }, "signature_high_s", "12a / 12h", "signature uses a non-canonical high S value"),
  fail("der-encoded", { ...softwareProof(), signature: base64UrlEncode(Uint8Array.from([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01])) }, "signature_invalid", "12 (parse)", "DER encoding is rejected because proofs require raw r||s"),
  fail("curve-confusion", webauthnProof(), "curve_mismatch", "12b precondition", "WebAuthn mode cannot use a secp256k1 verification method", { resolver: { liveCells: 1, document: document(secpDidKey) } }),
  fail("webauthn-origin-mismatch", webauthnProof({}, { origin: "http://evil.example" }), "client_data_origin_mismatch", "12d", "clientData origin differs from the verifier origin"),
  fail("challenge-mismatch", webauthnProof({}, { challenge: base64UrlEncode(sha256Bytes("different message")) }), "challenge_mismatch", "12e", "clientData challenge is not SHA-256(message)"),
  fail("rpid-mismatch", webauthnProof({}, {}, { rpId: "other.localhost" }), "rp_id_hash_mismatch", "12f", "authenticator rpIdHash differs from SHA-256(rpId)"),
  fail("up-clear", webauthnProof({}, {}, { userPresent: false }), "user_present_required", "12g", "authenticator User Present flag is clear"),
  fail("wrong-type", webauthnProof({}, { type: "webauthn.create" }), "client_data_type_invalid", "12c", "clientData type is not webauthn.get"),
];

writeFileSync("vectors/vectors.json", `${JSON.stringify(vectors, null, 2)}\n`);
console.log(`wrote ${vectors.length} proof vectors`);

function softwareProof(fieldOverrides = {}) {
  const fields = { ...baseFields, ...fieldOverrides };
  const message = buildSiwdMessage(fields);
  return {
    v: 1,
    did: fields.did,
    keyId,
    message,
    mode: "software",
    signature: base64UrlEncode(
      p256.sign(new TextEncoder().encode(message), p256PrivateKey, {
        prehash: true,
        lowS: true,
        format: "compact",
      }),
    ),
  };
}

function webauthnProof(fieldOverrides = {}, clientOverrides = {}, authOverrides = {}) {
  const fields = { ...baseFields, ...fieldOverrides };
  const message = buildSiwdMessage(fields);
  const clientDataJSON = new TextEncoder().encode(JSON.stringify({
    type: "webauthn.get",
    challenge: base64UrlEncode(sha256Bytes(message)),
    origin,
    ...clientOverrides,
  }));
  const authenticatorData = new Uint8Array(37);
  authenticatorData.set(sha256Bytes(authOverrides.rpId ?? "localhost"));
  authenticatorData[32] = authOverrides.userPresent === false ? 0 : 0x01;
  const signedBytes = concat(authenticatorData, sha256Bytes(clientDataJSON));
  return {
    v: 1,
    did: fields.did,
    keyId,
    message,
    mode: "webauthn",
    signature: base64UrlEncode(p256.sign(signedBytes, p256PrivateKey, {
      prehash: true,
      lowS: true,
      format: "compact",
    })),
    clientDataJSON: base64UrlEncode(clientDataJSON),
    authenticatorData: base64UrlEncode(authenticatorData),
  };
}

function pass(name, proof, reason) {
  return baseVector(name, proof, "pass", reason);
}

function fail(name, proof, expectedFailure, failsAtStep, reason, overrides = {}) {
  return {
    ...baseVector(name, proof, "fail", reason),
    expectedFailure,
    failsAtStep,
    ...overrides,
  };
}

function baseVector(name, proof, expect, reason) {
  return {
    name,
    proof,
    expectedOrigin: origin,
    network: "ckb-testnet",
    expect,
    reason,
    now,
    nonceState: "issued",
    resolver: { liveCells: 1, document: document(p256DidKey) },
  };
}

function document(didKey) {
  return { verificationMethods: { [keyId]: didKey } };
}

function highSSignature() {
  const order = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
  return base64UrlEncode(Uint8Array.from([...scalar(1n), ...scalar(order - 1n)]));
}

function scalar(value) {
  const bytes = new Uint8Array(32);
  for (let index = 31; index >= 0; index -= 1) {
    bytes[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  return bytes;
}

function concat(first, second) {
  const output = new Uint8Array(first.length + second.length);
  output.set(first);
  output.set(second, first.length);
  return output;
}
