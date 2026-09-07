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
| Profile 1 connects a CCC wallet and lists every owned DID | Available in the Next.js UI, not recorded. |
| Passkey proof-of-possession succeeds and a deliberately wrong key is refused before transaction preparation | Available in the Next.js UI, not recorded. |
| Confirmed DID update hash, explorer page, and exact `auth-1` round trip | Available in the Next.js UI, not recorded. |
| Profile 2 has no wallet extension and signs in after entering only the DID | Available in the Next.js UI, not recorded. |
| Session visibly contains DID and key ID with no address field | Available in the Next.js UI, not recorded. |
| The same proof is rejected at another origin and on replay, with failure steps shown | Available in the Next.js UI and vectors, not recorded live. |

Current blocker: no captured auth `did:key`, controller-signed update transaction hash,
captured live proof file, or local browser recording file is available in this checkout.
