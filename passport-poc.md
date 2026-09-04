# Passport PoC — Sign in with `did:ckb`

**Status:** draft spec for a proof of concept
**Target:** 2 weeks, one developer
**Scope:** CKB **testnet**. No mainnet writes. Not production code.

---

## 1. Purpose

The PoC exists to **falsify or confirm four hypotheses** before any grant work is scoped. It is not
a product, and shipping it should feel closer to an experiment than a release.

| # | Hypothesis | Risk | Falsified if |
|---|---|---|---|
| **H1** | A `did:ckb` document can be resolved from a CKB node and its `verificationMethods` read reliably | medium | resolution is ambiguous, or the SDK cannot return the document |
| **H2** | A signature by a `verificationMethod` key verifies against the resolved document | medium | key encodings in the wild don't match the spec, or no wallet signs verifiably |
| **H3** | **A WebAuthn passkey can be registered as a `verificationMethod` and its assertion verified** | **high — this is the gate** | the COSE→`did:key` path fails, or the SDK rejects the key, or assertion verification cannot be tied to the message |
| **H4** | The full round trip authenticates a user with **no address disclosed and no spend authority** | low | any step requires a lock-script signature or reveals an address |

**If H3 fails, that is a successful PoC.** It converts the passkey path from an assumption into a
known-bad, and the project proceeds in wallet mode with a documented reason.

## 2. Non-goals

Explicitly out of scope. Anything here that creeps in has made the PoC worse.

- Key rotation, revocation, deactivation handling *(that is M2 of the full project)*
- CCC connector, Discourse plugin, any second relying party
- Production session management — a signed cookie is sufficient
- Persistent nonce store — in-memory is sufficient
- Multiple simultaneous `verificationMethods`, delegation, selective disclosure
- Mainnet writes, any fund movement, any UI polish

---

## 3. Background the implementation depends on

