# Passport PoC Report

Date: 2026-09-04

Status: local PoC implementation is complete and audited. The live testnet drill, explorer proof,
and recording are not complete in this checkout because no live DID, passkey `did:key`, DID lock
private key, update transaction hash, or captured proof file is configured.

## H3 - Passkey Registration And DID Update

H3 is not passed yet because the live gate has not been executed. The implementation can register a
browser passkey, parse its attestation object, require COSE ES256/P-256, compress the public key,
encode `did:key:zDna...`, prepare a `transferDidCkb` DID update, submit it through a DID cell lock
signer, and re-resolve `verificationMethods["auth-1"]` byte-for-byte. Local unit tests cover the
COSE conversion, DID update transformation, and round-trip checker. The missing evidence is live:
`CKB_PASSPORT_LIVE_DID`, `CKB_PASSPORT_AUTH_DID_KEY`, `CKB_PASSPORT_DID_LOCK_PRIVATE_KEY`, and a
confirmed update transaction. Until that is supplied and confirmed, H3 remains unresolved rather
than proven.

## H1 - DID Resolution

H1 is implemented with a duplicate-safe resolver. The resolver decodes the `did:ckb` identifier
through `@ckb-ccc/did-ckb`, builds the testnet DID type script from
`ccc.ClientPublicTestnet.getKnownScript(ccc.KnownScript.DidCkb)`, and queries live cells directly.
Zero live cells fail as nonexistent or deactivated. Multiple live cells fail closed instead of
choosing arbitrarily. Local resolver tests cover successful resolution, zero live cells, duplicate
live cells, and malformed DID input. A live resolver test exists, but it is skipped until
`CKB_PASSPORT_LIVE_DID` is set, so H1 has implementation evidence but no current live DID evidence
in this checkout.

## H2 - Verification Method Signature

H2 is implemented for both supported verification method curves. Wallet mode verifies secp256k1
signatures against the resolved `did:key:zQ3s...` key using the pinned CCC CKB personal-message
payload. WebAuthn mode verifies P-256 assertions against the resolved `did:key:zDna...` key by
checking `clientDataJSON`, challenge binding to `SHA-256(canonicalMessage)`, `rpIdHash`, User
Present, low-S policy, and ES256 over `authenticatorData || SHA-256(clientDataJSON)`. Local tests
cover valid signatures, tampered messages, wrong public keys, wrong curves, high-S signatures, and
WebAuthn origin/challenge/rpId/authenticator-data failures. H2 is proven locally through fixtures;
live wallet and live passkey proofs still need captured testnet evidence.

## H4 - Address-Free Login And No Spend Authority

H4 passes as a local source and session audit. The verifier issues a random in-memory session token
after proof verification, and the server-side session stores only DID, key ID, issued time, and
expiration time. `npm run audit:h4` scans login server code, session objects, proof envelopes,
browser demo state, and proof builders for CKB address disclosure, lock scripts, lock hashes,
transaction skeletons, transaction signatures, and browser storage. The audit finds none in the
login path. DID lock signing and transaction submission are isolated to registration/update code and
are disabled unless `CKB_PASSPORT_ENABLE_DID_UPDATE=1`. H4 still needs the final browser recording
against a live updated DID to prove the same result in an end-to-end run.

## Wallet Signing Convention

The local fallback convention is pinned to CCC's `CkbSecp256k1` message signing path:

```text
signed payload = hashCkb(utf8("Nervos Message:" + message))
signer output  = 0x-prefixed 65-byte recoverable secp256k1 signature
PoC envelope   = base64url(raw r||s, 64 bytes)
```

This has been verified with `SignerCkbPrivateKey` from `@ckb-ccc/core@1.19.1`. Live JoyID, Neuron,
or injected CCC signer behavior is still outside the evidence captured in this checkout.

## Resolver And SDK Findings

`@ckb-ccc/did-ckb@0.2.9` exposes the needed identifier codec, document codec, document resolution,
live cell lookup, raw DID Metadata Cell access, DID creation, and document update primitives. It
does not expose a targeted `verificationMethods` update helper, so the PoC updates the document
object and passes it through `transferDidCkb`. Resolver trust remains limited to one configured CKB
RPC endpoint; a light-client or multi-source verifier is full-project work. WIP-01 duplicate-cell
conflict resolution is also full-project work; the PoC fails closed on duplicate live cells.

## Vectors And Local Verification

`vectors/vectors.json` contains positive wallet and WebAuthn fixtures plus every required negative
case: wrong domain, wrong URI origin, expired message, future `issuedAt`, replayed nonce, absent
`keyId`, unsupported multicodec, high-S signature, WebAuthn origin mismatch, challenge mismatch,
User Present clear, and zero live DID cells. `npm test` runs the vector runner and checks that each
case matches its expected pass or named failure result.

Latest local audit for this report:

```text
npm run build        pass
npm test             pass
npm run probe:sdk    pass
npm run audit:h4     pass
npm run drill:check  pass
npm run evidence:check pass
```

## Capacity And Explorer Evidence

No capacity number is recorded because no live DID update transaction has been submitted in this
checkout. `npm run evidence:explorer` validates `CKB_PASSPORT_LIVE_DID`,
`CKB_PASSPORT_AUTH_DID_KEY`, `CKB_PASSPORT_UPDATE_TX_HASH`, and optional
`CKB_PASSPORT_UPDATE_CAPACITY_SHANNONS`, then prints a Pudge testnet explorer transaction URL.
Until those values exist, `EXPLORER-EVIDENCE.md` remains marked as not captured.

## Recording Evidence

`RECORDING.md` defines the expected video artifact and required scenes: tests passing, passkey
registration or exact H3 failure, DID update or exact update blocker, session contents after
sign-in, and identical-proof replay rejection. No recording is present in this checkout, and
`npm run recording:verify` fails with `recording_missing` until a non-empty recording file is
provided.

## Full Project Implication

The local implementation shows the protocol shape is viable enough to proceed to a live gate: the
canonical message, DID resolver, DID document decode, key selection, wallet verification, WebAuthn
verification, replay protection, session issuing, vectors, demo, and H4 source audit are all in
place. The full project should not treat passkey-based Passport as de-risked until H3 is completed
on CKB testnet and the explorer/recording evidence is captured. If the live update rejects arbitrary
P-256 `did:key` values or fails to round-trip, the fallback scope is wallet mode with the limitation
documented here.

## Final Acceptance Status

`ACCEPTANCE.md` and `npm run acceptance:verify` track the original acceptance criteria. Local
criteria pass: one-command startup is documented, vectors run under `npm test`, replay rejection is
covered, H4 source/session audit passes, and this report states H1 through H4. Live criteria remain
incomplete until a real testnet DID update, explorer transaction, platform-authenticator sign-in,
and recording are captured.
