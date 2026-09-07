# UI Proof Summary

This summary only describes what the current demo UI proves to a reviewer. It does not cover the full implementation or visual design.

## Proof Goal

The UI proves that a user can connect a wallet that owns a `did:ckb`, register a browser passkey to that DID with wallet approval, and later sign in with the passkey without using the wallet again.

## What The UI Proves

### 1. Wallet Ownership Finds The DID

The user connects a CCC-supported wallet. The UI uses the connected wallet to find the testnet `did:ckb` owned by that wallet.

This proves the demo no longer depends on manual DID pasting. The DID used in the flow comes from the connected wallet.

### 2. Passkey Registration Creates An Auth Key

After the DID is found, the user registers a browser passkey. The UI converts the passkey public key into a `did:key:zDna...` value.

This proves the passkey can become a DID verification method candidate.

### 3. Proof Of Possession Happens Before Update

Before the DID is updated, the UI asks the new passkey to sign a fresh challenge. The Register tab
also offers a wrong-key check that signs with the real passkey but claims a different `did:key`.

The wrong-key proof is rejected before transaction preparation. This proves the positive path and
the required refusal path use the same verification boundary.

### 4. Wallet Approval Updates The DID

After proof of possession passes, the UI asks the connected wallet to approve the DID update.

This proves the DID controller authorized adding the passkey to the DID document. The wallet is used only for setup, not for login.

### 5. Round Trip Confirms The Update

The Explorer tab can re-check the DID after the update and confirm that `auth-1` matches the passkey `did:key`.

This proves the key shown by the UI is the same key written into the resolved DID document.

### 6. Passkey Sign-In Works Without Wallet Use

The Sign In tab accepts a DID independently of wallet connection and asks a discoverable platform
passkey to sign a SIWD login challenge. Registration requires a platform authenticator, resident
credential, and user verification so the sign-in profile does not need a credential ID copied from
the registration profile.

This proves login can happen with the DID authentication key instead of the wallet spend key. No wallet approval, CKB transaction, or gas is needed for sign-in.

### 7. The Session Is DID-Based

After sign-in succeeds, the UI shows that the session belongs to the DID and key ID.

It also states that no wallet address field is present. This proves the login session is based on
the DID authentication key, not on a wallet address.

### 8. Replay Protection Is Visible

The UI can retry the same sign-in proof and show that it is rejected.

This proves the nonce is single-use and an old proof cannot be reused.

### 9. Cross-Origin Rejection Is Visible

Before accepting a valid sign-in, the UI presents the same proof to a different application origin.
The verifier rejects it and shows the exact verifier step. The original nonce remains usable because
failed proofs do not consume challenges.

## Proof Boundary

The UI proof is complete only when a real testnet update transaction is confirmed and the DID is re-resolved with the new `auth-1` passkey method.

Until then, the UI demonstrates the full proof flow, but the live H3 result remains unresolved.
