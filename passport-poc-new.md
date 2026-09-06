# Passport PoC — Sign in with `did:ckb`

**Status:** spec v2, revised 2026-09-06 after code audit and implementation alignment
**Target:** ~2 weeks, one developer · CKB **testnet** · no mainnet writes

> v2 changes: the SDK already implements resolution, so that work is out of scope; the document is
> updated via `transferDidCkb`, not an "update" call; `resolveDidCkb` is **not** conflict-safe and
> must not be used on the security path; **wallet mode is not a safe fallback** and has been replaced
> by a software auth key; proof-of-possession added at registration.

---

## 1. Purpose

Falsify or confirm four hypotheses before any grant work is scoped.

| # | Hypothesis | Risk | Falsified if |
|---|---|---|---|
| **H1** | A `did:ckb` document resolves and its `verificationMethods` can be read **safely** — including rejecting duplicate live cells | low–medium | the conflict-safe query cannot be expressed against the indexer |
| **H2** | A signature by a `verificationMethod` key verifies against the resolved document, **without reference to any address** | medium | key encodings in the wild don't match `parseDidKey` |
| **H3** | **A WebAuthn passkey can be registered as a `verificationMethod` and its assertion verified** | **high — the gate** | COSE→`did:key` fails, `transferDidCkb` rejects the document, or the assertion cannot be bound to the message |
| **H4** | Login authenticates with **no address disclosed and no spend authority** | medium | login needs a lock signature or surfaces an address |

**If H3 fails, that is a successful PoC.** It converts the passkey path from assumption to known-bad
in two weeks rather than week nine.

## 2. Non-goals

Key rotation and revocation *(M2)*; CCC connector; Discourse plugin; production sessions (a signed
cookie is enough); persistent nonce store; **tier-2 controller proof** (§9); selective disclosure;
mainnet writes.

---

## 3. What already exists — do not rebuild

Audited against `@ckb-ccc/did-ckb@0.2.9` and `@ckb-ccc/core@1.19.1`.

```ts
// resolution + codecs — all shipped
resolveDidCkb({ client, did })      // → { did, id, data, cell } | undefined
findDidCkbCell({ client, id })
didToArgs(did) / argsToDid(args) / isDidCkb(s) / base32Encode / base32Decode
DidCkbData.decode(cell.outputData)  // .value.document = CBOR-decoded document
getDidCkbHistory({ client, id })    // CREATE | UPDATE | MIGRATE, newest first
listDidCkbsByLock({ client, lock })

// lifecycle
createDidCkb({ signer, data, receiver? })
transferDidCkb({ client, id, receiver, data })   // ← THE UPDATE PATH (transfer to self)
destroyDidCkb({ client, id })

// from the `plc` subpath
parseDidKey(didKey) → { curve: "secp256k1" | "p256", compressedPubkey }
verifyPrivateKeyMatch(privateKey, expectedPubkey, curve)
```

Type script location — **never hardcode**:

```ts
const info = await client.getKnownScript(ccc.KnownScript.DidCkb);
// mainnet 0x4a06164dc34dccade5afe3e847a97b6db743e79f5477fa3295acf02849c5984a  hashType "type"
// testnet 0x510150477b10d6ab551a509b71265f3164e9fd4137fcb5a4322f49f03092c7c5  hashType "type"
```

**Genuinely new work:** the SIWD message format, WebAuthn verification against a `did:key`, the
conflict-safe resolver wrapper (§6), proof-of-possession at registration (§7), and the software-key
fallback (§4.3).

---

## 4. Model

### 4.1 Two keys, two roles

| | key | can |
|---|---|---|
| **Control** | the **lock** on the DID Metadata Cell | rewrite the document, rotate keys, deactivate |
| **Authentication** | a private key matching a **`verificationMethods`** entry | sign login challenges. Nothing on chain |

Login uses the second. The lock is touched **once**, at registration, and never again.

### 4.2 Key encoding

```
did:key:z || base58btc( varint(multicodec) || compressed_public_key )
```

| curve | multicodec | varint | key | prefix |
|---|---|---|---|---|
| secp256k1 | `0xe7` | `e7 01` | 33 B | `did:key:zQ3s…` |
| **P-256 (ES256)** | `0x1200` | `80 24` | 33 B | `did:key:zDna…` |

Verified computationally against the reference `z6Mk` ed25519 prefix. P-256 is what WebAuthn emits
(COSE `alg: -7`), which is why H3 is plausible. `parseDidKey` already handles both; the PoC fails
closed on anything else.

### 4.3 Authentication modes

