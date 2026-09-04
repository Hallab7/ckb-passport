# Passport PoC

Testnet-only proof of concept for Sign-In with CKB DID.

This workspace intentionally starts as a scaffold. Protocol logic is added in small, auditable
increments that correspond to `../poc-implementation.md`.

## Commands

```powershell
npm install
npm test
npm run audit:scaffold
npm run probe:sdk
```

The live DID update gate is opt-in:

```powershell
npm run build
npm run update:did
npm run check:roundtrip
```

It requires `CKB_PASSPORT_LIVE_DID`, `CKB_PASSPORT_AUTH_DID_KEY`, and
`CKB_PASSPORT_DID_LOCK_PRIVATE_KEY`. The update writes the passkey P-256 `did:key` into
`verificationMethods["auth-1"]` by signing with the DID cell lock key. The passkey is not used as
the DID cell lock, and login does not submit a transaction.

After the update transaction is confirmed, `npm run check:roundtrip` re-resolves the DID and checks
that `verificationMethods["auth-1"]` equals `CKB_PASSPORT_AUTH_DID_KEY` byte-for-byte.

## Scope

- CKB testnet only.
- No mainnet writes.
- No fund movement.
- No production session stack.
- No CCC connector or relying-party integrations beyond the local demo.

## DID SDK Probe

Current package checked: `@ckb-ccc/did-ckb@0.2.9`.

Run:

```powershell
npm run probe:sdk
```

Observed capabilities:

| Need | SDK support |
|---|---|
| Testnet DID type script code hash | Yes, through `ccc.ClientPublicTestnet.getKnownScript(ccc.KnownScript.DidCkb)`. |
| Testnet DID hash type | Yes, through the same known-script lookup. |
| `did:ckb` identifier encode/decode | Yes, `argsToDid`, `didToArgs`, `base32Encode`, and `base32Decode`. |
| DID document resolution | Yes, `resolveDidCkb({ client, did })`. |
| Live DID cell lookup | Yes, `findDidCkbCell({ client, id })`. |
| Raw DID Metadata Cell access | Yes, `findDidCkbCell` returns the live cell as part of the record. |
| Molecule and DAG-CBOR document decode | Yes, `DidCkbData.decode`. |
| DID document creation | Yes, `createDidCkb`. |
| DID document update | Yes, via `transferDidCkb` with replacement data or a data transformer. |
| Direct `verificationMethods` update helper | No targeted helper found; the PoC must transform the document object and submit the updated DID data. |

The probe does not write to CKB. It only imports the package, checks exports, reads known testnet
script metadata from CCC's local config, and verifies local encode/decode helpers.

## Testnet Configuration

Runtime config is loaded by `@ckb-passport/siwd-verify`.

Defaults:

| Setting | Default |
|---|---|
| `CKB_PASSPORT_NETWORK` | `ckb-testnet` |
| `CKB_RPC_URL` | `https://testnet.ckb.dev/` |
| `CKB_INDEXER_URL` | `https://testnet.ckb.dev/indexer` |
| `SIWD_EXPECTED_ORIGIN` | `http://localhost:3000` |

`CKB_DID_CODE_HASH` and `CKB_DID_HASH_TYPE` default to CCC's testnet
`KnownScript.DidCkb` values:

```text
CKB_DID_CODE_HASH=0x510150477b10d6ab551a509b71265f3164e9fd4137fcb5a4322f49f03092c7c5
CKB_DID_HASH_TYPE=type
```

Mainnet runtime config is rejected in this PoC package to preserve the testnet-only scope.

Live update variables:

| Setting | Purpose |
|---|---|
| `CKB_PASSPORT_LIVE_DID` | Testnet `did:ckb` to update. |
| `CKB_PASSPORT_AUTH_KEY_ID` | Verification method key to write; defaults to `auth-1`. |
| `CKB_PASSPORT_AUTH_DID_KEY` | P-256 passkey `did:key:zDna...` to store. |
| `CKB_PASSPORT_DID_LOCK_PRIVATE_KEY` | Testnet private key controlling the current DID cell lock. |

## Wallet Fallback Status

The local fallback convention is pinned to CCC's `CkbSecp256k1` message signing path:

```text
signed payload = hashCkb(utf8("Nervos Message:" + message))
signer output  = 0x-prefixed 65-byte recoverable secp256k1 signature
PoC envelope   = base64url(raw r||s, 64 bytes)
```

This is verified against `SignerCkbPrivateKey`. Browser wallet behavior still needs live
confirmation before H2 can rely on wallet mode outside local fixtures.

## Passkey Proof Envelope

`@ckb-passport/siwd-browser` can request a WebAuthn assertion with
`SHA-256(canonicalMessage)` as the challenge and returns:

```json
{
  "v": 1,
  "did": "did:ckb:...",
  "keyId": "auth-1",
  "message": "...",
  "mode": "webauthn",
  "signature": "base64url(raw-r-s)",
  "clientDataJSON": "base64url(...)",
  "authenticatorData": "base64url(...)"
}
```

WebAuthn DER ECDSA signatures are converted to raw `r||s` and normalized to low-S before the proof
is returned. The proof envelope does not include a wallet address, lock script, or transaction.
