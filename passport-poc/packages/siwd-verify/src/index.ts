export {
  ConfigError,
  getDidKnownScript,
  loadPassportPocConfig,
} from "./config.js";
export type {
  CkbHashType,
  ConfigEnv,
  PassportPocConfig,
  PassportPocNetwork,
} from "./config.js";
export { verifySiwdKeyChecks } from "./key-checks.js";
export type {
  VerifySiwdKeyChecksOptions,
  VerifySiwdKeyChecksResult,
} from "./key-checks.js";
export { generateNonce, InMemoryNonceService } from "./nonce.js";
export type {
  NonceConsumeResult,
  NonceRecord,
  NonceServiceOptions,
} from "./nonce.js";
export { verifySiwdMessageChecks } from "./proof.js";
export type {
  BaseSiwdProofEnvelope,
  NonceConsumer,
  SiwdProofEnvelope,
  SiwdProofMode,
  VerifySiwdMessageChecksFailureCode,
  VerifySiwdMessageChecksOptions,
  VerifySiwdMessageChecksResult,
  WalletSiwdProofEnvelope,
  WebAuthnSiwdProofEnvelope,
} from "./proof.js";
export { buildDidTypeScript, resolveDidCell } from "./resolver.js";
export type { DidCellResolution, ResolveDidCellOptions } from "./resolver.js";
export { checkDidVerificationMethodRoundTrip } from "./round-trip.js";
export type {
  CheckDidVerificationMethodRoundTripOptions,
  DidVerificationMethodRoundTrip,
} from "./round-trip.js";
export {
  decodeDidDocumentFromCell,
  validateDidCkbDocument,
} from "./document.js";
export type { DidCkbDocument, DidDocumentDecodeResult } from "./document.js";
export {
  prepareDidVerificationMethodUpdate,
  submitDidVerificationMethodUpdate,
  upsertP256VerificationMethod,
} from "./did-update.js";
export type {
  DidTransferFunction,
  DidVerificationMethodUpdateFailureCode,
  DidVerificationMethodUpdateResult,
  PreparedDidVerificationMethodUpdate,
  PrepareDidVerificationMethodUpdateOptions,
  SubmittedDidVerificationMethodUpdate,
  SubmitDidVerificationMethodUpdateOptions,
} from "./did-update.js";
export { selectVerificationMethod } from "./verification-method.js";
export type { VerificationMethodSelection } from "./verification-method.js";
export {
  hashCkbPersonalMessage,
  recoverableHexToRawSignatureHex,
  WALLET_RAW_SIGNATURE_HEX_LENGTH,
  WALLET_SIGNATURE_HEX_LENGTH,
  WALLET_SIGNING_CONVENTION,
  walletSigningConvention,
} from "./wallet-signing.js";
export type { WalletSigningConvention } from "./wallet-signing.js";
export { verifyWalletSignature } from "./wallet-verify.js";
export type {
  VerifyWalletSignatureOptions,
  VerifyWalletSignatureResult,
} from "./wallet-verify.js";
export { verifyWebAuthnSignature } from "./webauthn-verify.js";
export type {
  VerifyWebAuthnSignatureOptions,
  VerifyWebAuthnSignatureResult,
} from "./webauthn-verify.js";