**Corrected in v2.** CCC's `Signer.verifyMessage` verifies against `Signature.identity` — a wallet
address. Using it for login would reintroduce address disclosure. Registering a wallet's spend
pubkey as a `verificationMethod` instead would make the auth key a spend key. **Wallet signing
cannot preserve both properties and is therefore not a Passport login mode.**

| mode | key | properties |
|---|---|---|
| **1 · Passkey** *(primary)* | P-256 WebAuthn credential | hardware-backed, not a spend key, no address ✅ |
| **2 · Software auth key** *(fallback)* | P-256/secp256k1 generated locally, stored in IndexedDB or keychain | both properties hold; weaker key storage |
| ~~wallet identity~~ | — | **not a login mode.** Reserved for tier-2 controller proof (§9) |

---

## 5. The SIWD message

EIP-4361-shaped. Canonical form; the verifier reconstructs and compares byte-for-byte.

```
${domain} wants you to sign in with your CKB DID:
${did}

${statement}

Key ID: ${keyId}
URI: ${uri}
Version: 1
Network: ${network}
Nonce: ${nonce}
Issued At: ${issuedAt}
Expiration Time: ${expirationTime}
```

| field | rule |
|---|---|
| `domain` | RFC 3986 authority; MUST equal the origin's host(:port) |
| `did` | `did:ckb:` + exactly 32 chars `[a-z2-7]` (validate with `isDidCkb`) |
| `keyId` | key in `verificationMethods`. Required — the map has no default |
| `uri` | absolute; origin MUST equal `domain`'s origin |
| `network` | `ckb-testnet` \| `ckb-mainnet` |
| `nonce` | ≥ 8 chars `[a-zA-Z0-9]`, single-use |
| timestamps | RFC 3339, UTC, `Z`. Lifetime SHOULD be ≤ 5 min |

**Proof envelope**

```jsonc
{
  "v": 1,
  "did": "did:ckb:qq2m72a2vas4e5ovcpxoedscguuu4nba",
  "keyId": "auth-1",
  "message": "<canonical message, verbatim>",
  "mode": "webauthn",            // | "software"
  "signature": "<base64url>",       // raw r||s, 64 bytes, low-S. NOT DER
  "clientDataJSON": "<base64url>",  // iff mode == "webauthn"
  "authenticatorData": "<base64url>" // iff mode == "webauthn"
}
```

---

## 6. Verification algorithm

Normative. Any failure rejects; never fall through to a weaker check.

```
verify(proof, expectedOrigin, network):

 1  parse proof.message; any parse failure                          → FAIL
 2  message.domain == host(expectedOrigin)                          else FAIL
 3  origin(message.uri) == expectedOrigin                           else FAIL
 4  message.version == "1"                                          else FAIL
 5  message.network == network                                      else FAIL
 6  now < expirationTime and issuedAt <= now + 60s                  else FAIL
 7  nonce issued by us, unconsumed → mark consumed                  else FAIL
 8  isDidCkb(message.did)                                           else FAIL

 9  RESOLVE — conflict-safe. DO NOT call resolveDidCkb here.
9a    args = didToArgs(message.did)
9b    info = await client.getKnownScript(KnownScript.DidCkb)
9c    query findCellsByType({codeHash: info.codeHash, hashType: info.hashType,
                             args}, exact) with limit >= 2
9d    0 cells  → FAIL   (never created, or deactivated)
9e    >1 cells → FAIL   (WIP-01 §3.3.2 conflict; log loudly)
9f    doc = DidCkbData.decode(cell.outputData).value.document

        ── why: resolveDidCkb delegates to findSingletonCellByType, which
           queries with limit 1 and returns the first result. No uniqueness
           check. Fine for a dashboard, unsafe for authentication.

10  vm = doc.verificationMethods[message.keyId]; absent             → FAIL
11  { curve, compressedPubkey } = parseDidKey(vm)
      curve ∉ {secp256k1, p256}                                     → FAIL

12  VERIFY
     mode "software":
12a    ECDSA verify signature over SHA-256(message), low-S enforced

     mode "webauthn":                        (curve MUST be p256)
12b    cd = JSON(clientDataJSON)
12c    cd.type   == "webauthn.get"                                  else FAIL
12d    cd.origin == expectedOrigin                                  else FAIL
12e    b64url_decode(cd.challenge) == SHA-256(message)              else FAIL
12f    authData[0..32] == SHA-256(rpId)                             else FAIL
12g    authData[32] & 0x01  (User Present)                          else FAIL
12h    ECDSA-P256 verify signature over
            authenticatorData || SHA-256(clientDataJSON)

13  issue session bound to (did, keyId, exp).
    Store the DID. Store NO address.        ← this step is H4
```

