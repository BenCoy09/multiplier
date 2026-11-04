(function(){
var P=location.pathname.replace(/\/$/,"")||"/";
var L=[["/","Home"],["/app","Explorer"],["/rooms","Rooms"],["/judges","For judges"]];
var h=document.getElementById("sx");
if(h){h.className="sx";h.innerHTML='<div class="sx-in"><a class="sx-brand" href="/"><img src="/mark.svg" alt="" width="30" height="30"><span>Multiplier Explorer</span></a><nav class="sx-nav" aria-label="Main">'+L.map(function(l){return'<a href="'+l[0]+'"'+(P===l[0]?' aria-current="page"':"")+">"+l[1]+"</a>"}).join("")+'</nav><a class="sx-cta" href="/app">Open explorer</a></div>'}
var f=document.getElementById("sxf");
if(f){f.className="sxf";f.innerHTML='<div class="sx-in"><div><b>Multiplier Explorer</b><p>A read-only explorer for Robinhood Chain stock-token multiplier updates. Independent project, not affiliated with Robinhood. Shares represented = token balance × multiplier; this is not a statement about market value.</p></div><div class="sxf-l"><a href="/">Home</a><a href="/app">Explorer</a><a href="/rooms">Rooms</a><a href="/judges">For judges</a><a href="/judges#live">Status</a><a href="https://github.com/BenCoy09/multiplier" target="_blank" rel="noopener">GitHub</a></div></div>'}
})();
