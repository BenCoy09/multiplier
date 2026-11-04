const fs = require("fs"), R = (f) => fs.readFileSync(f, "utf8");
let a = R("app.js"), h = R("index.html"), m = R("home.html");
function rep(s, from, to, name) { const i = s.indexOf(from); if (i < 0) throw new Error("anchor not found: " + name + " (is this the right file version?)"); return s.slice(0, i) + to + s.slice(i + from.length); }
function before(s, at, ins, name) { return rep(s, at, ins + at, name); }
a = rep(a, "const save = () => fs.writeFileSync(DB, JSON.stringify(db));", "const save = () => { try { fs.writeFileSync(DB, JSON.stringify(db)); } catch (_) {} storeSave(); };", "save");
a = before(a, "const rd = (f) =>", R("p7_srv.js") + "\n", "extras block");
a = rep(a, "radar.err = null; await notifyDue(now);", "radar.err = null; await notifyDue2(now);", "notify");
a = rep(a, "return sendExample(p, chat);", "return sendExample2(p, chat);", "example");
a = rep(a, '["/api/pass-info", "/api/redeem", "/api/pass", "/api/stats", "/api/radar"]', '["/api/pass-info", "/api/redeem", "/api/pass", "/api/stats", "/api/radar", "/api/health", "/api/renew", "/api/addwallet"]', "route list");
a = before(a, 'if (u.pathname === "/api/radar") return send(200, radarJson());', R("p7_routes.js"), "extra routes");
a = rep(a, "{ valid: true, exp: p.exp }", "{ valid: true, exp: p.exp, wallets: walletsOf(p), tg: !!p.chat, price: PRICE, priceWallet: PRICE_WALLET }", "pass info");
a = rep(a, 'ROOMSPAGE = rd("rooms.html");', 'ROOMSPAGE = rd("rooms.html"), JUDGESPAGE = rd("judges.html");', "judges load");
a = before(a, 'if (u.pathname === "/app") {', 'if (u.pathname === "/judges") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(JUDGESPAGE); }\n  ', "judges route");
a = rep(a, "startBackground(); });", 'loadStore().finally(() => { startBackground(); tgCheck().then((r) => console.log("Telegram:", JSON.stringify(r))); }); });', "startup");
h = rep(h, "tgLink(b);return}", "tgLink(b);proTools(b,r);return}", "pro tools call");
h = before(h, "function wrap(c,t,x,y,w,lh){", R("p7_cli.js"), "pro tools fn");
m = rep(m, "Independent project. Not affiliated with Robinhood.", '<a href="/judges" style="color:inherit">For judges</a> · Independent project. Not affiliated with Robinhood.', "home footer");
fs.writeFileSync("app.js", a); fs.writeFileSync("index.html", h); fs.writeFileSync("home.html", m);
console.log("patched app.js, index.html, home.html");