---

## 7. Registration — the H3 procedure

**Ownership is proved to CKB consensus, not to Passport.** WIP-01 §3.4.1: *"Transaction MUST be
authorized by the current Lock Script."* If you don't control the lock, the transaction is never
mined. There is nothing for Passport to verify and nothing to spoof.

```
 1  navigator.credentials.create({ publicKey: {
       challenge, rp: { id: rpId }, user: {...},
       pubKeyCredParams: [{ type: "public-key", alg: -7 }],     // ES256 only
       authenticatorSelection: { residentKey: "preferred",
                                 userVerification: "preferred" }
    }})

 2  parse response.attestationObject (CBOR) → authData
 3  authData → attestedCredentialData → credentialPublicKey (COSE_Key)
 4  assert COSE kty(1)==2 (EC2), alg(3)==-7, crv(-1)==1 (P-256)
 5  x = COSE[-2] (32 B), y = COSE[-3] (32 B)
 6  compressed = (y[31] & 1 ? 0x03 : 0x02) || x
 7  didkey = "did:key:z" + base58btc(0x80 0x24 || compressed)      → "zDna…"

 8  ★ PROOF OF POSSESSION  (new in v2)
    issue a registration challenge; call credentials.get(); verify the
    assertion against `didkey` using §6 step 12 (webauthn path).
    FAIL → abort. Never write a key you have not seen sign.

 9  write the document — THE UPDATE PATH IS transferDidCkb:
       await transferDidCkb({
         client,
         id: didToArgs(did),
         receiver: currentLock,        // ← same lock: "transfer to self" = update
         data: (cell, data) => withVerificationMethod(data, "auth-1", didkey),
       })
       ...complete fee, sign with the LOCK key, send

10  re-resolve; assert verificationMethods["auth-1"] round-tripped byte-identically
```

Steps 9–10 are the only steps in the entire PoC that touch the lock key, they happen **once**, and
never at login.

**Cost, measured on chain (2026-09-06):** a DID Metadata Cell holds median **361 CKB** on mainnet
(min 343, max 522) — roughly 2.5× a UDT cell, because it carries the DAG-CBOR document. At today's
price ≈ $0.36. Registration is therefore **not gasless**: it needs the lock key *and* capacity.
"No wallet, no gas" is true of **login**, not of setup.

**Sponsorship is possible and is the honest onboarding answer.** A CKB transaction can take inputs
from several parties, so a sponsor can fund fee and capacity while the *user's* lock still
authorises the DID cell. The user never holds CKB and still solely controls the DID. Out of PoC
scope; worth demonstrating later.

---

## 8. Threat model

| threat | handling |
|---|---|
| Replay | single-use nonce (step 7) + expiry (6) |
| Cross-site replay | `domain` and `uri` bound into the signed message (2, 3); `clientData.origin` checked (12d) |
| DID substitution | the DID is inside the signed message — a proof for `alice` cannot be presented as `bob` |
| **Duplicate live cells** | **fail closed on `count > 1` (9e).** Cannot be delegated to `resolveDidCkb` |
| Deactivated DID | zero live cells → FAIL (9d) |
| **Controller takeover** | the lock holder can rewrite `verificationMethods` at any time and become the user everywhere. This is *also* the recovery mechanism. Mitigation: multisig / recovery lock on the DID cell (WIP-01 §4.2.2); relying parties MAY watch the document and re-authenticate on change. **Not solvable inside Passport** |
| **Lock loss** | existing auth keys keep working forever; the DID can never be rotated or deactivated. Argues for a recovery lock at creation |
| **DID-cell lock leak** | the cell's lock is public. A DID controlled by the user's main funds lock relinks them to an address. Mitigation is a *distinct* lock for the DID cell — defaults and documentation, not elimination |
| Malleability | raw `r‖s` only, low-S enforced; DER rejected |
| Resolver trust | a single RPC is trusted. Documented, fails closed. Light-client verification is future work |
| Unauthorised key binding | §7 step 8 proof-of-possession |

---

## 9. Out of scope — assurance tiers

| tier | proves | mechanism | address-linked |
|---|---|---|---|
| **1 · Auth** *(this PoC)* | a key in `verificationMethods` signed | raw curve verify vs `parseDidKey(vm)` | no |
| **2 · Controller** *(future)* | the DID cell's lock was satisfied | `ccc.Signer.verifyMessage` against the cell's lock | **yes, by design** |

