// Optional wallet connection: EIP-6963 wallet discovery, sign-in, one-click $WIF burn. No libraries.
var MXW=(function(){
var found=[],CHAIN={chainId:"0x1237",chainName:"Robinhood Chain",nativeCurrency:{name:"Ether",symbol:"ETH",decimals:18},rpcUrls:["https://rpc.mainnet.chain.robinhood.com"],blockExplorerUrls:["https://robinhoodchain.blockscout.com"]};
window.addEventListener("eip6963:announceProvider",function(e){var d=e.detail;if(d&&d.provider&&d.info&&!found.some(function(f){return f.info.uuid===d.info.uuid}))found.push(d)});
function ask(){window.dispatchEvent(new Event("eip6963:requestProvider"))}ask();
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
function wrap(e){return e&&e.code===4001?new Error("You cancelled the request in your wallet."):new Error((e&&e.message)||"The wallet reported an error.")}
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
try{await p.request({method:"wallet_switchEthereumChain",params:[{chainId:CHAIN.chainId}]})}catch(e){if(e&&(e.code===4902||/unrecognized|not been added|add the chain/i.test(e.message||"")))try{await p.request({method:"wallet_addEthereumChain",params:[CHAIN]})}catch(e2){throw wrap(e2)}else throw wrap(e)}}
async function signIn(w){var n=await(await fetch("/api/nonce")).json(),hex="0x"+Array.prototype.map.call(new TextEncoder().encode(n.message),function(b){return("0"+b.toString(16)).slice(-2)}).join(""),sig;
try{sig=await w.provider.request({method:"personal_sign",params:[hex,w.account]})}catch(e){throw wrap(e)}
var r=await fetch("/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({address:w.account,message:n.message,signature:sig})}),d=await r.json();if(!r.ok)throw new Error(d.error||"Sign-in failed.");return d}
async function burn(w,i){await ensureChain(w.provider);var dec=Number(i.decimals),pp=String(i.price).split("."),amt=BigInt(pp[0]+((pp[1]||"")+"0".repeat(dec)).slice(0,dec)),
data="0xa9059cbb"+i.dead.slice(2).toLowerCase().padStart(64,"0")+amt.toString(16).padStart(64,"0");
try{return await w.provider.request({method:"eth_sendTransaction",params:[{from:w.account,to:i.token,data:data,value:"0x0"}]})}catch(e){throw wrap(e)}}
async function claim(h,sid,say){for(var k=0;k<45;k++){var r=await fetch("/api/redeem?tx="+h,{headers:{"x-sid":sid}}),d=await r.json();if(r.ok)return d;if(!/not found yet/i.test(d.error||""))throw new Error(d.error||"Could not verify the burn.");if(say)say("Waiting for the chain to confirm… ("+(k+1)+")");await sleep(3000)}
throw new Error("Still not confirmed. Paste the transaction hash in the box below once it shows on the explorer.")}
return{connect:connect,signIn:signIn,burn:burn,claim:claim}})();
function oneClick(x,i){x.insertAdjacentHTML("afterbegin",'<div class="msg" style="border-style:solid;color:var(--ink)"><b>Fastest way:</b> connect your wallet and pay in one click. Your wallet asks you to confirm a plain $WIF transfer. The site never asks for approvals and never holds your funds.<div class="row" style="margin-top:10px"><button class="go" id="cw" type="button">Connect wallet</button></div><div id="ow" class="m" style="margin-top:8px"></div></div>');
$("cw").onclick=function(){oneClickRun(i)}}
async function oneClickRun(i){var o=$("ow");
try{o.textContent="Looking for your wallet…";var w=await MXW.connect();o.textContent="Sign the message in your wallet. It costs nothing and sends no transaction.";var s=await MXW.signIn(w);
if(s.pass){setPass(s.pass);proInit();return}
o.innerHTML="You will send <b>"+esc(i.price)+" $WIF</b> from <code>"+esc(w.account)+"</code> to the dead address <code>"+i.dead+"</code> (token <code>"+i.token+'</code>). This is a plain transfer and permanently removes those tokens.<div class="row" style="margin-top:8px"><button class="go" id="pb" type="button">Pay '+esc(i.price)+" $WIF</button></div>";
$("pb").onclick=async function(){$("pb").disabled=true;try{o.textContent="Confirm the transfer in your wallet…";var h=await MXW.burn(w,i);o.textContent="Sent. Waiting for the chain to confirm…";var d=await MXW.claim(h,s.sid,function(m){o.textContent=m});setPass(d.pass);proInit()}catch(e){o.textContent=e.message||"Cancelled."}}}
catch(e){o.textContent=e.message||"Could not connect."}}
async function walletRestore(){try{var w=await MXW.connect(),s=await MXW.signIn(w);if(s.pass){try{localStorage.setItem("mx_pass",s.pass)}catch(e){}location.reload()}else alert("No active pass found for that wallet. Unlock Pro in the explorer first.")}catch(e){alert(e.message||"Could not sign in.")}}
