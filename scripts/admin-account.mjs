import { randomBytes, pbkdf2Sync } from "node:crypto";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { localStateRoot } from "./local-state.mjs";

const [mode, suppliedEmail, persistTo] = process.argv.slice(2);
const email = suppliedEmail?.trim().toLowerCase();
if (!["--local", "--sql", "--sql-file"].includes(mode) || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  process.stderr.write("Usage: node scripts/admin-account.mjs --local|--sql|--sql-file admin@example.com [local-persist-directory]\n");
  process.exit(1);
}
if (!process.stdin.isTTY) {
  process.stderr.write("Run this command in an interactive terminal so the password is hidden.\n");
  process.exit(1);
}
function hiddenPrompt(label) {
  return new Promise((resolve, reject) => {
    let value = "";
    const decoder = new TextDecoder();
    process.stdout.write(label);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onData = chunk => {
      for (const char of decoder.decode(chunk, { stream: true })) {
        if (char === "\u0003") { process.stdin.off("data", onData); process.stdin.setRawMode(false); reject(new Error("Cancelled")); return; }
        if (char === "\r" || char === "\n") { process.stdin.off("data", onData); process.stdin.setRawMode(false); process.stdout.write("\n"); resolve(value); return; }
        if (char === "\u007f" || char === "\b") value = Array.from(value).slice(0, -1).join("");
        else if (char >= " ") value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}
const password = await hiddenPrompt("New admin password (12+ characters, hidden): ");
const confirmation = await hiddenPrompt("Confirm password (hidden): ");
if (password.length < 12 || password !== confirmation) throw new Error("Passwords must match and contain at least 12 characters.");
const salt = randomBytes(16).toString("hex");
const hash = pbkdf2Sync(password, Buffer.from(salt, "hex"), 600_000, 32, "sha256").toString("hex");
if (mode === "--local") {
  const root = join(persistTo || localStateRoot(), "v3", "d1", "miniflare-D1DatabaseObject");
  const files = readdirSync(root).filter(file => file.endsWith(".sqlite") && file !== "metadata.sqlite");
  if (files.length !== 1) throw new Error(`Expected one local D1 database in ${root}; found ${files.length}.`);
  const db = new DatabaseSync(join(root, files[0]));
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO admin_users(email,password_hash,password_salt) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash,password_salt=excluded.password_salt,active=1").run(email,hash,salt);
    db.prepare("DELETE FROM admin_sessions WHERE admin_id=(SELECT id FROM admin_users WHERE email=?)").run(email);
    db.exec("COMMIT");
  } catch(error) { db.exec("ROLLBACK"); throw error; }
  finally { db.close(); }
  process.stdout.write(`Local admin ${email} created/reset. All earlier sessions revoked.\n`);
} else {
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  const sql = `-- Run in the intended D1 environment after applying migrations. Keep this hash SQL private.\nINSERT INTO admin_users(email,password_hash,password_salt) VALUES(${quote(email)},${quote(hash)},${quote(salt)}) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash,password_salt=excluded.password_salt,active=1;\nDELETE FROM admin_sessions WHERE admin_id=(SELECT id FROM admin_users WHERE email=${quote(email)});\n`;
  if (mode === "--sql-file") {
    const directory = mkdtempSync(join(tmpdir(), "pw-review-admin-"));
    const file = join(directory, "admin.sql");
    writeFileSync(file, sql, { mode: 0o600, flag: "wx" });
    process.stdout.write(`Private admin SQL written to ${file}. Delete it after applying to the intended D1 database.\n`);
  } else process.stdout.write(sql);
}
