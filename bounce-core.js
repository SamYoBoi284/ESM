(function(){
"use strict";
var S=null,raf=0,last=0,running=false,drawing=false,line=null,drag=false,off={x:0,y:0},obs=null;
var KEY="esm.bounceCore.pc.v1";
var skins=[
 {n:"Obsidian Core",u:0,b:"#c9a7ff",g:"#8a5cf6"},
 {n:"Octane",u:1000,b:"#fff",g:"#ff5a5a"},
 {n:"Black Hole",u:5000,b:"#111",g:"#a56cff"},
 {n:"Plasma",u:10000,b:"#eff",g:"#54d8ff"},
 {n:"Void",u:20000,b:"#222",g:"#d15cff"},
 {n:"Neon",u:35000,b:"#eff",g:"#46ff9a"},
 {n:"Singularity",u:40000,b:"#15151c",g:"#ff4fd8"},
 {n:"Glitch",u:50000,b:"#fff",g:"#7bffea"},
 {n:"Overdrive",u:75000,b:"#ffe",g:"#ffb347"},
 {n:"Apex",u:100000,b:"#fff",g:"#fff"}
];
function $(x){return document.getElementById(x);}
function fresh(){return{score:0,lifetime:0,multiplier:1,balls:1,critChance:.1,lines:[],bs:[],skin:0,scale:1,color:"#8a5cf6"}}
function load(){try{var x=JSON.parse(localStorage.getItem(KEY)||"null");x=Object.assign(fresh(),x||{});x.lines=Array.isArray(x.lines)?x.lines.slice(-10):[];x.bs=Array.isArray(x.bs)?x.bs:[];x.balls=Math.max(1,Math.min(50,+x.balls||1));x.multiplier=Math.max(1,+x.multiplier||1);x.lifetime=Math.max(0,+x.lifetime||0);return x}catch(e){return fresh()}}
function save(){if(S)try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
function canvas(){return $("bounceCoreCanvas")}
function size(){var c=canvas();if(!c)return;var p=c.parentElement,r=p.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);c.width=Math.max(320,r.width*d);c.height=Math.max(240,r.height*d);c.style.width=r.width+"px";c.style.height=r.height+"px";c.getContext("2d").setTransform(d,0,0,d,0,0)}
function point(e){var r=canvas().getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function seed(){var c=canvas(),w=c?c.clientWidth:700,h=c?c.clientHeight:420;S.bs=[];for(var i=0;i<S.balls;i++)S.bs.push({x:w/2+(i%6-3)*20,y:h*.2+Math.floor(i/6)*20,vx:(i%2?1:-1)*(110+(i%9)*11),vy:100+(i%7)*13,r:11})}
function count(){var n=Math.max(1,Math.min(50,Math.floor(S.balls)));var c=canvas(),w=c?c.clientWidth:700,h=c?c.clientHeight:420;while(S.bs.length<n){var i=S.bs.length;S.bs.push({x:w/2+(i%6-3)*18,y:h*.2+Math.floor(i/6)*18,vx:(i%2?1:-1)*(110+(i%9)*11),vy:100+(i%7)*13,r:11})}S.bs.length=n}
function hit(){var crit=Math.random()<Math.min(.7,S.critChance);S.multiplier=crit?S.multiplier*2:S.multiplier+.01;var n=S.multiplier*(crit?2:1);S.score+=n;S.lifetime+=n;var ms=[1000,5000,10000,20000,35000,40000,50000,75000,100000],i=0;ms.forEach(function(m){if(S.lifetime>=m)i++});S.skin=Math.max(S.skin,Math.min(9,i));S.balls=Math.max(S.balls,Math.min(50,1+i))}
function seg(b,l){var sx=l.x2-l.x1,sy=l.y2-l.y1,q=sx*sx+sy*sy;if(q<1)return;var t=((b.x-l.x1)*sx+(b.y-l.y1)*sy)/q;t=Math.max(0,Math.min(1,t));var px=l.x1+t*sx,py=l.y1+t*sy,dx=b.x-px,dy=b.y-py,d=Math.hypot(dx,dy);if(d>b.r+3)return;var nx=d?dx/d:-sy/Math.sqrt(q),ny=d?dy/d:sx/Math.sqrt(q),v=b.vx*nx+b.vy*ny;if(v>=0)return;b.x+=nx*(b.r+4-d);b.y+=ny*(b.r+4-d);b.vx-=2*v*nx;b.vy-=2*v*ny;hit()}
function update(dt){if(!S)return;count();var c=canvas();if(!c)return;var w=c.clientWidth,h=c.clientHeight;S.bs.forEach(function(b){b.x+=b.vx*dt;b.y+=b.vy*dt;if(b.x-b.r<0){b.x=b.r;b.vx=Math.abs(b.vx);hit()}if(b.x+b.r>w){b.x=w-b.r;b.vx=-Math.abs(b.vx);hit()}if(b.y-b.r<0){b.y=b.r;b.vy=Math.abs(b.vy);hit()}if(b.y+b.r>h){b.y=h-b.r;b.vy=-Math.abs(b.vy);hit()}S.lines.forEach(function(l){seg(b,l)})})}
function render(){var c=canvas();if(!c||!S)return;var x=c.getContext("2d"),w=c.clientWidth,h=c.clientHeight,sk=skins[S.skin]||skins[0];x.clearRect(0,0,w,h);var g=x.createLinearGradient(0,0,w,h);g.addColorStop(0,"#07070c");g.addColorStop(1,"#12101c");x.fillStyle=g;x.fillRect(0,0,w,h);x.strokeStyle="rgba(180,130,255,.07)";x.lineWidth=1;for(var i=0;i<w;i+=40){x.beginPath();x.moveTo(i,0);x.lineTo(i,h);x.stroke()}for(i=0;i<h;i+=40){x.beginPath();x.moveTo(0,i);x.lineTo(w,i);x.stroke()}x.strokeStyle=S.color;x.lineWidth=3;x.shadowColor=S.color;x.shadowBlur=9;S.lines.forEach(function(l){x.beginPath();x.moveTo(l.x1,l.y1);x.lineTo(l.x2,l.y2);x.stroke()});if(line){x.setLineDash([8,6]);x.beginPath();x.moveTo(line.x1,line.y1);x.lineTo(line.x2,line.y2);x.stroke();x.setLineDash([])}x.shadowBlur=0;S.bs.forEach(function(b){var z=x.createRadialGradient(b.x-4,b.y-5,1,b.x,b.y,b.r*1.8);z.addColorStop(0,"#fff");z.addColorStop(.35,sk.b);z.addColorStop(1,sk.g);x.fillStyle=z;x.shadowColor=sk.g;x.shadowBlur=18;x.beginPath();x.arc(b.x,b.y,b.r,0,Math.PI*2);x.fill();x.shadowBlur=0});hud()}
function hud(){var m={bounceCoreScore:Math.floor(S.score).toLocaleString(),bounceCoreMultiplier:S.multiplier.toFixed(2)+"×",bounceCoreBalls:S.balls+"/50",bounceCoreCrit:Math.round(Math.min(.7,S.critChance)*100)+"%",bounceCoreLines:S.lines.length+"/10",bounceCoreSkin:skins[S.skin].n,bounceCorePrestige:Math.floor(S.lifetime).toLocaleString()};Object.keys(m).forEach(function(k){var e=$(k);if(e)e.textContent=m[k]});var c=$("bounceCoreLineColor");if(c)c.value=S.color;var q=$("bounceCoreScale");if(q)q.value=S.scale||1;var w=$("bounceCoreWindow");if(w)w.style.setProperty("--bounce-ui-scale",S.scale||1)}
function frame(t){if(!running)return;var dt=Math.min(.033,Math.max(0,(t-last)/1000||0));last=t;update(dt);render();raf=requestAnimationFrame(frame)}
function start(){if(running)return;running=true;last=performance.now();raf=requestAnimationFrame(frame)}
function stop(){running=false;if(raf)cancelAnimationFrame(raf);raf=0}
function open(){var w=$("bounceCoreWindow");if(!w)return;if(!S)S=load();w.classList.remove("hidden");w.setAttribute("aria-hidden","false");window.__esmFloatingZ=(window.__esmFloatingZ||10050)+1;w.style.zIndex=window.__esmFloatingZ;size();if(!S.bs.length)seed();count();render();start()}
function hide(){var w=$("bounceCoreWindow");if(w){w.classList.add("hidden");w.setAttribute("aria-hidden","true")}save()}
function close(){save();stop();if(obs){obs.disconnect();obs=null}var w=$("bounceCoreWindow");if(w){w.classList.add("hidden");w.setAttribute("aria-hidden","true")}S=null;line=null;drawing=false}
function bind(){var w=$("bounceCoreWindow"),h=$("bounceCoreHeader"),c=canvas();if(!w||!c)return;
 h.addEventListener("pointerdown",function(e){if(e.target.closest("button"))return;drag=true;var r=w.getBoundingClientRect();off.x=e.clientX-r.left;off.y=e.clientY-r.top});
 h.addEventListener("pointermove",function(e){if(!drag)return;w.style.left=Math.max(8,e.clientX-off.x)+"px";w.style.top=Math.max(8,e.clientY-off.y)+"px";w.style.right="auto";w.style.bottom="auto"});
 ["pointerup","pointercancel"].forEach(function(k){h.addEventListener(k,function(){drag=false})});
 $("bounceCoreHideBtn").addEventListener("click",hide);$("bounceCoreCloseBtn").addEventListener("click",close);
 $("bounceCoreOptionsBtn").addEventListener("click",function(){$("bounceCoreOptions").classList.toggle("hidden")});
 $("bounceCoreResetBtn").addEventListener("click",function(){if(confirm("Reset Bounce//Core PC progress?")){S=fresh();save();seed();render()}});
 $("bounceCoreLineColor").addEventListener("input",function(){S.color=this.value});
 $("bounceCoreScale").addEventListener("input",function(){S.scale=+this.value;hud()});
 c.addEventListener("pointerdown",function(e){if(!running)return;drawing=true;var p=point(e);line={x1:p.x,y1:p.y,x2:p.x,y2:p.y};c.setPointerCapture&&c.setPointerCapture(e.pointerId)});
 c.addEventListener("pointermove",function(e){if(!drawing)return;var p=point(e);line.x2=p.x;line.y2=p.y;render()});
 c.addEventListener("pointerup",function(){if(!drawing)return;drawing=false;if(line&&Math.hypot(line.x2-line.x1,line.y2-line.y1)>12){S.lines.push(line);if(S.lines.length>10)S.lines.shift()}line=null;save();render()});
 c.addEventListener("pointercancel",function(){drawing=false;line=null;render()});
 if(window.ResizeObserver){obs=new ResizeObserver(size);obs.observe(c.parentElement)}
}
window.openBounceCore=open;window.hideBounceCore=hide;window.closeBounceCore=close;
window.addEventListener("beforeunload",save);
window.addEventListener("DOMContentLoaded",function(){window.__esmFloatingZ=window.__esmFloatingZ||10050;bind()});
})();