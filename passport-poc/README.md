# Passport PoC

Testnet-only proof of concept for Sign-In with CKB DID. The goal is to confirm or falsify whether
a relying party can authenticate a `did:ckb` user through a DID verification method while storing no
CKB address and requiring no spend authority during login.

This is not production code. It intentionally uses in-memory nonces and sessions, rejects mainnet
configuration, and limits DID writes to an explicit live-update gate.

## Workspace

```text
packages/siwd-core      canonical message, field validation, bytes, did:key, low-S policy
packages/siwd-browser   passkey registration/assertion helpers and wallet proof builder
packages/siwd-verify    testnet config, DID resolver, document decoder, verifier, sessions
apps/demo               local relying-party server and one-page browser demo
vectors/vectors.json    reusable positive and negative SIWD proof vectors
```

## Prerequisites

- Node.js 22 or newer.
- npm.
- CKB testnet RPC access. The default public endpoint is used unless `CKB_RPC_URL` is set.
- A platform authenticator for the browser passkey flow.
- A testnet DID and its DID cell lock key only if you want to run the live DID update.

## Install And Check

```powershell
npm install
npm run build
npm test
npm run probe:sdk
npm run audit:h4
```

Useful non-network checks:

```powershell
npm run audit:scaffold
npm run demo:check
npm run drill:check
npm run evidence:check
npm run recording:check
npm run acceptance:check
```

`npm test` runs every package test, including `vectors/vectors.json`. The live resolver test is
skipped unless `CKB_PASSPORT_LIVE_DID` is set. In this checkout,
`did:ckb:o5bfnlw5t75w5bgvillbz3jzdwa2lxng` has passed the targeted live resolver test.

## Run The Demo

```powershell
npm run demo
```

After dependencies are installed, this command builds the workspace and starts the local
relying-party app. Open the printed URL, usually:

```text
http://127.0.0.1:3000
```

Docker is unnecessary for this PoC because all mutable relying-party state is in memory and CKB
access goes through the configured testnet RPC.

## Environment

Defaults:

| Setting | Default |
|---|---|
| `CKB_PASSPORT_NETWORK` | `ckb-testnet` |
| `CKB_RPC_URL` | `https://testnet.ckb.dev/` |
| `CKB_INDEXER_URL` | `https://testnet.ckb.dev/indexer` |
| `SIWD_EXPECTED_ORIGIN` | `http://localhost:3000` |
| `CKB_PASSPORT_DEMO_PORT` | `3000` |
| `CKB_PASSPORT_ENABLE_DID_UPDATE` | `0` |

`CKB_DID_CODE_HASH` and `CKB_DID_HASH_TYPE` default to CCC's testnet
`KnownScript.DidCkb` values:

```text
CKB_DID_CODE_HASH=0x510150477b10d6ab551a509b71265f3164e9fd4137fcb5a4322f49f03092c7c5
CKB_DID_HASH_TYPE=type
```

Live variables:

| Setting | Purpose |
|---|---|
| `CKB_PASSPORT_LIVE_DID` | Testnet `did:ckb` to resolve, update, and re-check. |
| `CKB_PASSPORT_AUTH_KEY_ID` | Verification method key; defaults to `auth-1`. |
| `CKB_PASSPORT_AUTH_DID_KEY` | P-256 passkey `did:key:zDna...` expected in the DID document. |
| `CKB_PASSPORT_DID_LOCK_PRIVATE_KEY` | Testnet private key controlling the current DID cell lock. |
| `CKB_PASSPORT_LIVE_PROOF_FILE` | Captured proof JSON for command-line drill verification. |
| `CKB_PASSPORT_UPDATE_TX_HASH` | DID update transaction hash for explorer evidence. |
| `CKB_PASSPORT_UPDATE_CAPACITY_SHANNONS` | Optional observed capacity value. |

Mainnet runtime config is rejected.

## SDK Status

Current package checked: `@ckb-ccc/did-ckb@0.2.9`.

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
| Direct `verificationMethods` update helper | No; the PoC transforms the document and submits it through `transferDidCkb`. |

