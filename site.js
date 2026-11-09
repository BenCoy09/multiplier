(function(){
var P=location.pathname.replace(/\/$/,"")||"/";
var L=[["/","Home"],["/app","Explorer"],["/rooms","Rooms"],["/builders","For builders"],["/judges","For judges"],["/votes","Vote"]];
var h=document.getElementById("sx");
if(h){h.className="sx";h.innerHTML='<div class="sx-in"><a class="sx-brand" href="/"><img src="/mark.svg" alt="" width="30" height="30"><span>Multiplier Explorer</span></a><nav class="sx-nav" aria-label="Main">'+L.map(function(l){return'<a href="'+l[0]+'"'+(P===l[0]?' aria-current="page"':"")+">"+l[1]+"</a>"}).join("")+'</nav><a class="sx-cta" href="/app">Open explorer</a></div>'}
var f=document.getElementById("sxf");
if(f){f.className="sxf";f.innerHTML='<div class="sx-in"><div><b>Multiplier Explorer</b><p>A read-only explorer for Robinhood Chain stock-token multiplier updates. Independent project, not affiliated with Robinhood. Shares represented = token balance × multiplier; this is not a statement about market value.</p></div><div class="sxf-l"><a href="/">Home</a><a href="/app">Explorer</a><a href="/rooms">Rooms</a><a href="/builders">For builders</a><a href="/judges">For judges</a><a href="/votes">Vote</a><a href="/votes">Vote</a><a href="/judges#live">Status</a><a href="https://github.com/BenCoy09/multiplier" target="_blank" rel="noopener">GitHub</a></div></div>'}
})();

/* background: rings and fine sand drifting in slow water. Calm, paused when hidden, static for reduced motion.
   Pages can make the water ripple (for example when a room message arrives): window.mxPulse() or window.dispatchEvent(new CustomEvent("mx:pulse")). */