Tier 2 is what a governance gate might want. It necessarily discloses an address, which is
acceptable when controller assurance is the point. Not in the PoC.

---

## 10. Deliverables

```
passport-poc/
  packages/
    siwd-core/       message build/parse/canonicalise; did:key helpers
    siwd-verify/     conflict-safe resolver + §6 verification (Node)
    siwd-browser/    passkey assertion helpers + software-key mode
  apps/demo/         Next.js relying party + guided evidence UI
  vectors/vectors.json
  REPORT.md          H1-H4 outcomes, one paragraph each
```

**`vectors.json`** — ≥ 12 cases, `{name, proof, expectedOrigin, network, expect, reason}`. Required
negatives: wrong domain · wrong URI origin · expired · future `issuedAt` · replayed nonce · `keyId`
absent · unsupported multicodec · high-S signature · WebAuthn origin mismatch · challenge ≠
SHA-256(message) · User Present clear · zero live cells · **two live cells**.

**`REPORT.md`** — one paragraph per hypothesis. **If H3 failed, say so first and plainly.**

---

## 11. Acceptance criteria

- [ ] One documented command runs the demo against CKB testnet
- [ ] Register a passkey; `verificationMethods["auth-1"]` begins `zDna` on a public explorer
- [ ] Registration **refuses** to write a key that fails proof-of-possession
- [ ] Sign in with Face ID / Touch ID only — no extension, no transaction, no gas
- [ ] The session store, shown on screen, holds a **DID and no address**
- [ ] Replay the identical proof → rejected, failing step named
- [ ] A synthetic two-live-cell case → rejected, not silently resolved
- [ ] `npm test` runs `vectors.json`; every case matches
- [ ] `REPORT.md` states an outcome for H1–H4

---

## 12. Timeline

| days | work |
|---|---|
| 1 | Stand up `ClientPublicTestnet`, resolve a known DID, confirm `KnownScript.DidCkb` and the conflict-safe query shape |
| 2–4 | `siwd-core`: message format, canonicalisation, `did:key` helpers + unit tests |
| 5–8 | **H3**: passkey → COSE → `did:key:zDna` → PoP → `transferDidCkb` → re-resolve. Succeed or fail definitively |
| 9–11 | `siwd-verify`: §6 including the conflict-safe resolver; `vectors.json` with all negatives |
| 12–13 | Demo relying party end to end on testnet; software-key fallback |
| 14 | `REPORT.md`, README, recording |

*v1 spent days 1–2 on "what do CKB wallets sign?" That question is closed — CCC answers it — and
wallet signing is no longer part of the design (§4.3).*

---

## 13. References

**Code audited** — `@ckb-ccc/did-ckb@0.2.9` (`src/resolver.ts`, `src/didCkb.ts`, `src/identifier.ts`,
`src/codec.ts`, `plc`), `@ckb-ccc/core@1.19.1` (`src/client/client.ts`, signer/signature stack).

**Specification** ·
[WIP-01 `did:ckb`](https://github.com/web5fans/web5-wips/blob/master/01.md) ·
[web5fans/did-ckb](https://github.com/web5fans/did-ckb) ·
[`@ckb-ccc/did-ckb`](https://www.npmjs.com/package/@ckb-ccc/did-ckb) ·
[ckb-devrel/ccc#376](https://github.com/ckb-devrel/ccc/pull/376) ·
[CKB type-id](https://docs.nervos.org/docs/script/type-id)

**Standards** ·
[EIP-4361](https://eips.ethereum.org/EIPS/eip-4361) ·
[WebAuthn L3](https://www.w3.org/TR/webauthn-3/) ·
[RFC 8152 COSE](https://www.rfc-editor.org/rfc/rfc8152) ·
[did:key](https://w3c-ccg.github.io/did-method-key/) ·
[multicodec table](https://github.com/multiformats/multicodec/blob/master/table.csv) ·
[did:plc v0.1](https://web.plc.directory/spec/v0.1/did-plc) ·
[DID Core](https://www.w3.org/TR/did-1.0/) ·
[RFC 7693](https://www.rfc-editor.org/rfc/rfc7693) ·
[RFC 4648](https://www.rfc-editor.org/rfc/rfc4648.html) ·
[DAG-CBOR](https://ipld.io/specs/codecs/dag-cbor/spec/) ·
[RFC 3339](https://www.rfc-editor.org/rfc/rfc3339)

**Context** ·
[`PASSPORT.md`](PASSPORT.md) — the 12-week proposal this de-risks