## Passkey Flow

The demo page can register a platform passkey, send the attestation object to the local server, and
receive a P-256 `did:key:zDna...`. With live update explicitly enabled, the server can write that
key into `verificationMethods["auth-1"]` using the DID cell lock signer.

```powershell
$env:CKB_PASSPORT_ENABLE_DID_UPDATE="1"
$env:CKB_PASSPORT_LIVE_DID="did:ckb:..."
$env:CKB_PASSPORT_DID_LOCK_PRIVATE_KEY="0x..."
npm run demo
```

After the update transaction confirms:

```powershell
$env:CKB_PASSPORT_AUTH_DID_KEY="did:key:zDna..."
npm run check:roundtrip
```

Login does not submit a transaction. The WebAuthn assertion signs
`SHA-256(canonicalMessage)`, and the verifier checks the resolved DID document, `clientDataJSON`,
`authenticatorData`, low-S policy, and nonce state before issuing a DID-only session.

## Wallet Fallback

Wallet mode is implemented as a fallback around CCC's `CkbSecp256k1` message signing convention:

```text
signed payload = hashCkb(utf8("Nervos Message:" + message))
signer output  = 0x-prefixed 65-byte recoverable secp256k1 signature
PoC envelope   = base64url(raw r||s, 64 bytes)
```

This is verified locally with `SignerCkbPrivateKey`. Live injected-wallet behavior still needs
confirmation before wallet mode can be treated as an external relying-party result.

## Testnet Drill And Evidence

Run the command-line drill after a passkey `did:key` has been written and re-resolved:

```powershell
npm run build
npm run drill:testnet
```

Without `CKB_PASSPORT_LIVE_DID` and `CKB_PASSPORT_AUTH_DID_KEY`, the drill exits with
`missing_e2e_testnet_inputs`. With `CKB_PASSPORT_LIVE_PROOF_FILE`, it also verifies the captured
proof, issues a DID-only session, and confirms replay rejection.

Explorer evidence:

```powershell
npm run evidence:explorer
```

`EXPLORER-EVIDENCE.md` records the current evidence status. The script validates the configured DID,
passkey `did:key:zDna...`, update transaction hash, and optional capacity value, then prints a
Pudge testnet explorer transaction URL.

## H4 Audit

```powershell
npm run audit:h4
```

`ADDRESS-AUDIT.md` records the current source audit. Login/session/proof code stores only DID, key
ID, issued time, and expiration time. DID lock signing and transaction submission are isolated to
registration/update code and disabled unless `CKB_PASSPORT_ENABLE_DID_UPDATE=1`.

## Recording

`RECORDING.md` defines the expected evidence recording and current status. Verify a captured video
with:

```powershell
npm run recording:verify
```

Set `CKB_PASSPORT_RECORDING` to override the default `evidence/passport-poc-recording.mp4` path.

## Final Acceptance

`ACCEPTANCE.md` lists every PoC acceptance criterion and its current status. Run:

```powershell
npm run acceptance:verify
```

In this checkout it reports `live_acceptance_incomplete` because live DID update, explorer,
platform-authenticator sign-in, and recording evidence are not present.

## Vectors

`vectors/vectors.json` contains positive local wallet and WebAuthn fixtures plus the required
negative matrix: wrong domain, wrong URI origin, expired message, future `issuedAt`, replayed
nonce, absent `keyId`, unsupported multicodec, high-S signature, WebAuthn origin mismatch,
challenge mismatch, User Present clear, and zero live DID cells.

## Current Limitations

- A live testnet DID has resolved successfully, but no passkey `did:key`, update transaction hash,
  proof file, or proof recording is present in this checkout.
- H3 cannot be marked passed until the live DID update is submitted, confirmed, and re-resolved.
- H4 local source audit passes, but the full browser/passkey login must still be recorded against a
  live updated DID.
- Resolver trust is one configured CKB RPC endpoint; light-client verification is full-project work.
- Duplicate DID live cells fail closed in the PoC instead of implementing WIP-01 conflict
  resolution.
