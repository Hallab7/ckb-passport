export {
  compressP256PublicKey,
  parseCoseP256PublicKey,
  passkeyAttestationToDidKey,
  PasskeyDidKeyError,
} from "./passkey-did-key.js";
export type { CoseP256PublicKey, PasskeyDidKeyResult } from "./passkey-did-key.js";
export {
  buildPasskeyRequestOptions,
  derEcdsaSignatureToRaw,
  PasskeyAssertionError,
  signInWithPasskey,
} from "./passkey-assertion.js";
export type {
  BrowserAssertionCredentials,
  PasskeyAssertionOptions,
  WebAuthnProofEnvelope,
} from "./passkey-assertion.js";
export {
  buildPasskeyCreationOptions,
  PasskeyRegistrationError,
  registerPasskey,
} from "./passkey-registration.js";
export type {
  BrowserCredentials,
  PasskeyRegistrationOptions,
  PasskeyRegistrationResult,
} from "./passkey-registration.js";
export {
  clearSoftwareAuthKey,
  DEFAULT_SOFTWARE_AUTH_KEY_STORAGE_KEY,
  generateSoftwareAuthKey,
  IndexedDbSoftwareAuthKeyStore,
  loadSoftwareAuthKey,
  signInWithSoftwareKey,
  SoftwareAuthKeyError,
} from "./software-key.js";
export type {
  GenerateSoftwareAuthKeyOptions,
  LoadSoftwareAuthKeyOptions,
  SignInWithSoftwareKeyOptions,
  SoftwareAuthKeyRecord,
  SoftwareAuthKeyState,
  SoftwareAuthKeyStore,
  SoftwareProofEnvelope,
} from "./software-key.js";