From [WIP-01](https://github.com/web5fans/web5-wips/blob/master/01.md). Restated because the
verifier must reimplement it.

**The DID Metadata Cell**

| field | contents |
|---|---|
| type script `args` | the 20-byte method-specific identifier — *this is the DID* |
| lock script | authorises update / deactivation (the **control** key — never touched at login) |
| data | Molecule `DidCkbData` → `document` → DAG-CBOR → metadata JSON |

**Identifier** — BLAKE2b, personalisation `ckb-default-hash`, 32-byte output, over:

```
inputs[0].since                     8 bytes
inputs[0].previous_output.tx_hash  32 bytes
inputs[0].previous_output.index     4 bytes  LE
DID cell output index               8 bytes  LE
```

First 20 bytes → base32 (RFC 4648, lowercase, no padding) → 32 characters.
Identical to CKB's [type-id](https://docs.nervos.org/docs/script/type-id).

**Document** — `did:plc`-compatible; MUST NOT contain `type`, `rotationKeys`, `prev`, `sig`:

```json
{
  "verificationMethods": { "auth-1": "did:key:zDna..." },
  "alsoKnownAs": ["at://alice.test"],
  "services": { }
}
```

---

## 4. Key encoding

`verificationMethods` values are `did:key` strings:

```
did:key:z || base58btc( varint(multicodec) || compressed_public_key )
```

Verified against the reference `z6Mk` ed25519 prefix; both target curves confirmed:

| curve | multicodec | varint bytes | key bytes | resulting prefix |
|---|---|---|---|---|
| **secp256k1** | `0xe7` | `e7 01` | 33 (compressed) | `did:key:zQ3s…` |
| **P-256 (ES256)** | `0x1200` | `80 24` | 33 (compressed) | `did:key:zDna…` |

P-256 is what WebAuthn produces (COSE `alg: -7`), which is why H3 is plausible at all. The PoC
supports exactly these two and MUST fail closed on anything else.

---

## 5. The SIWD message

EIP-4361-shaped. Exact canonical form — the verifier compares byte-for-byte after reconstruction.

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
| `domain` | RFC 3986 authority of the relying party. MUST equal the origin's host(:port) |
| `did` | `did:ckb:` + exactly 32 chars from `[a-z2-7]` |
| `statement` | single line, no newline, no leading `-` |
| `keyId` | key in `verificationMethods`. Required — the map has no implicit default |
| `uri` | absolute; its origin MUST equal `domain`'s origin |
| `Version` | literal `1` |
| `network` | `ckb-testnet` \| `ckb-mainnet` |
| `nonce` | ≥ 8 chars `[a-zA-Z0-9]`, single-use |
| timestamps | RFC 3339, UTC, `Z` suffix |

`Expiration Time − Issued At` SHOULD be ≤ 5 minutes.

### The proof envelope

```jsonc
{
  "v": 1,
  "did": "did:ckb:qq2m72a2vas4e5ovcpxoedscguuu4nba",
  "keyId": "auth-1",
  "message": "<the canonical message above, verbatim>",
  "mode": "webauthn",              // | "wallet"
  "signature": "<base64url>",      // raw r||s, 64 bytes, NOT DER
  "webauthn": {                    // present iff mode == "webauthn"
    "clientDataJSON":    "<base64url>",
    "authenticatorData": "<base64url>"
  }
}
```

Signatures are **raw `r||s`**, 64 bytes. Low-S normalisation required; high-S MUST be rejected.

---

## 6. Verification algorithm

Normative. Any failure → reject; never fall through to a weaker check.

```
verify(proof, expectedOrigin, network):

 1  parse proof.message into fields; any parse failure → FAIL
 2  message.domain == host(expectedOrigin)                      else FAIL
 3  origin(message.uri) == expectedOrigin                       else FAIL
 4  message.version == "1"                                      else FAIL
 5  message.network == network                                  else FAIL
 6  now < expirationTime  and  issuedAt <= now + 60s            else FAIL
 7  nonce issued by us, unconsumed → mark consumed              else FAIL
 8  did matches ^did:ckb:[a-z2-7]{32}$                          else FAIL

 9  RESOLVE
 9a   base32-decode identifier → 20 bytes                       else FAIL
 9b   query live cells: type = {DID_CODE_HASH, DID_HASH_TYPE, args}
 9c   0 cells → FAIL           (nonexistent or deactivated)
 9d   >1 cells → WIP-01 §3.3.2: earliest genesis wins.
         PoC MAY fail closed and log; it MUST NOT pick arbitrarily
 9e   cell.data → Molecule DidCkbData → document → DAG-CBOR → JSON

10  vm = doc.verificationMethods[message.keyId]; absent → FAIL

11  DECODE did:key
11a   strip "did:key:z", base58btc-decode
11b   read varint: e701 → secp256k1 | 8024 → P-256 | else FAIL
11c   next 33 bytes = compressed point; trailing bytes → FAIL

12  VERIFY SIGNATURE
     mode == "wallet":
12a    signed payload = SHA-256(message)                 ← see §9 open question
12b    ECDSA verify over the decoded curve; low-S enforced

     mode == "webauthn":                                  (curve MUST be P-256)
12c    cd = JSON(clientDataJSON)
12d    cd.type   == "webauthn.get"                       else FAIL
12e    cd.origin == expectedOrigin                       else FAIL
12f    b64url_decode(cd.challenge) == SHA-256(message)   else FAIL
12g    authData[0..32] == SHA-256(rpId)                  else FAIL
12h    authData[32] & 0x01 (User Present) set            else FAIL
12i    ECDSA-P256 verify signature over
            authenticatorData || SHA-256(clientDataJSON)

13  issue session bound to (did, keyId, exp). Store the DID. Store NO address.
```

**Step 13 is H4.** If any step needed a lock-script signature or produced an address, H4 is
falsified and the PoC has found something important.

---

## 7. Passkey registration — the H3 procedure

The highest-risk path, specified end to end so failure is diagnosable at a step rather than in
general.

```
 1  navigator.credentials.create({ publicKey: {
       challenge, rp: {id: rpId}, user: {...},
       pubKeyCredParams: [{ type: "public-key", alg: -7 }],   // ES256 / P-256 only
       authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" }
    }})

 2  parse response.attestationObject (CBOR) → authData
 3  authData → attestedCredentialData → credentialPublicKey (COSE_Key)
 4  assert COSE: kty(1)==2 (EC2), alg(3)==-7, crv(-1)==1 (P-256)
 5  x = COSE[-2] (32 bytes), y = COSE[-3] (32 bytes)
 6  compressed = (y[31] & 1 ? 0x03 : 0x02) || x
 7  didkey = "did:key:z" + base58btc( 0x80 0x24 || compressed )     → "zDna…"
 8  write verificationMethods["auth-1"] = didkey
       via @ckb-ccc/did-ckb update; authorised by the DID cell's LOCK
 9  re-resolve and assert the value round-tripped byte-identically
```

**Step 8 is the gate.** It is the only step in the whole PoC that requires the lock key, it happens
once at registration, and it never happens again at login. Record whether the SDK accepts an
arbitrary `did:key` value, and whether step 9 round-trips.

---

## 8. Deliverables

```
passport-poc/
  packages/
    siwd-core/       message build + parse + canonicalise; did:key codec
    siwd-verify/     resolver + §6 verification (Node)
    siwd-browser/    passkey register/sign; wallet-mode sign
  apps/
    demo/            express relying party + one HTML page
  vectors/
    vectors.json     see §8.1
  REPORT.md          H1-H4 outcomes, one paragraph each
```

### 8.1 Test vectors — the most reusable artefact

`vectors.json`: ≥ 12 cases, each `{ name, proof, expectedOrigin, network, expect: "pass"|"fail", reason }`.
Any reimplementation runs these and must agree.

Required negative cases: wrong domain · wrong URI origin · expired · issuedAt in future ·
replayed nonce · `keyId` absent from document · unsupported multicodec · high-S signature ·
WebAuthn `clientData.origin` mismatch · challenge ≠ SHA-256(message) · User Present bit clear ·
DID resolves to zero live cells (deactivated).

### 8.2 REPORT.md

One paragraph per hypothesis: what was built, what happened, what it means for the 12-week scope.
**If H3 failed, say so first and in plain terms** — that outcome is more useful than a working demo,
and burying it would waste the PoC.

---

## 9. Open questions to resolve during the PoC

These are unresolved *by design*; the PoC exists partly to answer them.

1. **Wallet-mode signed payload (step 12a).** CKB wallets do not share a personal-message signing
   convention the way `personal_sign` standardised Ethereum. Determine what JoyID / Neuron / CCC
   signers actually produce, and pin it. **This may be the real blocker rather than H3** — worth
   checking in the first two days.
2. **Where is the DID type script deployed on testnet?** Obtain `DID_CODE_HASH` and `hash_type`
   from `@ckb-ccc/did-ckb` rather than hardcoding; record them in the README.
3. **Conflict resolution.** How often do duplicate live cells actually occur? If never, step 9d can
   stay fail-closed permanently and the full project drops a chunk of complexity.
4. **Resolver trust.** The PoC queries one node. A relying party trusting a single RPC is a real
   weakness — note it; a light-client path is future work.
5. **Does `@ckb-ccc/did-ckb` (v0.2.9) expose document read and `verificationMethods` update
   directly**, or does the PoC need its own Molecule/DAG-CBOR handling?
6. **Cell capacity for registration.** Note the actual CKB cost of creating the DID cell — it is the
   sponsorship question the full proposal has to answer.

---

## 10. Acceptance criteria

Checkable without reading code.

- [ ] `docker compose up` (or one documented command) runs the demo against CKB testnet
- [ ] Register a passkey, create/update a DID, and see `verificationMethods["auth-1"]` begin `zDna`
      on a public explorer
- [ ] Sign in with **Face ID / Touch ID only** — no wallet extension, no transaction, no gas
- [ ] The server's session store, shown on screen, contains a **DID and no address**
- [ ] Replay the identical proof → rejected, with the failing step named
- [ ] `npm test` runs `vectors.json`; every case matches its expectation
- [ ] `REPORT.md` states an outcome for H1–H4

---

## 11. Timeline

| days | work |
|---|---|
| 1–2 | Resolve open questions 2 and 5. Attempt open question 1 (wallet signing convention) — early, because it may be the real blocker |
| 3–5 | `siwd-core`: message format, canonicalisation, `did:key` codec + unit tests |
| 6–8 | **H3 attempt**: passkey → COSE → `did:key:zDna` → write to document → re-resolve. Succeed or fail definitively |
| 9–11 | `siwd-verify`: §6 steps 1–13; `vectors.json` including all negatives |
| 12–13 | Demo relying party, end-to-end on testnet |
| 14 | `REPORT.md`, README, recording |

---

## 12. References

**Specification**
[WIP-01 `did:ckb`](https://github.com/web5fans/web5-wips/blob/master/01.md) ·
[web5fans/did-ckb](https://github.com/web5fans/did-ckb) ·
[`@ckb-ccc/did-ckb` v0.2.9](https://www.npmjs.com/package/@ckb-ccc/did-ckb) ·
[ckb-devrel/ccc#376](https://github.com/ckb-devrel/ccc/pull/376) ·
[CKB type-id](https://docs.nervos.org/docs/script/type-id)

**Standards**
[EIP-4361 SIWE](https://eips.ethereum.org/EIPS/eip-4361) ·
[W3C WebAuthn L3](https://www.w3.org/TR/webauthn-3/) ·
[RFC 8152 COSE](https://www.rfc-editor.org/rfc/rfc8152) ·
[did:key](https://w3c-ccg.github.io/did-method-key/) ·
[multicodec table](https://github.com/multiformats/multicodec/blob/master/table.csv) ·
[did:plc v0.1](https://web.plc.directory/spec/v0.1/did-plc) ·
[W3C DID Core](https://www.w3.org/TR/did-1.0/) ·
[RFC 7693 BLAKE2](https://www.rfc-editor.org/rfc/rfc7693) ·
[RFC 4648 base32](https://www.rfc-editor.org/rfc/rfc4648.html) ·
[DAG-CBOR](https://ipld.io/specs/codecs/dag-cbor/spec/) ·
[RFC 3339](https://www.rfc-editor.org/rfc/rfc3339)

**Context**
[`../PASSPORT.md`](../PASSPORT.md) — the 12-week proposal this de-risks ·
[/t/9968](https://talk.nervos.org/t/9968) #7 — the original request ·
[/t/9506](https://talk.nervos.org/t/9506) — address-decoupled `did:web5`
