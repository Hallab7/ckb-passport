import { spawnSync } from "node:child_process";

for (const workspace of [
  "@ckb-passport/siwd-core",
  "@ckb-passport/siwd-browser",
  "@ckb-passport/siwd-verify",
  "@ckb-passport/demo",
]) {
  run(`npm run build -w ${workspace}`);
}

function run(command) {
  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

