import { existsSync, statSync } from "node:fs";

const checkOnly = process.argv.includes("--check");
const defaultRecordingPath = "evidence/passport-poc-recording.mp4";
const recordingPath = process.env.CKB_PASSPORT_RECORDING ?? defaultRecordingPath;
const requiredScenes = [
  "tests passing",
  "profile 1 wallet connection and complete owned-DID choice",
  "valid proof-of-possession and wrong-key refusal before transaction preparation",
  "confirmed update hash, explorer page, and exact auth-1 round trip",
  "profile 2 sign-in without a wallet extension",
  "session DID and key ID with no address field",
  "cross-origin and identical-proof replay rejection with failure steps",
];

if (checkOnly) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        command: "npm run recording:verify",
        recordingPath,
        requiredScenes,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (!existsSync(recordingPath)) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: "recording_missing",
        message: "recording artifact was not found",
        recordingPath,
        requiredScenes,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const stats = statSync(recordingPath);
if (!stats.isFile() || stats.size === 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: "recording_invalid",
        message: "recording artifact must be a non-empty file",
        recordingPath,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      recordingPath,
      sizeBytes: stats.size,
      requiredScenes,
    },
    null,
    2,
  ),
);