(function(){
var reduce=!!(window.matchMedia&&matchMedia("(prefers-reduced-motion:reduce)").matches);
var P=location.pathname.replace(/\/$/,"")||"/",dens=P==="/"?1:0.5,LIFE=1800;
var c=document.createElement("canvas");c.setAttribute("aria-hidden","true");c.style.cssText="position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none";document.body.appendChild(c);
var x=c.getContext("2d");if(!x)return;
var W=0,H=0,ps=[],rp=[],raf=0,t0=0,mx=-999,my=-999,slow=0,col={ac:"#4fd1b8",ink:"#e8eff5",mu:"#8ea1b2"};
function colors(){try{var s=getComputedStyle(document.documentElement);col.ac=(s.getPropertyValue("--ac")||"").trim()||col.ac;col.ink=(s.getPropertyValue("--ink")||"").trim()||col.ink;col.mu=(s.getPropertyValue("--mu")||"").trim()||col.mu}catch(e){}}
function make(){ps=[];var n=Math.round(Math.min(90,Math.max(26,W*H/24000))*dens*(W<700?0.6:1));
for(var i=0;i<n;i++){var g=Math.random()<0.2,z=Math.random();ps.push({x:Math.random()*W,y:Math.random()*H,z:z,g:g,r:g?5+z*7:0.8+z*1.8,a:g?0.16+z*0.18:0.12+z*0.22,rot:Math.random()*6.28,sp:0.4+z*0.9})}}
function field(px,py,t){return(Math.sin(px*0.0021+t*0.00011)+Math.cos(py*0.0017-t*0.00009)+Math.sin((px+py)*0.0012+t*0.00005))*1.05}
function pulse(o){if(reduce||document.hidden)return;o=o||{};
var px=typeof o.x==="number"?o.x:W*(0.3+Math.random()*0.4),py=typeof o.y==="number"?o.y:H*(0.3+Math.random()*0.4),s=Math.min(1.5,Math.max(0.5,+o.s||1));
rp.push({x:px,y:py,t:performance.now(),s:s});if(rp.length>4)rp.shift()}
window.mxPulse=pulse;window.addEventListener("mx:pulse",function(e){pulse(e&&e.detail)});
function step(dt,t){for(var i=0;i<ps.length;i++){var p=ps[i],a=field(p.x,p.y,t),vx=Math.cos(a)*0.22*p.sp,vy=Math.sin(a)*0.12*p.sp+0.06*p.sp,dx=p.x-mx,dy=p.y-my,d2=dx*dx+dy*dy;
if(d2<14400){var d=Math.sqrt(d2)||1,f=(1-d/120)*1.4;vx+=dx/d*f;vy+=dy/d*f}
for(var k=0;k<rp.length;k++){var q=rp[k],ag=t-q.t;if(ag<0||ag>LIFE)continue;var ex=p.x-q.x,ey=p.y-q.y,ed=Math.sqrt(ex*ex+ey*ey)||1,gap=Math.abs(ed-(30+ag/LIFE*300*q.s));
if(gap<40){var ef=(1-gap/40)*(1-ag/LIFE)*1.8*q.s;vx+=ex/ed*ef;vy+=ey/ed*ef}}
p.x+=vx*dt*0.06;p.y+=vy*dt*0.06;p.rot+=0.0006*dt*p.sp;
if(p.y>H+20){p.y=-20;p.x=Math.random()*W}if(p.y<-30)p.y=H+20;if(p.x<-20)p.x=W+20;if(p.x>W+20)p.x=-20}}
function draw(now){x.clearRect(0,0,W,H);x.lineCap="round";
for(var i=0;i<ps.length;i++){var p=ps[i];x.globalAlpha=p.a;
if(!p.g){x.fillStyle=i%3?col.mu:col.ac;x.beginPath();x.arc(p.x,p.y,p.r,0,6.2832);x.fill()}
else{x.strokeStyle=col.ink;x.lineWidth=1+p.z*0.9;x.beginPath();x.arc(p.x,p.y,p.r,0,6.2832);x.stroke();x.strokeStyle=col.ac;x.lineWidth=1.2+p.z;x.beginPath();x.arc(p.x,p.y,p.r*1.55,p.rot,p.rot+0.75);x.stroke()}}
if(now){x.strokeStyle=col.ac;for(var k=0;k<rp.length;k++){var q=rp[k],ag=now-q.t;if(ag<0||ag>LIFE)continue;var u=ag/LIFE,r=30+u*300*q.s;
x.lineWidth=0.6+2.2*(1-u);x.globalAlpha=0.38*(1-u)*(1-u);x.beginPath();x.arc(q.x,q.y,r,0,6.2832);x.stroke();
if(u>0.18){x.lineWidth=0.6+1.4*(1-u);x.globalAlpha=0.2*(1-u)*(1-u);x.beginPath();x.arc(q.x,q.y,r*0.62,0,6.2832);x.stroke()}}}
x.globalAlpha=1}
function loop(now){raf=0;if(document.hidden)return;var dt=Math.min(50,now-t0);t0=now;
if(dt>34){if(++slow>40&&ps.length>20){ps.length=Math.floor(ps.length/2);slow=0}}else if(slow>0)slow--;
while(rp.length&&now-rp[0].t>LIFE)rp.shift();
step(dt,now);draw(now);raf=requestAnimationFrame(loop)}
function start(){colors();if(reduce){draw(0);return}if(!raf){t0=performance.now();raf=requestAnimationFrame(loop)}}
function size(){var dpr=Math.min(window.devicePixelRatio||1,1.5);W=window.innerWidth;H=window.innerHeight;c.width=Math.round(W*dpr);c.height=Math.round(H*dpr);x.setTransform(dpr,0,0,dpr,0,0);make();start()}
/* ignore the small height changes a phone makes when its address bar slides in or out, so the sand does not reshuffle */
var rt=0,lw=window.innerWidth,lh=window.innerHeight;
window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(function(){var w=window.innerWidth,hh=window.innerHeight;if(w===lw&&Math.abs(hh-lh)<160)return;lw=w;lh=hh;size()},150)});
window.addEventListener("pointermove",function(e){mx=e.clientX;my=e.clientY},{passive:true});
document.addEventListener("pointerleave",function(){mx=my=-999});
document.addEventListener("visibilitychange",start);
try{matchMedia("(prefers-color-scheme:dark)").addEventListener("change",function(){colors();if(reduce)draw(0)})}catch(e){}
size();
})();

