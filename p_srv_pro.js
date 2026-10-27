let perEvent;
  if (pro && events.length) { // Pro: balance at every update
    perEvent = [];
    const blocks = [];
    for (const e of events) blocks.push(bc[e.eff] ?? (bc[e.eff] = await blockAt(e.eff, latest)));
    let items = null; try { items = await explorerTransfers(tk, w); } catch (_) {}
    const bn = BigInt(balanceNow), dd = items ? [true, false].find((d) => explorerSum(items, w, Infinity, d) === bn) : undefined;
    for (let i = 0; i < events.length; i++) {
      let raw = null;
      if (dd !== undefined) raw = explorerSum(items, w, blocks[i], dd);
      else { try { raw = await sumBalance(tk, w, blocks[i], Date.now() + 90000); } catch (_) { raw = null; } }
      perEvent.push({ eff: events[i].eff, block: blocks[i], raw: raw === null ? null : raw.toString() });
    }
  }
  return { token: sym, chainId: cid, latestBlock: latest, decimals, balanceNow, events, scheduled, pending, partialHistory: H.partial, atUpdate, perEvent };
