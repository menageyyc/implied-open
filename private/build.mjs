// Build for the PRIVATE Pages project (root dir: private, build command: node build.mjs, output: dist).
// Copies the public page from ../site (which now shows SXF itself, via this project's login-protected
// /api/sxf). Kept only until the private site is deleted (see HANDOFF.md).
// Fails the build (instead of publishing something half-made) if the public page changed shape.
import fs from "node:fs";
import path from "node:path";

const out = "dist";
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync("../site", out, { recursive: true });

const file = path.join(out, "index.html");
let h = fs.readFileSync(file, "utf8");
function swap(from, to) {
  const n = h.split(from).length - 1;
  if (n !== 1) { console.error(`build.mjs: expected exactly one ${JSON.stringify(from)} in site/index.html, found ${n}`); process.exit(1); }
  h = h.split(from).join(to);
}
swap("<title>Implied Open</title>", "<title>Implied Open (private)</title>");
swap("<h1>Implied Open</h1>", '<h1>Implied Open <span style="font:500 0.8rem var(--mono);color:var(--muted);letter-spacing:0.08em;vertical-align:middle">PRIVATE</span></h1>');
fs.writeFileSync(file, h);
console.log("build.mjs: private site built in", out);
