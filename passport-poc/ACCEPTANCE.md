# Final Acceptance

Status: local implementation accepted; H1 live read evidence captured; live acceptance incomplete.

Run:

```powershell
npm run acceptance:check
npm run acceptance:verify
```

Current result:

| Acceptance item | Status | Evidence |
|---|---|---|
| One documented command runs the demo | Pass | `npm run demo` starts the guided Next.js demo; `npm run demo:check` passes. |
| Supplied testnet DID resolves from live cells | Pass | Targeted live resolver test passes when `CKB_PASSPORT_LIVE_DID` is supplied. |
| Auth-key registration creates or updates a DID | Unresolved | Requires auth `did:key` and a controller-signed update for the supplied live DID. |
| Registration refuses an auth key that fails proof-of-possession | Pass | `/api/auth-key/proof-of-possession` verifies the proposed key before update; software/WebAuthn signature tests cover the failure path. |
| `verificationMethods["auth-1"]` begins `did:key:zDna` on explorer | Unresolved | Requires update transaction hash and explorer evidence. |
| Sign-in works with platform authenticator only | Unresolved | Requires live browser recording after DID update. |
| Server session contains DID and no address | Pass | `npm run audit:h4` passes. |
| Sign-in can run without connecting a wallet | Pass locally | The Sign In tab accepts a DID independently and uses a discoverable platform passkey; fresh-profile recording remains unresolved. |
| Cross-origin proof is rejected | Pass locally | The UI presents each sign-in proof to `/api/verify/cross-origin` before valid verification and displays the failure step; live recording remains unresolved. |
| Replay of identical proof is rejected | Pass | `vectors.json` includes `replayed-nonce` expecting `nonce_consumed`. |
| Synthetic duplicate live DID cells are rejected | Pass | `resolver.test.ts` covers `did_ambiguous`; `vectors.json` includes `duplicate-cells`. |
| One command runs the complete vector matrix | Pass | `npm run test:vectors` runs all 23 proof-plan cases and validates each failure step. |
| Every vector matches expected pass/fail result | Pass | `npm test` passes locally. |
| `REPORT.md` states H1 through H4 outcomes | Pass | Final report is present. |

The unresolved items are update, explorer, sign-in, and recording evidence gaps, not hidden
implementation passes.
