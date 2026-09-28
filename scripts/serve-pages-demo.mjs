import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../docs/", import.meta.url);
const base = "/PW-Meta-MVP-v1/";
const types = { "index.html": "text/html", "style.css": "text/css", "app.js": "text/javascript", "model.mjs": "text/javascript" };
const port = Number(process.env.PW_DEMO_PORT || 5174);

createServer(async (request, response) => {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  if (path === "/") { response.writeHead(302, { Location: base }); response.end(); return; }
  const file = path === base ? "index.html" : path.startsWith(base) ? path.slice(base.length) : "";
  if (!Object.hasOwn(types, file)) { response.writeHead(404); response.end("Not found"); return; }
  try {
    const body = await readFile(fileURLToPath(new URL(file, root)));
    response.writeHead(200, { "Content-Type": `${types[file]}; charset=utf-8`, "Cache-Control": "no-store" });
    response.end(body);
  } catch { response.writeHead(500); response.end("Preview unavailable"); }
}).listen(port, "127.0.0.1", () => console.log(`Pages demo preview: http://localhost:${port}${base}`));
