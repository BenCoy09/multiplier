var PASS="";try{PASS=localStorage.getItem("mx_pass")||""}catch(e){}
function setPass(p){PASS=p;try{if(p)localStorage.setItem("mx_pass",p);else localStorage.removeItem("mx_pass")}catch(e){}}
async function proInit(){var b=$("pro");
if(PASS){try{var r=await(await fetch("/api/pass?pass="+encodeURIComponent(PASS))).json();if(r.valid){b.innerHTML='<div class="msg"><b>Pro active</b> until '+new Date(r.exp).toISOString().slice(0,10)+'. Analyze now also shows the wallet’s balance at every update, with a CSV download.</div>';return}}catch(e){}setPass("")}
b.innerHTML='<details id="pd"><summary>Unlock Pro with $WIF</summary><div id="pb" class="m">Loading…</div></details>';
$("pd").addEventListener("toggle",function(){if($("pd").open)proInfo()});if(location.hash==="#pro")$("pd").open=true}
async function proInfo(){var x=$("pb");try{var i=await(await fetch("/api/pass-info")).json();if(i.error)throw new Error(i.error);
x.innerHTML='<p>Pro shows the wallet’s balance at <b>every</b> multiplier update and exports a CSV. It lasts '+i.days+' days and is unlocked by burning $WIF.</p><p>1. In your own wallet, send <b>'+esc(i.price)+' $WIF</b> to the dead address, which takes it out of circulation:<code>'+i.dead+'</code>Token contract:<code>'+i.token+'</code></p><p>2. Paste the transaction hash here:</p><div class="row"><input id="rtx" placeholder="0x… transaction hash" spellcheck="false" aria-label="Burn transaction hash"><button class="go" id="rgo" type="button">Unlock</button></div><p id="rm" class="m"></p><p class="m">This site never connects to your wallet. It checks the burn on-chain. Whoever submits a burn hash first receives the pass, so redeem right after sending.</p>';
$("rgo").onclick=redeemTx}catch(e){x.textContent="Could not load unlock details: "+e.message}}
async function redeemTx(){var m=$("rm"),t=$("rtx").value.trim();$("rgo").disabled=true;m.textContent="Checking the transaction on-chain…";
try{var r=await fetch("/api/redeem?tx="+encodeURIComponent(t)),d=await r.json();if(!r.ok)throw new Error(d.error||"Failed");setPass(d.pass);proInit()}
catch(e){m.textContent=e.message}$("rgo").disabled=false}
function holdTable(d,w){var dec=d.decimals,E=10n**18n,rows=[],csv=["date_utc,old_multiplier,new_multiplier,token_balance,shares_before,shares_after,change"];
var pl=function(b){return fx(b,dec,Math.min(dec,8)).replace(/,/g,"").replace(/−/g,"-")};
d.events.forEach(function(e,i){var p=d.perEvent[i],day=dt(e.eff);
if(!p||p.raw===null){rows.push("<tr><td>"+day+"</td><td>"+fm(e.o)+" → "+fm(e.n)+'</td><td colspan="4">unavailable</td></tr>');csv.push(day+","+fm(e.o)+","+fm(e.n)+",unavailable,,,");return}
var raw=BigInt(p.raw),b=raw*BigInt(e.o)/E,a=raw*BigInt(e.n)/E,df=a-b;
rows.push("<tr><td>"+day+"</td><td>"+fm(e.o)+" → "+fm(e.n)+"</td><td>"+fx(raw,dec)+"</td><td>"+fx(b,dec)+"</td><td>"+fx(a,dec)+"</td><td>"+(df<0n?"":"+")+fx(df,dec)+"</td></tr>");
csv.push(day+","+fm(e.o)+","+fm(e.n)+","+pl(raw)+","+pl(b)+","+pl(a)+","+pl(df))});
window.__csv=csv.join("\n");
return'<h2>Your holding at each update</h2><div class="tw"><table class="ht"><tr><th>Date</th><th>Multiplier</th><th>Tokens held</th><th>Shares before</th><th>Shares after</th><th>Change</th></tr>'+rows.join("")+'</table></div><div class="acts"><button id="pdl" type="button" onclick="dlcsv()">Download CSV</button></div>'}
function dlcsv(){var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([window.__csv],{type:"text/csv"}));a.download="multiplier-history.csv";a.click()}
