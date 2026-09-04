import { spawnSync } from "node:child_process";

const checkOnly = process.argv.includes("--check");

if (checkOnly) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        command: "npm run demo",
        behavior: "builds the workspace, then starts @ckb-passport/demo",
        port: Number.parseInt(process.env.CKB_PASSPORT_DEMO_PORT ?? process.env.PORT ?? "3000", 10),
        expectedOrigin: process.env.SIWD_EXPECTED_ORIGIN ?? "http://localhost:3000",
        network: process.env.CKB_PASSPORT_NETWORK ?? "ckb-testnet",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

run("npm run build");
run("npm run dev -w @ckb-passport/demo");

function run(command) {
  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
