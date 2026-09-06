# Recording

Status: not captured in this checkout.

Expected artifact:

```text
evidence/passport-poc-recording.mp4
```

Override path:

```powershell
$env:CKB_PASSPORT_RECORDING="C:\path\to\passport-poc-recording.mp4"
npm run recording:verify
```

Required scenes:

| Scene | Current status |
|---|---|
| Tests passing | Available from local command output, not recorded. |
| Auth-key registration with proof-of-possession or exact H3 failure | Available in the Next.js UI, not recorded. |
| DID update or exact update blocker | Available in the Next.js UI, not recorded. |
| Session contents after sign-in | Available in the Next.js UI, not recorded. |
| Identical proof replay rejected | Covered by local vectors and drill harness, not recorded live. |

Current blocker: no captured auth `did:key`, controller-signed update transaction hash,
captured live proof file, or local browser recording file is available in this checkout.
