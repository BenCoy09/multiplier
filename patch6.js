const fs = require("fs"), R = (f) => fs.readFileSync(f, "utf8");
let a = R("app.js"), h = R("index.html"), m = R("home.html");
function rep(s, from, to, name) { const i = s.indexOf(from); if (i < 0) throw new Error("anchor not found: " + name + " (is this the right file version?)"); return s.slice(0, i) + to + s.slice(i + from.length); }
function before(s, at, ins, name) { return rep(s, at, ins + at, name); }
a = before(a, "const rd = (f) =>", R("p6_srv.js") + "\n", "rooms block");
a = rep(a, 'const HTML = rd("index.html"), HOME = rd("home.html");', 'const HTML = rd("index.html"), HOME = rd("home.html"), ROOMSPAGE = rd("rooms.html");', "load rooms page");
a = before(a, 'if (u.pathname === "/app") {', 'if (u.pathname === "/rooms") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(ROOMSPAGE); }\n  ', "rooms page route");
a = before(a, 'if (["/api/pass-info", "/api/redeem", "/api/pass", "/api/stats", "/api/radar"].includes(u.pathname)) {', R("p6_routes.js"), "chat routes");
h = rep(h, '<nav><a href="/">← Home</a></nav>', '<nav><a href="/">← Home</a><a href="/rooms">Rooms</a></nav>', "app nav");
m = rep(m, '<a href="#how">How it works</a><a class="btn" href="/app">Open explorer</a>', '<a href="#how">How it works</a><a href="/rooms">Rooms</a><a class="btn" href="/app">Open explorer</a>', "home nav");
m = rep(m, "for a token it holds. Unlock by burning $WIF.", "for a token it holds, plus posting in the live rooms. Unlock by burning $WIF.", "pro card");
fs.writeFileSync("app.js", a); fs.writeFileSync("index.html", h); fs.writeFileSync("home.html", m);
console.log("patched app.js, index.html, home.html");
