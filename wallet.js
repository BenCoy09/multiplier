// Optional wallet connection: EIP-6963 wallet discovery, sign-in, one-click $WIF burn, signed burn claims. No libraries.
// A burn hash alone never unlocks anything: the wallet that sent the burn must also sign a free message that contains the hash.
var MXW=(function(){
var found=[],CHAIN={chainId:"0x1237",chainName:"Robinhood Chain",nativeCurrency:{name:"Ether",symbol:"ETH",decimals:18},rpcUrls:["https://rpc.mainnet.chain.robinhood.com"],blockExplorerUrls:["https://robinhoodchain.blockscout.com"]};
window.addEventListener("eip6963:announceProvider",function(e){var d=e.detail;if(d&&d.provider&&d.info&&!found.some(function(f){return f.info.uuid===d.info.uuid}))found.push(d)});
function ask(){window.dispatchEvent(new Event("eip6963:requestProvider"))}ask();
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
function wrap(e){
if(e&&e.code===4001)return new Error("You cancelled the request in your wallet.");
if(e&&e.code===-32002)return new Error("Your wallet already has a request waiting. Open it, approve or reject it, then try again.");
return new Error((e&&e.message)||"The wallet reported an error.")}
function pick(list){return new Promise(function(res,rej){var o=document.createElement("div");o.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:99;padding:16px";
var b=document.createElement("div");b.style.cssText="background:var(--pn,#fff);color:var(--ink,#000);border-radius:14px;padding:18px;max-width:360px;width:100%";b.innerHTML="<b>Choose a wallet</b>";
list.forEach(function(w){var x=document.createElement("button");x.type="button";x.style.cssText="display:flex;align-items:center;gap:10px;width:100%;margin-top:10px;padding:10px;border:1px solid var(--ln,#ccc);border-radius:10px;background:transparent;color:inherit;font:600 15px system-ui;cursor:pointer";
x.innerHTML=(w.info.icon?'<img src="'+w.info.icon+'" width="26" height="26" alt="">':"")+"<span></span>";x.lastChild.textContent=w.info.name||"Wallet";x.onclick=function(){o.remove();res(w)};b.appendChild(x)});
var c=document.createElement("button");c.type="button";c.textContent="Cancel";c.style.cssText="margin-top:12px;background:none;border:0;color:inherit;text-decoration:underline;cursor:pointer";c.onclick=function(){o.remove();rej(new Error("Cancelled."))};b.appendChild(c);o.appendChild(b);document.body.appendChild(o)})}
async function connect(){ask();await sleep(250);var l=found.slice();if(!l.length&&window.ethereum)l=[{info:{name:"Browser wallet",uuid:"legacy"},provider:window.ethereum}];
if(!l.length)throw new Error("No browser wallet found. Install MetaMask, or open this page inside your wallet app's browser. You can also send the $WIF yourself and paste the transaction hash below.");
var w=l.length===1?l[0]:await pick(l),acc;try{acc=await w.provider.request({method:"eth_requestAccounts"})}catch(e){throw wrap(e)}
if(!acc||!acc[0])throw new Error("Your wallet did not share an account.");return{provider:w.provider,account:acc[0],name:w.info.name}}
async function ensureChain(p){var id=await p.request({method:"eth_chainId"});if(String(id).toLowerCase()===CHAIN.chainId)return;
try{await p.request({method:"wallet_switchEthereumChain",params:[{chainId:CHAIN.chainId}]})}
catch(e){if(e&&(e.code===4902||/unrecognized|not been added|add the chain/i.test(e.message||"")))try{await p.request({method:"wallet_addEthereumChain",params:[CHAIN]})}catch(e2){throw wrap(e2)}else throw wrap(e)}
for(var k=0;k<10;k++){id=await p.request({method:"eth_chainId"});if(String(id).toLowerCase()===CHAIN.chainId)return;await sleep(300)} // some wallets answer before the switch has happened
throw new Error("Your wallet is not on Robinhood Chain yet. Switch networks in your wallet and try again.")}
function hexMsg(s){return"0x"+Array.prototype.map.call(new TextEncoder().encode(s),function(b){return("0"+b.toString(16)).slice(-2)}).join("")}
async function sign(w,msg){try{return await w.provider.request({method:"personal_sign",params:[hexMsg(msg),w.account]})}catch(e){throw wrap(e)}}
async function signIn(w){var n=await(await fetch("/api/nonce")).json(),sig=await sign(w,n.message);
var r=await fetch("/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({address:w.account,message:n.message,signature:sig})}),d=await r.json();if(!r.ok)throw new Error(d.error||"Sign-in failed.");return d}
// price: what to burn (defaults to the unlock price). Returns the transaction hash.
async function burn(w,i,price){price=String(price||i.price);await ensureChain(w.provider);
var cur=await w.provider.request({method:"eth_accounts"});if(cur&&cur[0]&&cur[0].toLowerCase()!==w.account.toLowerCase())w.account=cur[0]; // the user switched accounts after connecting
var dec=Number(i.decimals),pp=price.split("."),amt=BigInt(pp[0]+((pp[1]||"")+"0".repeat(dec)).slice(0,dec)),bal=null;
try{bal=BigInt(await w.provider.request({method:"eth_call",params:[{to:i.token,data:"0x70a08231"+w.account.slice(2).toLowerCase().padStart(64,"0")},"latest"]}))}catch(e){}
if(bal!==null&&bal<amt)throw new Error("The selected wallet ("+w.account.slice(0,6)+"…"+w.account.slice(-4)+") holds less than "+price+" $WIF on Robinhood Chain. Select the wallet that holds your $WIF and try again.");
var data="0xa9059cbb"+i.dead.slice(2).toLowerCase().padStart(64,"0")+amt.toString(16).padStart(64,"0");
try{return await w.provider.request({method:"eth_sendTransaction",params:[{from:w.account,to:i.token,data:data,value:"0x0"}]})}catch(e){throw wrap(e)}}
// The message the paying wallet signs. The server builds it, so it always contains the tx hash and a fresh time + code.
async function claimMsg(action,tx,pass,wallet){var r=await fetch("/api/claim-msg?action="+action+"&tx="+encodeURIComponent(tx)+(wallet?"&wallet="+encodeURIComponent(wallet):""),{headers:{"x-pass":pass||""}}),d=await r.json();
if(!r.ok)throw new Error(d.error||"Could not prepare the claim.");return d.message}
async function submit(action,tx,msg,sig,pass,wallet,say){
for(var k=0;k<45;k++){var r=await fetch("/api/"+action,{method:"POST",headers:{"content-type":"application/json","x-pass":pass||""},body:JSON.stringify({tx:tx,message:msg,signature:sig,wallet:wallet||""})}),d=await r.json();
if(r.ok)return d;if(!/not found yet/i.test(d.error||""))throw new Error(d.error||"Could not verify the burn.");
if(say)say("Waiting for the chain to confirm… ("+(k+1)+")");await sleep(3000)}
throw new Error("Still not confirmed. Wait until the transaction shows on the explorer, then press Verify & claim.")}
// action: "redeem" | "renew" | "addwallet". o: {pass, wallet, say}
async function claim(w,action,tx,o){o=o||{};var msg=await claimMsg(action,tx,o.pass,o.wallet);
if(o.say)o.say("Sign the free message in your wallet. It costs nothing and sends no transaction.");
var sig=await sign(w,msg);if(o.say)o.say("Checking the burn on-chain…");return submit(action,tx,msg,sig,o.pass,o.wallet,o.say)}
return{connect:connect,signIn:signIn,burn:burn,claim:claim,claimMsg:claimMsg,submit:submit,sign:sign}})();

// Reusable pay panel for unlock, renew and add-wallet. No element ids, so several panels can never misroute a click.
// o: {action, price, info, pass(), getWallet() (may throw), setWallet(v), onDone(result)}
MXW.payPanel=function(root,o){
var i=o.info,A=o.action,PK="mx_pending_"+A;
function x(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function q(k){return root.querySelector('[data-r="'+k+'"]')}
function st(m){q("st").textContent=m}
function getP(){try{var p=JSON.parse(localStorage.getItem(PK)||"null");return p&&p.tx?p:null}catch(e){return null}}
function setP(tx,w){try{localStorage.setItem(PK,JSON.stringify({tx:tx,w:w||""}))}catch(e){}}
function clrP(){try{localStorage.removeItem(PK)}catch(e){}}
root.innerHTML='<div class="msg" style="border-style:solid;color:var(--ink)"><b>Fastest way:</b> connect your wallet and pay in one click. Your wallet asks you to confirm a plain $WIF transfer, then to sign one free message that proves you own the paying wallet. The site never asks for approvals and never holds your funds.<div class="row" style="margin-top:10px"><button class="go" type="button" data-r="pay">Connect wallet &amp; pay '+x(o.price)+' $WIF</button></div></div>'+
'<details data-r="man" style="margin-top:10px"><summary>Sending it yourself, or already paid?</summary><p>Send <b>'+x(o.price)+' $WIF</b> from your own wallet to the dead address <code>'+x(i.dead)+'</code> (token <code>'+x(i.token)+'</code>), then paste the transaction hash. You then sign one free message with that same wallet, so nobody else can claim your hash.</p>'+
'<div class="row"><input data-r="tx" placeholder="0x… transaction hash" spellcheck="false" autocomplete="off" aria-label="Burn transaction hash"><button class="go" type="button" data-r="cl">Verify &amp; claim</button></div>'+
'<details style="margin-top:8px"><summary>No browser wallet? Sign the message elsewhere</summary><p class="m">Press Get message, sign that exact text with the paying wallet (a standard Ethereum personal_sign), then paste the signature.</p><div class="row"><button class="go" type="button" data-r="gm">Get message</button></div>'+
'<textarea data-r="mg" readonly rows="7" aria-label="Message to sign" style="width:100%;margin-top:8px;padding:10px;border:1px solid var(--ln);border-radius:8px;background:var(--pn);color:var(--ink);font:12px ui-monospace,Menlo,monospace"></textarea>'+
'<div class="row" style="margin-top:8px"><input data-r="sg" placeholder="0x… signature" spellcheck="false" autocomplete="off" aria-label="Signature"><button class="go" type="button" data-r="cs">Claim</button></div></details></details>'+
'<p class="m" data-r="st" aria-live="polite" style="margin-top:8px"></p>';
function lock(v){Array.prototype.forEach.call(root.querySelectorAll("button"),function(b){b.disabled=v})}
function txOk(){var t=q("tx").value.trim();if(!/^0x[0-9a-fA-F]{64}$/.test(t))throw new Error("Paste the transaction hash first. It starts with 0x and is 66 characters long.");return t}
function wal(){return o.getWallet?o.getWallet():""}
async function guard(fn){lock(true);try{await fn()}catch(e){var m=(e&&e.message)||"Something went wrong.";
if(/already been used|failed on-chain|No transfer of at least|more than one wallet/i.test(m))clrP();
else if(getP()&&!e.nohint){m+=" Your burn is already on-chain, so nothing is lost. Press Verify & claim to finish.";q("man").open=true}
st(m)}lock(false)}
q("pay").onclick=function(){guard(async function(){
if(getP()){q("man").open=true;var e0=new Error("You already sent a burn that has not been claimed yet. Press Verify & claim below to finish it first, so you do not pay twice.");e0.nohint=true;throw e0}
var wl=wal();st("Looking for your wallet…");var w=await MXW.connect();
st("Confirm the "+o.price+" $WIF transfer in your wallet…");var h=await MXW.burn(w,i,o.price);
setP(h,wl);q("tx").value=h;st("Sent. Waiting to sign…");
var d=await MXW.claim(w,A,h,{pass:o.pass(),wallet:wl,say:st});clrP();o.onDone(d)})};
q("cl").onclick=function(){guard(async function(){var h=txOk(),wl=wal();st("Looking for your wallet…");var w=await MXW.connect();
var d=await MXW.claim(w,A,h,{pass:o.pass(),wallet:wl,say:st});clrP();o.onDone(d)})};
q("gm").onclick=function(){guard(async function(){var h=txOk(),wl=wal();q("mg").value=await MXW.claimMsg(A,h,o.pass(),wl);st("Sign this exact text with the paying wallet, paste the signature, then press Claim.")})};
q("cs").onclick=function(){guard(async function(){var h=txOk(),wl=wal(),m=q("mg").value,s=q("sg").value.trim();
if(!m)throw new Error("Press Get message first.");if(!/^0x[0-9a-fA-F]{130}$/.test(s))throw new Error("Paste the signature. It starts with 0x and is 132 characters long.");
var d=await MXW.submit(A,h,m,s,o.pass(),wl,st);clrP();o.onDone(d)})};
var pd=getP();if(pd){q("tx").value=pd.tx;q("man").open=true;if(pd.w&&o.setWallet)o.setWallet(pd.w);st("You sent a burn that has not been claimed yet. Press Verify & claim to finish it. Do not pay again.")}
};

async function walletRestore(){try{var w=await MXW.connect(),s=await MXW.signIn(w),p=s.pass||s.expiredPass;
if(p){try{localStorage.setItem("mx_pass",p)}catch(e){}if(s.pass||location.pathname==="/app")location.reload();else location.href="/app#pro"}
else alert("No pass found for that wallet. Unlock Pro in the explorer first.")}catch(e){alert(e.message||"Could not sign in.")}}
