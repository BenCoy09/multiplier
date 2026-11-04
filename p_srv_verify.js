log("\n== $WIF token", WIF);
  try { log("decimals:", parseInt(await call(WIF, SEL.decimals), 16), "| totalSupply:", BigInt(await call(WIF, "0x18160ddd")).toString(), "| code present:", (await rpc("eth_getCode", [WIF, "latest"])).length > 2); } catch (e) { log("WIF read FAILED:", e.message); }
  log("\nDone. Paste this whole report back.");
