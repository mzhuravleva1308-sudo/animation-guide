import { spawn } from "node:child_process";
import { loadAppEnv } from "./load-app-env.mjs";

const env = loadAppEnv({ mode: "e2e" });
const port = env.E2E_PORT ?? "3100";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

await run(process.platform === "win32" ? "npm.cmd" : "npm", [
  "run",
  "build",
]);
await run(process.platform === "win32" ? "npm.cmd" : "npm", [
  "run",
  "start",
  "--",
  "-p",
  String(port),
]);
