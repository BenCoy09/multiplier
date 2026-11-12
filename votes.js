"use strict";
// Weekly vote tally, read straight from $WIF burns on chain. READ-ONLY: it never writes or stores anything.
//
// A vote is one burn of $WIF to the dead address whose amount is a whole number of $WIF plus the option number in the
// smallest unit. Example: 1.000000000000000002 $WIF = option 2 (1 point); 10.000000000000000002 = option 2 (10 points). Pro passes burn exact whole amounts (fraction 0), so they
// can never be mistaken for votes. A round is one ISO week, Monday 00:00:00 UTC to Sunday 23:59:59 UTC. No admin, no cron:
// every round is recomputed from the chain, so anyone can check it.
const OPTIONS = ["SPY", "NVDA", "GLD", "CRCL", "SPCX"]; // option number = position + 1
const DAY = 864e5, MAX_LIST = 200;

function weekOf(ms) { // ISO 8601 week containing the instant `ms`, in UTC
  const d = new Date(ms), dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  const mon = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
  const thu = mon + 3 * DAY, year = new Date(thu).getUTCFullYear();
  const week = Math.floor((thu - Date.UTC(year, 0, 1)) / DAY / 7) + 1;
  return { key: year + "-W" + String(week).padStart(2, "0"), start: mon / 1000, end: (mon + 7 * DAY) / 1000 - 1 };
}
function parseKey(key) { // "2026-W46" -> same shape as weekOf, or null if it is not a real ISO week
  const m = /^(\d{4})-W(\d{2})$/.exec(String(key || ""));
  if (!m) return null;
  const year = +m[1], week = +m[2];
  if (week < 1 || week > 53 || year < 2000 || year > 2100) return null;
  const jan4 = Date.UTC(year, 0, 4), mon1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY; // Monday of ISO week 1
  const w = weekOf(mon1 + (week - 1) * 7 * DAY);
  return w.key === key ? w : null; // rejects week 53 in a year that has only 52
}
const shift = (w, n) => weekOf((w.start + n * 7 * 86400) * 1000).key;
const wif = (a, dec) => { const s = a.toString().padStart(dec + 1, "0"), i = s.length - dec; return s.slice(0, i).replace(/^0+(?=\d)/, "") + "." + s.slice(i); };

module.exports = function makeVotes(ctx) {
  const { rpc, getLogs, blockAt, hex, pad32, T_TR, WIF, DEAD, TOK } = ctx, now = ctx.now || Date.now;
  const opts = OPTIONS.filter((s) => !TOK || TOK[s]);
  const cache = new Map(), inflight = new Map();
  let decCache = null;
  async function decimals() { // read from the token itself, never assumed
    if (decCache !== null) return decCache;
    const d = parseInt(await rpc("eth_call", [{ to: WIF, data: "0x313ce567" }, "latest"]), 16);
    if (!Number.isInteger(d) || d < 1 || d > 36) throw new Error("Could not read the $WIF decimals from the chain.");
    return (decCache = d);
  }

  async function scan(w) {
    const dec = await decimals(), ONE = 10n ** BigInt(dec);
    const nowSec = Math.floor(now() / 1000), future = w.start > nowSec, current = !future && w.end >= nowSec;
    const out = {
      round: { key: w.key, prev: shift(w, -1), next: shift(w, 1), start: w.start, end: w.end, current, future, startBlock: null, endBlock: null, latestBlock: null },
      decimals: dec,
      options: opts.map((sym, i) => ({ n: i + 1, sym, votes: 0, points: 0n, burned: 0n, list: [], voteAmountWif: wif(ONE + BigInt(i + 1), dec) })),
      other: { count: 0, burned: 0n }, total: 0, totalPoints: 0n, partial: false, explorer: ctx.EXPLORER || "",
      rule: "A vote is a burn of whole $WIF plus the option number in the smallest unit (1 to " + opts.length + "). Each whole $WIF burned is one point; the token with the most points wins.",
    };
    if (future) return out;
    const latest = parseInt(await rpc("eth_blockNumber", []), 16);
    out.round.latestBlock = latest;
    const startBlock = (await blockAt(w.start - 1, latest)) + 1; // first block at or after Monday 00:00:00 UTC
    const endBlock = current ? latest : await blockAt(w.end, latest);
    out.round.startBlock = startBlock; out.round.endBlock = endBlock;
    if (startBlock <= endBlock) {
      const base = { address: WIF, topics: [T_TR, null, "0x" + pad32(DEAD)] };
      const r = await getLogs(base, startBlock, endBlock, Date.now() + 25000);
      out.partial = !!r.partial;
      const seen = new Set(), votes = [];
      for (const l of r.logs) {
        if (l.removed) continue;
        const id = l.transactionHash.toLowerCase() + ":" + parseInt(l.logIndex, 16);
        if (seen.has(id)) continue; seen.add(id);
        const amount = BigInt(l.data), frac = amount % ONE, option = Number(frac);
        const ok = amount >= ONE && frac >= 1n && frac <= BigInt(opts.length);
        if (!ok) { out.other.count++; out.other.burned += amount; continue; }
        votes.push({ tx: l.transactionHash.toLowerCase(), from: ("0x" + l.topics[1].slice(26)).toLowerCase(), block: parseInt(l.blockNumber, 16), li: parseInt(l.logIndex, 16), option, amount, weight: amount / ONE });
      }
      votes.sort((a, b) => b.block - a.block || b.li - a.li);
      for (const v of votes) {
        const o = out.options[v.option - 1]; o.votes++; o.points += v.weight; o.burned += v.amount; out.total++; out.totalPoints += v.weight;
        if (o.list.length < MAX_LIST) o.list.push({ tx: v.tx, from: v.from, block: v.block, amountWif: wif(v.amount, dec), points: Number(v.weight) });
      }
    }
    const top = out.options.reduce((m, o) => (o.points > m ? o.points : m), 0n), lead = out.options.filter((o) => o.points === top);
    out.leader = top > 0n && lead.length === 1 ? lead[0].sym : null; out.tie = top > 0n && lead.length > 1 ? lead.map((o) => o.sym) : null;
    out.final = !current && !out.partial;
    return out;
  }
  const ser = (o) => ({ ...o, totalPoints: Number(o.totalPoints), options: o.options.map((x) => ({ ...x, points: Number(x.points), burned: x.burned.toString(), burnedWif: wif(x.burned, o.decimals), truncated: x.votes > x.list.length })), other: { count: o.other.count, burnedWif: wif(o.other.burned, o.decimals) }, generatedAt: Math.floor(now() / 1000) });

  async function tally(key) {
    const w = key ? parseKey(key) : weekOf(now());
    if (!w) { const e = new Error("Round must look like 2026-W46 (an ISO week)."); e.status = 400; throw e; }
    const hit = cache.get(w.key);
    if (hit && now() - hit.at < hit.ttl) return hit.data;
    if (inflight.has(w.key)) return inflight.get(w.key);
    const p = scan(w).then((o) => {
      const data = ser(o);
      cache.set(w.key, { at: now(), data, ttl: o.partial ? 3000 : o.round.current ? 30000 : 6 * 3600000 });
      return data;
    }).finally(() => inflight.delete(w.key));
    inflight.set(w.key, p);
    return p;
  }
  return { tally, OPTIONS: opts };
};
module.exports.weekOf = weekOf; module.exports.parseKey = parseKey;
