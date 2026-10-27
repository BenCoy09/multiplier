const fs = require("fs");
let a = fs.readFileSync("app.js", "utf8"), h = fs.readFileSync("index.html", "utf8");
function rep(s, from, to, name) { const i = s.indexOf(from); if (i < 0) throw new Error("anchor not found: " + name + " (is this the original file?)"); return s.slice(0, i) + to + s.slice(i + from.length); }
// server: "/" = home page, "/app" = explorer
a = rep(a, 'const HTML = require("fs").readFileSync(require("path").join(__dirname, "index.html"), "utf8");',
  'const rd = (f) => require("fs").readFileSync(require("path").join(__dirname, f), "utf8");\nconst HTML = rd("index.html"), HOME = rd("home.html");', "html load");
a = rep(a, 'if (u.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(HTML); }',
  'if (u.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(HOME); }\n  if (u.pathname === "/app") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(HTML); }', "routes");
// explorer page: drop the intro sections (they now live on the home page), link back home
const i1 = h.indexOf('<section class="hero">'), i2 = h.indexOf('<div id="lookup" class="lh">');
if (i1 < 0 || i2 < 0 || i2 < i1) throw new Error("anchor not found: hero/lookup (is index.html the patched one?)");
h = h.slice(0, i1) + h.slice(i2);
h = rep(h, '<nav><a href="#how">How it works</a><a href="#lookup">Look up a wallet</a></nav>', '<nav><a href="/">← Home</a></nav>', "nav");
fs.writeFileSync("app.js", a); fs.writeFileSync("index.html", h);
console.log("patched app.js and index.html");
