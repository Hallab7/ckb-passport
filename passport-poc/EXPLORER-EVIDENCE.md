# Explorer Evidence

Status: not captured in this checkout. The supplied testnet DID has live read evidence, but explorer
update evidence is still missing.

The PoC uses the CKB Pudge testnet explorer at:

```text
https://pudge.explorer.nervos.org
```

Run:

```powershell
npm run evidence:explorer
```

The Next.js demo also builds the same evidence from the `Build Evidence` button after a transaction
hash is available.

Required values:

| Field | Environment variable | Status |
|---|---|---|
| Testnet DID | `CKB_PASSPORT_LIVE_DID` | Supply before collecting explorer evidence. |
| Auth verification method | `CKB_PASSPORT_AUTH_DID_KEY` | Missing |
| DID update transaction hash | `CKB_PASSPORT_UPDATE_TX_HASH` | Missing |
| Capacity in shannons | `CKB_PASSPORT_UPDATE_CAPACITY_SHANNONS` | Optional; current DID cell read shows `55600000000` |

When live evidence is available, the script prints the transaction link and confirms that the
verification method begins `did:key:zDna`.