/* Intro: the logo is doodled line by line, then filled. Shown once per visit on the home page, skippable, and shortened for reduced motion.
   Add ?pre=1 to the home URL to replay it (for example when recording a demo); ?nopre skips it. Pure CSS + SVG, no libraries. */
(function(){
var P=location.pathname.replace(/\/$/,"")||"/";
if(P!=="/"||location.hash||/[?&]nopre\b/.test(location.search))return;
var force=/[?&]pre=1\b/.test(location.search),seen=false;
try{seen=sessionStorage.getItem("mx_pre")==="1";sessionStorage.setItem("mx_pre","1")}catch(e){}
if(seen&&!force)return;
var reduce=!!(window.matchMedia&&matchMedia("(prefers-reduced-motion:reduce)").matches);
var st=document.createElement("style");st.textContent="#mx-pre{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#000b39;color:#e8eff5;cursor:pointer;overflow:hidden;opacity:1;transition:opacity .55s ease,transform .55s ease;-webkit-tap-highlight-color:transparent}\n#mx-pre::before{content:\"\";position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,rgba(79,209,184,.13),transparent 56%),radial-gradient(rgba(255,255,255,.14) 1px,transparent 1.5px) 0 0/26px 26px;animation:mxbg .7s ease both}\n#mx-pre.out{opacity:0;transform:scale(1.03);pointer-events:none}\n#mx-pre>*{position:relative}\n#mx-pre .mx-mark{width:min(168px,40vw);height:auto;overflow:visible}\n#mx-pre .mx-word{width:min(320px,80vw);height:auto;overflow:visible;margin-top:-6px}\n#mx-pre .mx-dr{fill:none;stroke-dasharray:1;stroke-dashoffset:1;opacity:0;animation:mxd var(--t,700ms) cubic-bezier(.55,.1,.25,1) var(--d,0ms) both}\n#mx-pre .mx-o1,#mx-pre .mx-o2{stroke:#4fd1b8;stroke-width:2.2;stroke-linejoin:round}\n#mx-pre .mx-o3{stroke:#e8eff5;stroke-width:2.2}\n#mx-pre .mx-ln{stroke:#e8eff5;stroke-width:6;stroke-linecap:round;stroke-linejoin:round}\n#mx-pre .mx-ul{stroke:#ffb8d6;stroke-width:4;stroke-linecap:round}\n#mx-pre .mx-fl{fill-opacity:0;animation:mxf .5s ease var(--f,0ms) both}\n#mx-pre .mx-dotfill{transform-box:fill-box;transform-origin:center;animation:mxf .5s ease var(--f) both,mxpop .55s cubic-bezier(.3,1.6,.5,1) var(--f) both}\n#mx-pre .mx-pop{transform-box:fill-box;transform-origin:center;transform:scale(0);animation:mxpop .45s cubic-bezier(.3,1.6,.5,1) var(--d,0ms) both}\n#mx-pre .mx-tg{margin:6px 0 0;font:500 12px/1.3 \"Space Grotesk\",\"Poppins\",system-ui,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#9fb0c8;opacity:0;animation:mxin .6s ease 2000ms both}\n#mx-pre .mx-tg i{font-style:normal;animation:mxbl 1.2s ease-in-out infinite both}\n#mx-pre .mx-tg i:nth-child(2){animation-delay:.2s}#mx-pre .mx-tg i:nth-child(3){animation-delay:.4s}\n#mx-pre .mx-sk{position:absolute;left:0;right:0;bottom:22px;margin:0;text-align:center;font:500 11px/1 \"Space Grotesk\",\"Poppins\",system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#6f819c;opacity:0;animation:mxin .6s ease 1200ms both}\n@keyframes mxd{0%{opacity:0;stroke-dashoffset:1}1%{opacity:1;stroke-dashoffset:1}100%{opacity:1;stroke-dashoffset:0}}\n@keyframes mxf{from{fill-opacity:0}to{fill-opacity:1}}\n@keyframes mxpop{from{transform:scale(0)}to{transform:scale(1)}}\n@keyframes mxin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}\n@keyframes mxbl{0%,100%{opacity:.25}50%{opacity:1}}\n@keyframes mxbg{from{opacity:0}to{opacity:1}}\n@media (prefers-reduced-motion:reduce){#mx-pre *,#mx-pre::before{animation:none!important;transition:none!important}#mx-pre .mx-dr{stroke-dashoffset:0;opacity:1}#mx-pre .mx-fl{fill-opacity:1}#mx-pre .mx-pop{transform:none}#mx-pre .mx-tg,#mx-pre .mx-sk{opacity:1}#mx-pre{transition:opacity .3s ease}}";document.head.appendChild(st);
var el=document.createElement("div");el.id="mx-pre";el.setAttribute("role","status");el.setAttribute("aria-label","Loading Multiplier Explorer");
el.innerHTML="<svg class=\"mx-mark\" viewBox=\"0 0 240 240\" aria-hidden=\"true\">\n<defs><filter id=\"mx-rough\" x=\"-6%\" y=\"-6%\" width=\"112%\" height=\"112%\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.03\" numOctaves=\"2\" seed=\"4\" result=\"n\"/><feDisplacementMap in=\"SourceGraphic\" in2=\"n\" scale=\"2.4\" xChannelSelector=\"R\" yChannelSelector=\"G\"/></filter><filter id=\"mx-rough2\" x=\"-4%\" y=\"-6%\" width=\"108%\" height=\"112%\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.012\" numOctaves=\"1\" seed=\"7\" result=\"n\"/><feDisplacementMap in=\"SourceGraphic\" in2=\"n\" scale=\"1.6\" xChannelSelector=\"R\" yChannelSelector=\"G\"/></filter></defs>\n<g class=\"mx-fills\">\n<path class=\"mx-fl\" d=\"M128.40 50.15 A69.85 69.85 0 0 1 198.25 120.00 A69.85 69.85 0 0 1 128.40 189.85 L128.40 172.95 A52.95 52.95 0 0 0 181.35 120.00 A52.95 52.95 0 0 0 128.40 67.05 Z\" fill=\"#2f8f80\" style=\"--f:1050ms\"/>\n<path class=\"mx-fl\" d=\"M128.40 206.75 A86.75 86.75 0 0 1 41.65 120.00 A86.75 86.75 0 0 1 128.40 33.25 L128.40 50.15 A69.85 69.85 0 0 0 58.55 120.00 A69.85 69.85 0 0 0 128.40 189.85 Z\" fill=\"#4fd1b8\" style=\"--f:1150ms\"/>\n<circle class=\"mx-fl mx-dotfill\" cx=\"128.4\" cy=\"120.0\" r=\"27.7\" fill=\"#e8eff5\" style=\"--f:1300ms\"/>\n</g>\n<g class=\"mx-lines\" filter=\"url(#mx-rough)\">\n<path class=\"mx-dr mx-o1\" pathLength=\"1\" d=\"M128.40 50.15 A69.85 69.85 0 0 1 198.25 120.00 A69.85 69.85 0 0 1 128.40 189.85 L128.40 172.95 A52.95 52.95 0 0 0 181.35 120.00 A52.95 52.95 0 0 0 128.40 67.05 Z\" style=\"--d:200ms;--t:700ms\"/>\n<path class=\"mx-dr mx-o2\" pathLength=\"1\" d=\"M128.40 206.75 A86.75 86.75 0 0 1 41.65 120.00 A86.75 86.75 0 0 1 128.40 33.25 L128.40 50.15 A69.85 69.85 0 0 0 58.55 120.00 A69.85 69.85 0 0 0 128.40 189.85 Z\" style=\"--d:450ms;--t:800ms\"/>\n<circle class=\"mx-dr mx-o3\" pathLength=\"1\" cx=\"128.4\" cy=\"120.0\" r=\"27.7\" style=\"--d:800ms;--t:500ms\"/>\n</g></svg><svg class=\"mx-word\" viewBox=\"-10 0 352 130\" aria-hidden=\"true\"><g filter=\"url(#mx-rough2)\"><path class=\"mx-dr mx-ln\" pathLength=\"1\" transform=\"translate(0 0)\" d=\"M0 72 V12 L25 50 L50 12 V72\" style=\"--d:1400ms;--t:380ms\"/><path class=\"mx-dr mx-ln\" pathLength=\"1\" transform=\"translate(66 0)\" d=\"M0 38 V56 C0 67 7 72 15 72 C23 72 30 67 30 56 M30 38 V72\" style=\"--d:1470ms;--t:380ms\"/><path class=\"mx-dr mx-ln\" pathLength=\"1\" transform=\"translate(112 0)\" d=\"M0 10 V72\" style=\"--d:1540ms;--t:380ms\"/><path class=\"mx-dr mx-ln\" pathLength=\"1\" transform=\"translate(128 0)\" d=\"M8 20 V58 C8 68 12 72 22 72 M0 38 H22\" style=\"--d:1610ms;--t:380ms\"/><path class=\"mx-dr mx-ln\" pathLength=\"1\" transform=\"translate(166 0)\" d=\"M0 38 V72\" style=\"--d:1680ms;--t:380ms\"/><path class=\"mx-dr mx-ln\" pathLength=\"1\" transform=\"translate(182 0)\" d=\"M0 38 V104 M0 55 C0 44 8 38 18 38 C28 38 34 44 34 55 C34 66 28 72 18 72 C8 72 0 66 0 55\" style=\"--d:1750ms;--t:380ms\"/><path class=\"mx-dr mx-ln\" pathLength=\"1\" transform=\"translate(232 0)\" d=\"M0 10 V72\" style=\"--d:1820ms;--t:380ms\"/><path class=\"mx-dr mx-ln\" pathLength=\"1\" transform=\"translate(248 0)\" d=\"M0 38 V72\" style=\"--d:1890ms;--t:380ms\"/><path class=\"mx-dr mx-ln\" pathLength=\"1\" transform=\"translate(264 0)\" d=\"M0 55 H34 C34 44 27 38 17 38 C7 38 0 45 0 55 C0 65 7 72 17 72 C25 72 31 69 34 64\" style=\"--d:1960ms;--t:380ms\"/><path class=\"mx-dr mx-ln\" pathLength=\"1\" transform=\"translate(314 0)\" d=\"M0 38 V72 M0 52 C0 42 7 38 18 38\" style=\"--d:2030ms;--t:380ms\"/><circle class=\"mx-pop\" cx=\"166\" cy=\"18\" r=\"4.8\" fill=\"#ffb8d6\" style=\"--d:1940ms\"/><circle class=\"mx-pop\" cx=\"248\" cy=\"18\" r=\"4.8\" fill=\"#ffb8d6\" style=\"--d:2150ms\"/><path class=\"mx-dr mx-ul\" pathLength=\"1\" d=\"M-2 120 C30 113 52 126 92 120 S150 113 190 120 S252 126 292 119 S322 114 334 118\" style=\"--d:2350ms;--t:480ms\"/></g></svg><p class=\"mx-tg\">Reading the chain<i>.</i><i>.</i><i>.</i></p><p class=\"mx-sk\">Tap anywhere to skip</p>";document.body.appendChild(el);
var done=false;
function close(){if(done)return;done=true;el.classList.add("out");
setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);if(st.parentNode)st.parentNode.removeChild(st)},650);
setTimeout(function(){if(window.mxPulse)window.mxPulse({x:window.innerWidth/2,y:window.innerHeight*0.4,s:1.4})},300)}
el.addEventListener("click",close);document.addEventListener("keydown",close,{once:true});
setTimeout(close,reduce?900:3400);
})();
