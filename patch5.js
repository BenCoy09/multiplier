const fs = require("fs"), R = (f) => fs.readFileSync(f, "utf8");
let a = R("app.js"), h = R("index.html"), m = R("home.html");
function rep(s, from, to, name) { const i = s.indexOf(from); if (i < 0) throw new Error("anchor not found: " + name + " (is this the right file version?)"); return s.slice(0, i) + to + s.slice(i + from.length); }
function before(s, at, ins, name) { return rep(s, at, ins + at, name); }
// server: radar, alerts, background jobs
a = before(a, "const rd = (f) =>", R("p5_srv.js") + "\n", "radar block");
a = rep(a, '["/api/pass-info", "/api/redeem", "/api/pass", "/api/stats"]', '["/api/pass-info", "/api/redeem", "/api/pass", "/api/stats", "/api/radar"]', "route list");
a = before(a, 'if (u.pathname === "/api/stats") return send(200, await stats());', 'if (u.pathname === "/api/radar") return send(200, radarJson());\n      ', "radar route");
a = rep(a, "decimals: await wifDec(), days: DAYS }", "decimals: await wifDec(), days: DAYS, bot: BOT_NAME }", "bot name");
a = rep(a, '}).listen(PORT, () => console.log("Running on http://localhost:" + PORT + "  (RPC: " + RPC + ")"));', '}).listen(PORT, () => { console.log("Running on http://localhost:" + PORT + "  (RPC: " + RPC + ")"); startBackground(); });', "listen");
// explorer page: Telegram link once Pro is active
h = rep(h, "with a CSV download.</div>';return}", "with a CSV download.</div>';tgLink(b);return}", "tg link call");
h = before(h, "function wrap(c,t,x,y,w,lh){", R("p5_cli.js"), "tg link fn");
h = rep(h, "multiplier update and exports a CSV. It lasts ", "multiplier update, exports a CSV and turns on Telegram alerts for the paying wallet. It lasts ", "unlock text");
// home page
m = before(m, '<section class="sec" id="how">', R("p5_home.html"), "radar section");
m = rep(m, "<h3>Every update, plus CSV</h3><p>The wallet’s balance at each update, and a download. Unlock by sending $WIF to the dead address.</p>", "<h3>History, CSV and alerts</h3><p>The wallet’s balance at every update, a download, and Telegram alerts when a multiplier update is scheduled for a token it holds. Unlock by burning $WIF.</p>", "pro card");
fs.writeFileSync("app.js", a); fs.writeFileSync("index.html", h); fs.writeFileSync("home.html", m);
console.log("patched app.js, index.html, home.html");
