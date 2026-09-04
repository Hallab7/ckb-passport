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
