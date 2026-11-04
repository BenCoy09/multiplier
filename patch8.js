const fs = require("fs"), R = (f) => fs.readFileSync(f, "utf8");
let a = R("app.js");
const pages = { "index.html": R("index.html"), "home.html": R("home.html"), "rooms.html": R("rooms.html"), "judges.html": R("judges.html") };
function rep(s, from, to, name) { const i = s.indexOf(from); if (i < 0) throw new Error("anchor not found: " + name + " (is this the right file version?)"); return s.slice(0, i) + to + s.slice(i + from.length); }
function rx(s, re, to, name) { if (!re.test(s)) throw new Error("anchor not found: " + name); return s.replace(re, to); }
// server: serve the shared files
a = rep(a, 'JUDGESPAGE = rd("judges.html");', 'JUDGESPAGE = rd("judges.html");\nconst STATIC = { "/logo.svg": [rd("logo.svg"), "image/svg+xml"], "/mark.svg": [rd("mark.svg"), "image/svg+xml"], "/site.css": [rd("site.css"), "text/css; charset=utf-8"], "/site.js": [rd("site.js"), "application/javascript; charset=utf-8"] };', "static load");
a = rep(a, 'if (u.pathname === "/judges") {', 'if (STATIC[u.pathname]) { res.writeHead(200, { "content-type": STATIC[u.pathname][1], "cache-control": "public, max-age=300" }); return res.end(STATIC[u.pathname][0]); }\n  if (u.pathname === "/judges") {', "static route");
// every page: shared header, footer, stylesheet, icon
for (const f of Object.keys(pages)) {
  let s = pages[f];
  s = rx(s, /<header>[\s\S]*?<\/header>/, '<header id="sx"></header>', f + " header");
  s = rep(s, "</title>", '</title><link rel="icon" href="/mark.svg" type="image/svg+xml">', f + " icon");
  s = rep(s, "</head>", '<link rel="stylesheet" href="/site.css"></head>', f + " css");
  s = s.replace(/<footer>[\s\S]*?<\/footer>/, "");
  s = rep(s, "</body>", '<footer id="sxf"></footer><script src="/site.js"></script></body>', f + " footer");
  pages[f] = s;
}
// judges: anchor for the Status link
pages["judges.html"] = rep(pages["judges.html"], "<h2>Live status</h2>", '<h2 id="live">Live status</h2>', "status anchor");
// home: plain-English hero
pages["home.html"] = rep(pages["home.html"], "<h1>Same tokens. <em>Different shares.</em></h1>", "<h1>How many real shares do your <em>stock tokens</em> stand for?</h1>", "hero title");
pages["home.html"] = rep(pages["home.html"], "When a stock token’s multiplier is updated, the balance in a wallet stays the same, but the underlying shares those tokens represent change. Watch it happen, then check a real wallet.", "Your wallet shows a token count. This shows the real shares behind it, and tells you when that changes. Same tokens, different shares. Watch it happen, then check a real wallet.", "hero text");
// explorer: today's real shares up top
pages["index.html"] = rep(pages["index.html"], 'function render(d,w){const o=$("out"),dec=d.decimals;let h="";', R("p8_today.js").trimEnd(), "today line");
fs.writeFileSync("app.js", a);
for (const f of Object.keys(pages)) fs.writeFileSync(f, pages[f]);
console.log("patched app.js and 4 pages");
