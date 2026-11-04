(function(){
var P=location.pathname.replace(/\/$/,"")||"/";
var L=[["/","Home"],["/app","Explorer"],["/rooms","Rooms"],["/builders","For builders"],["/judges","For judges"]];
var h=document.getElementById("sx");
if(h){h.className="sx";h.innerHTML='<div class="sx-in"><a class="sx-brand" href="/"><img src="/mark.svg" alt="" width="30" height="30"><span>Multiplier Explorer</span></a><nav class="sx-nav" aria-label="Main">'+L.map(function(l){return'<a href="'+l[0]+'"'+(P===l[0]?' aria-current="page"':"")+">"+l[1]+"</a>"}).join("")+'</nav><a class="sx-cta" href="/app">Open explorer</a></div>'}
var f=document.getElementById("sxf");
if(f){f.className="sxf";f.innerHTML='<div class="sx-in"><div><b>Multiplier Explorer</b><p>A read-only explorer for Robinhood Chain stock-token multiplier updates. Independent project, not affiliated with Robinhood. Shares represented = token balance × multiplier; this is not a statement about market value.</p></div><div class="sxf-l"><a href="/">Home</a><a href="/app">Explorer</a><a href="/rooms">Rooms</a><a href="/builders">For builders</a><a href="/judges">For judges</a><a href="/judges#live">Status</a><a href="https://github.com/BenCoy09/multiplier" target="_blank" rel="noopener">GitHub</a></div></div>'}
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
