# Passport PoC - Result

Date: 2026-09-07

Implementation commits: `efe92c6`, `e723fc2`, `2759b2e`

Network: CKB testnet

DID tested: supplied through `CKB_PASSPORT_LIVE_DID`
Dependencies: `@ckb-ccc/core@1.19.1`, `@ckb-ccc/did-ckb@0.2.9`

Summary: H1 and H2 are confirmed by live read evidence plus deterministic security fixtures. H3
and H4 remain partial until the update transaction and split-profile browser recording are captured.
Passing local code does not replace those live gates.

## H1 - Resolution Is Safe

Verdict: CONFIRMED

The security path does not use a cached singleton resolver. It derives the exact DID type script,
queries at most two live cells, accepts exactly one, treats zero cells as nonexistent or deactivated,
and rejects two cells as `did_ambiguous`. The supplied DID has resolved from CKB testnet in the
targeted live resolver test. The synthetic `duplicate-cells` vector and resolver fixture both fail
closed at step 9e.

## H2 - Signature Verifies Against The Document

Verdict: CONFIRMED

The verifier resolves `verificationMethods[keyId]`, parses its `did:key`, and verifies either a raw
low-S software signature or a WebAuthn ES256 assertion against that exact key. The 23-case vector
matrix confirms valid software and WebAuthn proofs, rejects a proof signed by another key, rejects
unsupported Ed25519 multicodec input, rejects curve confusion, and covers malformed, DER, and high-S
signatures. These are deterministic local cryptographic fixtures; captured live passkey evidence is
part of H3.

## H3 - Passkey As A Verification Method

Verdict: PARTIAL

The UI creates a discoverable platform passkey, derives `did:key:zDna...`, proves possession, and
refuses a deliberately mismatched key before transaction preparation. A CCC wallet then authorizes
the DID update. The Explorer tab prints the transaction hash, re-resolves the DID, and compares
`verificationMethods["auth-1"]` byte for byte with the passkey key. H3 is not closed because this
checkout does not contain a confirmed update transaction hash, explorer capture, and successful
round-trip result for the supplied DID. If the live attempt fails, record whether the failure was
COSE parsing, did:key encoding, wallet transfer rejection, confirmation, or round-trip mismatch.

## H4 - No Address, No Spend Authority

Verdict: PARTIAL

The Sign In tab works independently of wallet state: a fresh profile can enter a DID and invoke a
discoverable platform passkey without connecting CCC. The server session schema contains only
`did`, `keyId`, `issuedAt`, and `expirationTime`; no address field exists. Wallet signing and CKB
transaction submission are isolated to registration. Each sign-in proof is first rejected against
a different application origin, then accepted at its issuing origin, and an identical replay is
rejected with the failed verifier step. H4 is not closed until a recording shows this in a browser
profile that has never connected a wallet and visibly shows the returned session record.

## Evidence Commands

```powershell
npm run build
npm test
npm run test:vectors
npm run audit:h4
npm run drill:check
npm run demo:check
npm run evidence:check
npm run recording:verify
```

The first seven commands validate implementation and evidence readiness. `recording:verify` remains
expected to fail until `evidence/passport-poc-recording.mp4` exists. Live H3 evidence also requires
the confirmed transaction hash and exact re-resolved `auth-1` value.

## What This Changes About The 12-Week Scope

Message verification, conflict-safe resolution, negative vectors, and DID-only sessions can shrink
because their PoC risks are now closed locally. Live DID mutation, wallet compatibility, confirmation
handling, passkey portability across browser profiles, and evidence capture must remain early gates.
No production scope should assume H3 or H4 until those two recorded demonstrations pass.
