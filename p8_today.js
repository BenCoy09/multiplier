function render(d,w){const o=$("out"),dec=d.decimals;let h="";
if(d.events.length){const L=[...d.events].sort((a,b)=>b.eff-a.eff)[0],bn=BigInt(d.balanceNow),sh2=bn*BigInt(L.n)/(10n**18n);h+='<div class="msg" style="border-style:solid;color:var(--ink)"><b>Today:</b> '+fx(bn,dec)+" "+cur+" tokens = about <b>"+fx(sh2,dec)+"</b> real shares, using the multiplier from the latest update.</div>"}
