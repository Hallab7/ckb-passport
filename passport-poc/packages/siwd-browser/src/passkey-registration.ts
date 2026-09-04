export type PasskeyRegistrationOptions = {
  rpId: string;
  rpName: string;
  userId: Uint8Array;
  userName: string;
  userDisplayName: string;
  challenge: Uint8Array;
  residentKey?: ResidentKeyRequirement;
  userVerification?: UserVerificationRequirement;
};

export type PasskeyRegistrationResult = {
  credentialId: string;
  rawId: Uint8Array;
  attestationObject: Uint8Array;
  clientDataJSON: Uint8Array;
};

export type BrowserCredentials = Pick<CredentialsContainer, "create">;

export class PasskeyRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasskeyRegistrationError";
  }
}

export function buildPasskeyCreationOptions(
  options: PasskeyRegistrationOptions,
): PublicKeyCredentialCreationOptions {
  return {
    challenge: toArrayBuffer(options.challenge),
    rp: {
      id: options.rpId,
      name: options.rpName,
    },
    user: {
      id: toArrayBuffer(options.userId),
      name: options.userName,
      displayName: options.userDisplayName,
    },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    authenticatorSelection: {
      residentKey: options.residentKey ?? "preferred",
      userVerification: options.userVerification ?? "preferred",
    },
  };
}

export async function registerPasskey(
  options: PasskeyRegistrationOptions,
  credentials: BrowserCredentials | undefined = globalThis.navigator?.credentials,
): Promise<PasskeyRegistrationResult> {
  if (!credentials) {
    throw new PasskeyRegistrationError("WebAuthn credentials API is unavailable");
  }

  let credential: Credential | null;
  try {
    credential = await credentials.create({
      publicKey: buildPasskeyCreationOptions(options),
    });
  } catch (error) {
    throw new PasskeyRegistrationError(
      error instanceof Error
        ? `Passkey registration failed: ${error.message}`
        : "Passkey registration failed",
    );
  }

  if (!credential) {
    throw new PasskeyRegistrationError("Passkey registration returned no credential");
  }
  if (!isAttestationCredential(credential)) {
    throw new PasskeyRegistrationError(
      "Passkey registration did not return attestation data",
    );
  }

  return {
    credentialId: credential.id,
    rawId: new Uint8Array(credential.rawId),
    attestationObject: new Uint8Array(credential.response.attestationObject),
    clientDataJSON: new Uint8Array(credential.response.clientDataJSON),
  };
}

function isAttestationCredential(
  credential: Credential,
): credential is PublicKeyCredential & {
  response: AuthenticatorAttestationResponse;
} {
  const maybeCredential = credential as Partial<PublicKeyCredential> & {
    response?: Partial<AuthenticatorAttestationResponse>;
  };
  return (
    typeof maybeCredential.id === "string" &&
    maybeCredential.rawId instanceof ArrayBuffer &&
    maybeCredential.response?.attestationObject instanceof ArrayBuffer &&
    maybeCredential.response.clientDataJSON instanceof ArrayBuffer
  );
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

