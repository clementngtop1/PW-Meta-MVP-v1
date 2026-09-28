import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { localStateRoot } from "./local-state.mjs";

const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const child = spawn(process.execPath, [wrangler, "dev", "--config", "dist/server/wrangler.json", "--local", "--persist-to", localStateRoot(), "--ip", "127.0.0.1", "--port", "5172", "--inspector-port", "0"], { stdio: "inherit" });
child.on("error", error => { console.error(error); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
