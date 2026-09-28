import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export function localStateRoot() {
  if (process.env.PW_LOCAL_STATE_DIR?.trim()) return path.resolve(process.env.PW_LOCAL_STATE_DIR);
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(localAppData, "PropwealthMetaAttribution", "state");
  }
  return path.join(projectRoot, ".wrangler", "state");
}
