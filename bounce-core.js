(function(){
"use strict";

var S=null,raf=0,running=false,drawing=false,preview=null,drag=false,off={x:0,y:0},obs=null,last=0,bound=false;
var KEY="esm.bounceCore.pc.v2.androidParity";
var LINE_WIDTH=12,RESTITUTION=.78,PHYSICS_STEPS=5;

var SKIN_MILESTONES=[1000,5000,10000,20000,35000,40000,50000,75000,100000];
var SKIN_NAMES=["Heavy Ball","Glitch Ball","Among Us","Octane","Ice Cube","Rock","Bomb","ESM Core","Black Hole"];

function $(id){return document.getElementById(id)}
function fresh(){return{score:0,runBest:0,multiplier:1,maxBalls:1,maxLines:1,crit:0,shards:0,prestigeLevel:0,uiScale:1.25,ballColor:"#ffa63a",selectedSkin:0,lines:[],balls:[],popups:[],optionsOpen:false,buyPanelOffset:0}}
function load(){
 try{
  var x=JSON.parse(localStorage.getItem(KEY)||"null"); x=Object.assign(fresh(),x||{});
  x.maxBalls=Math.max(1,Math.min(50,+x.maxBalls||1));
  x.maxLines=Math.max(1,Math.min(10,+x.maxLines||1));
  x.multiplier=Math.max(1,+x.multiplier||1);
  x.crit=Math.max(0,Math.min(70,+x.crit||0));
  x.prestigeLevel=Math.max(0,+x.prestigeLevel||0);
  x.shards=Math.max(0,+x.shards||0);
  x.uiScale=[.95,1.25,1.45].reduce(function(a,v){return Math.abs(v-x.uiScale)<Math.abs(a-x.uiScale)?v:a},1.25);
  x.lines=Array.isArray(x.lines)?x.lines.slice(-10):[];
  x.balls=Array.isArray(x.balls)?x.balls:[]; x.popups=[]; x.optionsOpen=false; x.buyPanelOffset=0; 
  if(x.selectedSkin>0&&!isSkinUnlocked(x.selectedSkin-1,x))x.selectedSkin=0;
  return x;
 }catch(e){return fresh()}
}
function save(){if(S)try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
function exportSaveFile(){
 var d={score:S.score,runBest:S.runBest,multiplier:S.multiplier,maxBalls:S.maxBalls,maxLines:S.maxLines,crit:S.crit,shards:S.shards,prestigeLevel:S.prestigeLevel,uiScale:S.uiScale,ballColor:S.ballColor,selectedSkin:S.selectedSkin};
 var blob=new Blob([JSON.stringify({format:"bounce-core-save",version:1,data:d},null,2)],{type:"application/json"});
 var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="bounce-core-save.json";document.body.appendChild(a);a.click();a.remove();
 setTimeout(function(){URL.revokeObjectURL(a.href)},1000);
}
function importSaveFile(){
 var input=document.createElement("input");input.type="file";input.accept=".json,application/json";
 input.onchange=function(){
  var file=input.files&&input.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(){
   try{
    var root=JSON.parse(reader.result);
    if(root.format!=="bounce-core-save"||root.version!==1||!root.data)throw new Error("format");
    var d=root.data;
    S.score=Math.max(0,Number(d.score)||0);S.runBest=Math.max(0,Number(d.runBest)||0);
    S.multiplier=Math.max(1,Math.min(1000,Math.floor(Number(d.multiplier)||1)));
    S.maxBalls=Math.max(1,Math.min(50,Math.floor(Number(d.maxBalls)||1)));
    S.maxLines=Math.max(1,Math.min(10,Math.floor(Number(d.maxLines)||1)));
    S.crit=Math.max(0,Math.min(70,Math.floor(Number(d.crit)||0)));
    S.shards=Math.max(0,Number(d.shards)||0);S.prestigeLevel=Math.max(0,Number(d.prestigeLevel)||0);
    S.uiScale=[.95,1.25,1.45].reduce(function(a,v){return Math.abs(v-(Number(d.uiScale)||1.25))<Math.abs(a-(Number(d.uiScale)||1.25))?v:a},1.25);
    if(typeof d.ballColor==="string")S.ballColor=d.ballColor;
    else if(typeof d.ballColor==="number"){var bc=d.ballColor>>>0;S.ballColor="#"+((bc>>16)&255).toString(16).padStart(2,"0")+((bc>>8)&255).toString(16).padStart(2,"0")+(bc&255).toString(16).padStart(2,"0");}
    else S.ballColor="#ffa63a";
    S.selectedSkin=Math.max(0,Math.floor(Number(d.selectedSkin)||0));
    if(S.selectedSkin>0&&!isSkinUnlocked(S.selectedSkin-1))S.selectedSkin=0;
    S.lines=[];S.balls=[];S.popups=[];S.buyPanelOffset=0;spawnBall(0);save();size();render();
   }catch(e){window.alert("That file is not a valid Bounce//Core save.");}
  };
  reader.readAsText(file);
 };
 input.click();
}
function canvas(){return $("bounceCoreCanvas")}
function contentHeight(){var c=canvas();return c?c.clientHeight:700}
function u(v){return v*(S?S.uiScale:1.25)}
function size(){
 var c=canvas();if(!c)return;
 var stage=c.parentElement;if(!stage)return;
 var r=stage.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);
 var w=Math.max(360,Math.floor(r.width)),h=Math.max(420,Math.floor(r.height));
 c.style.width=w+"px";c.style.height=h+"px";
 c.width=Math.floor(w*d);c.height=Math.floor(h*d);
 var x=c.getContext("2d");if(x)x.setTransform(d,0,0,d,0,0);
}
function spawnBall(seed){
 var c=canvas(),w=c?c.clientWidth:900;
 S.balls.push({x:w*.5+Math.sin(seed)*60,y:35,vx:(Math.random()-.5)*180,vy:40,r:18,bounces:0});
}
function ensureBalls(){
 while(S.balls.length<S.maxBalls)spawnBall(S.balls.length*.17);
 if(S.balls.length>S.maxBalls)S.balls.length=S.maxBalls;
}
function prestigeBonus(){return 1+S.prestigeLevel*.01}
function costMultiplier(){return Math.max(8,12*Math.pow(1.012,S.multiplier-1))}
function costBalls(){return 250*Math.pow(1.42,S.maxBalls-1)}
function costLines(){return 500*Math.pow(1.85,S.maxLines-1)}
function costCrit(){return 900*Math.pow(1.55,S.crit/5)}
function prestigeGain(){
 var base=Math.sqrt(Math.max(0,S.score)/1000);
 var bonus=(S.multiplier-1)/25+(S.maxBalls-1)*2+(S.maxLines-1)*4+S.crit/5;
 return Math.max(1,Math.floor(base+bonus));
}
function isSkinUnlocked(i,state){state=state||S;return i>=0&&i<SKIN_MILESTONES.length&&state.prestigeLevel>=SKIN_MILESTONES[i]}
function unlockedSkinCount(){var n=0;for(var i=0;i<SKIN_MILESTONES.length;i++)if(isSkinUnlocked(i))n++;return n}
function fmt(n){
 if(n<1000)return Math.round(n)===n?String(Math.floor(n)):n.toFixed(1);
 var u=["K","M","B","T","Qa","Qi","Sx","Sp","Oc","No"],i=-1;
 while(n>=1000&&i<u.length-1){n/=1000;i++}
 return (n>=100?n.toFixed(0):n>=10?n.toFixed(1):n.toFixed(2))+u[i]
}
function ballColor(){return S.ballColor||"#ffa63a"}
function rgb(hex){
 var n=parseInt(String(hex).replace("#",""),16);return[(n>>16)&255,(n>>8)&255,n&255]
}
function lighten(hex,a){var q=rgb(hex);return"rgb("+Math.round(q[0]+(255-q[0])*a)+","+Math.round(q[1]+(255-q[1])*a)+","+Math.round(q[2]+(255-q[2])*a)+")"}
function darken(hex,a){var q=rgb(hex);return"rgb("+Math.round(q[0]*(1-a))+","+Math.round(q[1]*(1-a))+","+Math.round(q[2]*(1-a))+")"}

function text(x,s,px,py,size,color,align,bold){
 x.fillStyle=color;x.font=(bold?"700 ":"400 ")+size+"px Arial";x.textAlign=align;x.textBaseline="alphabetic";x.fillText(s,px,py)
}
function round(x,l,t,r,b,rad,color){x.fillStyle=color;x.beginPath();x.roundRect(l,t,r-l,b-t,rad);x.fill()}
function strokeRound(x,l,t,r,b,rad,color,w){x.strokeStyle=color;x.lineWidth=w;x.beginPath();x.roundRect(l,t,r-l,b-t,rad);x.stroke()}

function arenaTop(){return u(118)}
function arenaBottom(){return contentHeight()-u(330)}

function drawHeader(x){
 var w=canvas().clientWidth;
 round(x,u(10),u(7),w-u(10),u(112),u(15),"#050e1b");
 strokeRound(x,u(10),u(7),w-u(10),u(112),u(15),"#69e6ff",u(2));
 text(x,"//",u(28),u(54),u(28),"#69e6ff","left",true);
 text(x,"BOUNCE//",u(76),u(40),u(25),"#fff","left",true);
 text(x,"CORE",u(217),u(40),u(25),"#69e6ff","left",true);
 text(x,"SCORE",u(28),u(69),u(11),"#69e6ff","left",true);
 text(x,fmt(S.score),u(102),u(91),u(36),"#fff","left",true);
 x.strokeStyle="#69e6ff";x.lineWidth=u(1);x.beginPath();x.moveTo(u(330),u(54));x.lineTo(u(330),u(94));x.stroke();
 text(x,"▲",u(365),u(80),u(22),"#fff","center",true);
 text(x,"▶",u(425),u(80),u(22),"#fff","center",true);
 text(x,"▶",u(470),u(80),u(22),"#fff","center",true);
 text(x,"•",u(515),u(80),u(18),"#fff","center",true);
 var ow=u(145),ox=w-ow-u(25);
 round(x,ox,u(27),ox+ow,u(83),u(12),"#061827");
 strokeRound(x,ox,u(27),ox+ow,u(83),u(12),"#69e6ff",u(2));
 text(x,"⚙",ox+u(28),u(63),u(25),"#69e6ff","center",true);
 text(x,"OPTIONS",ox+u(91),u(61),u(15),"#69e6ff","center",true);
}
function drawArena(x){
 var l=u(10),r=canvas().clientWidth-u(10),t=arenaTop(),b=arenaBottom();
 round(x,l,t,r,b,u(15),"#0a0d17");
 x.strokeStyle="#373f58";x.lineWidth=u(2);x.beginPath();x.moveTo(l+u(2),t+u(8));x.lineTo(l+u(2),b-u(8));x.moveTo(r-u(2),t+u(8));x.lineTo(r-u(2),b-u(8));x.stroke();
 x.strokeStyle="rgba(105,230,255,.11)";x.lineWidth=1;
 for(var y=t+u(45);y<b;y+=u(45)){x.beginPath();x.moveTo(l+u(3),y);x.lineTo(r-u(3),y);x.stroke()}
 for(var xx=l+u(45);xx<r;xx+=u(45)){x.beginPath();x.moveTo(xx,t+u(3));x.lineTo(xx,b-u(3));x.stroke()}
 text(x,"DRAW A LINE • EVERY BOUNCE EARNS POINTS",canvas().clientWidth/2,t+u(21),u(11),"#73809b","center",true);
 text(x,"Bottom = respawn",canvas().clientWidth-u(18),b-u(11),u(9),"#5f6982","right",false);
}
function awardBounce(ball){
 var critical=Math.floor(Math.random()*100)<S.crit;
 var gain=S.multiplier*prestigeBonus()*(critical?2:1);
 S.score+=gain;if(S.score>S.runBest)S.runBest=S.score;
 ball.bounces++;
 mergePopup(ball.x,ball.y,gain,critical)
}
function mergePopup(px,py,gain,critical){
 var now=Date.now();
 for(var i=0;i<S.popups.length;i++){
  var q=S.popups[i];
  if(now-q.born<=140&&Math.hypot(q.x-px,q.y-py)<=u(85)){
   q.total+=gain;q.hits++;q.crit=q.crit||critical;q.x=(q.x*(q.hits-1)+px)/q.hits;q.y=(q.y*(q.hits-1)+py)/q.hits;q.born=now;return
  }
 }
 S.popups.push({x:px,y:py,total:gain,born:now,crit:critical,hits:1})
}
function updatePhysics(dt){
 var l=u(16),r=canvas().clientWidth-u(16),t=arenaTop(),b=arenaBottom(),stepDt=dt/PHYSICS_STEPS;
 for(var bi=0;bi<S.balls.length;bi++){
  var ball=S.balls[bi];
  for(var step=0;step<PHYSICS_STEPS;step++){
   var ox=ball.x,oy=ball.y;
   ball.vy+=760*stepDt;
   var nx=ball.x+ball.vx*stepDt,ny=ball.y+ball.vy*stepDt;
   if(nx-ball.r<l){nx=l+ball.r;ball.vx=Math.abs(ball.vx)*.98}
   if(nx+ball.r>r){nx=r-ball.r;ball.vx=-Math.abs(ball.vx)*.98}
   var hitLine=null,hitT=Infinity,lines=S.lines;
   for(var li=0;li<lines.length;li++){
    var ln=lines[li],dx=ln.x2-ln.x1,dy=ln.y2-ln.y1,len2=dx*dx+dy*dy;
    if(len2<1)continue;
    for(var si=1;si<=10;si++){
     var q=si/10,sx=ox+(nx-ox)*q,sy=oy+(ny-oy)*q;
     var uu=((sx-ln.x1)*dx+(sy-ln.y1)*dy)/len2;uu=Math.max(0,Math.min(1,uu));
     var px=ln.x1+uu*dx,py=ln.y1+uu*dy,ex=sx-px,ey=sy-py;
     var cr=ball.r+LINE_WIDTH*.5+1.5;
     if(ex*ex+ey*ey<=cr*cr){if(q<hitT){hitT=q;hitLine=ln}break}
    }
   }
   if(hitLine){
    var dx2=hitLine.x2-hitLine.x1,dy2=hitLine.y2-hitLine.y1,len=Math.hypot(dx2,dy2);
    var uu2=((nx-hitLine.x1)*dx2+(ny-hitLine.y1)*dy2)/(len*len);uu2=Math.max(0,Math.min(1,uu2));
    var px2=hitLine.x1+uu2*dx2,py2=hitLine.y1+uu2*dy2,ex2=nx-px2,ey2=ny-py2;
    var normalX=-dy2/len,normalY=dx2/len;
    if(ex2*normalX+ey2*normalY<0){normalX=-normalX;normalY=-normalY}
    var vn=ball.vx*normalX+ball.vy*normalY;
    if(vn>0){normalX=-normalX;normalY=-normalY;vn=-vn}
    if(vn<0){
     var tx=ball.vx-vn*normalX,ty=ball.vy-vn*normalY,bounced=-vn*RESTITUTION;
     ball.vx=tx+bounced*normalX;ball.vy=ty+bounced*normalY;ball.vx*=.995;ball.vy*=.995
    }
    var separation=ball.r+LINE_WIDTH*.5+2;
    ball.x=px2+normalX*separation;ball.y=py2+normalY*separation;awardBounce(ball);continue
   }
   ball.x=nx;ball.y=ny;
   if(ball.y>b+35){
    ball.x=l+ball.r+Math.random()*(r-l-2*ball.r);ball.y=t+25;ball.vy=45;ball.vx=(Math.random()-.5)*220;break
   }
  }
 }
}
function drawBall(x,b){
 var skin=S.selectedSkin;
 x.save();
 if(skin===1){x.fillStyle="#555c69";x.beginPath();x.arc(b.x,b.y,b.r+2,0,Math.PI*2);x.fill();x.fillStyle="#9ba5b4";x.beginPath();x.arc(b.x-5,b.y-6,5,0,Math.PI*2);x.fill()}
 else if(skin===2){x.fillStyle="#7d37ff";x.beginPath();x.arc(b.x,b.y,b.r,0,Math.PI*2);x.fill();x.fillStyle="#00ffff";x.fillRect(b.x-b.r-4,b.y-3,b.r+4,5);x.fillStyle="#ff00ff";x.fillRect(b.x-2,b.y+4,b.r+6,4)}
 else if(skin===3){x.fillStyle="#d23746";x.beginPath();x.arc(b.x,b.y,b.r,0,Math.PI*2);x.fill();x.fillStyle="#afeafa";x.beginPath();x.ellipse(b.x+.5,b.y-6,b.r*.5,5,0,0,Math.PI*2);x.fill()}
 else if(skin===4){x.fillStyle="#ff5c37";x.beginPath();x.arc(b.x,b.y,b.r,0,Math.PI*2);x.fill();x.strokeStyle="#ffe15a";x.lineWidth=3;x.beginPath();x.arc(b.x,b.y,b.r-4,0,Math.PI*2);x.stroke()}
 else if(skin===5){x.fillStyle="#82e1ff";x.beginPath();x.arc(b.x,b.y,b.r,0,Math.PI*2);x.fill();x.fillStyle="#fff";x.beginPath();x.arc(b.x-5,b.y-6,5,0,Math.PI*2);x.fill()}
 else if(skin===6){x.fillStyle="#6e6962";x.beginPath();x.arc(b.x,b.y,b.r,0,Math.PI*2);x.fill();x.fillStyle="#918c84";x.beginPath();x.arc(b.x-6,b.y-5,4,0,Math.PI*2);x.fill()}
 else if(skin===7){x.fillStyle="#1e2026";x.beginPath();x.arc(b.x,b.y,b.r,0,Math.PI*2);x.fill();x.fillStyle="#ff912d";x.beginPath();x.arc(b.x+4,b.y-7,3,0,Math.PI*2);x.fill();x.fillStyle="#787d87";x.fillRect(b.x-3,b.y-b.r-3,6,b.r-9)}
 else if(skin===8){x.fillStyle="#235a7d";x.beginPath();x.arc(b.x,b.y,b.r,0,Math.PI*2);x.fill();x.strokeStyle="#69e6ff";x.lineWidth=3;x.beginPath();x.arc(b.x,b.y,b.r-3,0,Math.PI*2);x.stroke();x.fillStyle="#fff";x.beginPath();x.arc(b.x-4,b.y-5,4,0,Math.PI*2);x.fill()}
 else if(skin===9){x.fillStyle="#000";x.beginPath();x.arc(b.x,b.y,b.r+2,0,Math.PI*2);x.fill();x.strokeStyle="#af5fff";x.lineWidth=3;x.beginPath();x.arc(b.x,b.y,b.r+4,0,Math.PI*2);x.stroke()}
 else {x.fillStyle=ballColor();x.beginPath();x.arc(b.x,b.y,b.r,0,Math.PI*2);x.fill();x.fillStyle=lighten(ballColor(),.38);x.beginPath();x.arc(b.x-5,b.y-6,5,0,Math.PI*2);x.fill()}
 x.strokeStyle=darken(ballColor(),.25);x.lineWidth=2;x.beginPath();x.arc(b.x,b.y,b.r,0,Math.PI*2);x.stroke();x.restore()
}
function drawLines(x){
 x.strokeStyle="#69e6ff";x.lineWidth=LINE_WIDTH;x.lineCap="round";
 S.lines.forEach(function(l){x.beginPath();x.moveTo(l.x1,l.y1);x.lineTo(l.x2,l.y2);x.stroke()});
 if(preview){x.strokeStyle="rgba(174,116,255,.6)";x.beginPath();x.moveTo(preview.x1,preview.y1);x.lineTo(preview.x2,preview.y2);x.stroke()}
 x.lineCap="butt"
}
function drawStat(x,px,py,w,icon,title,value,sub){
 round(x,px,py,px+w,py+u(124),u(13),"#05192c");strokeRound(x,px,py,px+w,py+u(124),u(13),"#007dd1",u(2));
 text(x,icon,px+u(25),py+u(40),u(24),"#69e6ff","center",true);
 text(x,title,px+u(48),py+u(35),u(16),"#69e6ff","left",true);
 text(x,value,px+u(22),py+u(78),u(29),"#fff","left",true);
 text(x,sub,px+u(22),py+u(105),u(13),"#87b4dc","left",false)
}
function drawBottom(x){
 var w=canvas().clientWidth,baseY=arenaBottom()+u(10),y=baseY-S.buyPanelOffset,bottom=contentHeight()-u(8);
 round(x,u(10),y,w-u(10),bottom,u(18),"#04101e");strokeRound(x,u(10),y,w-u(10),bottom,u(18),"#0082d2",u(2));
 var gap=u(10),left=u(22),cardW=(w-u(44)-gap*2)/3;
 drawStat(x,left,y+u(12),cardW,"●","BALLS",S.maxBalls+" / 50",S.maxBalls>=50?"MAX":"+"+fmt(costBalls())+" per");
 drawStat(x,left+cardW+gap,y+u(12),cardW,"╱","LINES",S.maxLines+" / 10",S.maxLines>=10?"MAX":"+"+fmt(costLines())+" per");
 drawStat(x,left+(cardW+gap)*2,y+u(12),cardW,"★","MULTIPLIER",S.multiplier+"×","| Buy +1");
 var lowerY=y+u(142),lowerW=(w-u(44)-gap)/2;
 drawStat(x,left,lowerY,lowerW,"✦","CRIT",S.crit+"% / 70%",S.crit>=70?"MAX":"| Buy +5%");
 drawStat(x,left+lowerW+gap,lowerY,lowerW,"♛","PRESTIGE","✦ "+fmt(S.shards),"| +"+prestigeGain()+" next");
 if(S.buyPanelOffset>20){
  var by=y+u(402),bw=(w-u(64))/4,bh=u(38);
  text(x,"BULK PURCHASES",u(22),by-u(10),u(13),"#69e6ff","left",true);
  var labels=["BALLS","LINES","MULTIPLIER","CRIT","PRESTIGE"],amounts=["1x","10x","100x","MAX"];
  for(var row=0;row<5;row++){
   var ry=by+row*u(47);
   text(x,labels[row],u(22),ry+u(25),u(10),"#7db0d7","left",true);
   for(var col=0;col<4;col++){
    var bx=u(82)+col*bw;
    round(x,bx,ry,bx+bw-u(6),ry+bh,u(8),"#05192c");
    strokeRound(x,bx,ry,bx+bw-u(6),ry+bh,u(8),"#007dd1",1);
    text(x,"Buy "+amounts[col],bx+(bw-u(6))/2,ry+u(25),u(10),"#fff","center",true);
   }
  }
 }
}
function drawPopups(x){
 var now=Date.now();
 for(var i=S.popups.length-1;i>=0;i--){
  var q=S.popups[i],age=(now-q.born)/1000;
  if(age>1){S.popups.splice(i,1);continue}
  var label=(q.crit?"CRITICAL!  ":"+")+fmt(q.total)+(q.hits>1?"  ×"+q.hits:"");
  text(x,label,q.x,q.y-age*u(42),q.crit?u(21):u(18),q.crit?"#ffd250":"#fff","center",true)
 }
}
function drawOptionsPanel(x){
 if(!S.optionsOpen)return;
 var w=canvas().clientWidth,panelW=Math.min(u(410),w-u(24)),px=w-panelW-u(12),py=arenaTop()+u(8),h=u(740);
 round(x,px,py,px+panelW,py+h,u(16),"#04111f");strokeRound(x,px,py,px+panelW,py+h,u(16),"#69e6ff",u(2));
 text(x,"⚙",px+u(28),py+u(48),u(28),"#69e6ff","center",true);
 text(x,"OPTIONS",px+u(70),py+u(48),u(25),"#fff","left",true);
 text(x,"×",px+panelW-u(30),py+u(48),u(30),"#69e6ff","center",false);
 x.strokeStyle="#69e6ff";x.lineWidth=u(1);x.beginPath();x.moveTo(px+u(22),py+u(68));x.lineTo(px+panelW-u(22),py+u(68));x.stroke();
 text(x,"BASE BALL COLOR",px+u(22),py+u(105),u(18),"#69e6ff","left",true);
 var colors=["#f54646","#ffa63a","#ffdc46","#46dc6e","#46dcff","#4678ff","#af5fff","#ff5abf"],sy=py+u(135),sx=px+u(40);
 colors.forEach(function(col,i){var cx=sx+(i%4)*u(78),cy=sy+Math.floor(i/4)*u(78);x.fillStyle=col;x.beginPath();x.arc(cx,cy,u(27),0,Math.PI*2);x.fill();x.strokeStyle="#fff";x.lineWidth=u(2);x.beginPath();x.arc(cx,cy,u(32),0,Math.PI*2);x.stroke();if(col.toLowerCase()===ballColor().toLowerCase()){x.strokeStyle="#69e6ff";x.lineWidth=u(3);x.beginPath();x.arc(cx,cy,u(36),0,Math.PI*2);x.stroke()}});
 text(x,"BALL SKINS  •  "+unlockedSkinCount()+"/"+SKIN_NAMES.length+" UNLOCKED",px+u(22),py+u(310),u(16),"#69e6ff","left",true);
 var sw=u(86),sh=u(54),skinSx=px+u(20),skinSy=py+u(332);
 for(var i=0;i<SKIN_NAMES.length;i++){var bx=skinSx+(i%3)*u(126),by=skinSy+Math.floor(i/3)*u(62),un=isSkinUnlocked(i);round(x,bx,by,bx+sw,by+sh,u(10),"#05192c");strokeRound(x,bx,by,bx+sw,by+sh,u(10),un&&S.selectedSkin===i+1?"#69e6ff":"#007dd1",u(2));text(x,un?SKIN_NAMES[i]:"LOCKED",bx+sw/2,by+u(22),u(11),un?"#fff":"#5a6478","center",true);text(x,un?"✓":"✦ "+fmt(SKIN_MILESTONES[i]),bx+sw/2,by+u(42),u(9),un?"#69e6ff":"#788296","center",true)}
 text(x,"SAVE TRANSFER",px+u(22),py+u(545),u(16),"#69e6ff","left",true);
 round(x,px+u(20),py+u(555),px+u(190),py+u(605),u(10),"#05192c");
 round(x,px+u(200),py+u(555),px+u(370),py+u(605),u(10),"#05192c");
 text(x,"EXPORT SAVE",px+u(105),py+u(587),u(13),"#fff","center",true);
 text(x,"IMPORT SAVE",px+u(285),py+u(587),u(13),"#fff","center",true);
 text(x,"UI SCALE",px+u(22),py+u(635),u(16),"#69e6ff","left",true);
 var names=["Small","Normal","Large"],vals=[.95,1.25,1.45],bw=(panelW-u(60))/3;
 for(var j=0;j<3;j++){var bx2=px+u(20)+j*bw+u(7)*j;round(x,bx2,py+u(655),bx2+bw-u(7),py+u(707),u(10),"#05192c");strokeRound(x,bx2,py+u(565),bx2+bw-u(7),py+u(617),u(10),Math.abs(S.uiScale-vals[j])<.01?"#69e6ff":"#007dd1",u(2));text(x,names[j],bx2+(bw-u(7))/2,py+u(689),u(15),"#fff","center",true)}
}
function render(){
 var c=canvas();if(!c||!S)return;
 var x=c.getContext("2d"),w=c.clientWidth,h=c.clientHeight;
 x.clearRect(0,0,w,h);x.fillStyle="#070911";x.fillRect(0,0,w,h);
 drawHeader(x);drawArena(x);ensureBalls();drawBalls(x);drawLines(x);drawBottom(x);drawPopups(x);drawOptionsPanel(x)
}
function drawBalls(x){S.balls.forEach(function(b){drawBall(x,b)})}
function frame(now){
 if(!running)return;
 var dt=Math.min(.035,Math.max(.001,(now-last)/1000||.001));last=now;
 ensureBalls();var c=canvas();if(!c){raf=requestAnimationFrame(frame);return}
 var x=c.getContext("2d"),w=c.clientWidth,h=c.clientHeight;
 x.clearRect(0,0,w,h);x.fillStyle="#070911";x.fillRect(0,0,w,h);
 drawHeader(x);drawArena(x);updatePhysics(dt);drawBalls(x);drawLines(x);drawBottom(x);drawPopups(x);drawOptionsPanel(x);
 if(Date.now()-(S.lastSave||0)>4000){save();S.lastSave=Date.now()}
 raf=requestAnimationFrame(frame)
}
function start(){if(running)return;running=true;last=performance.now();raf=requestAnimationFrame(frame)}
function centerWindow(){var w=$("bounceCoreWindow");if(!w)return;w.style.left="50%";w.style.top="50%";w.style.right="auto";w.style.bottom="auto";w.style.transform="translate(-50%,-50%)";}
function open(){
 var w=$("bounceCoreWindow");if(!w)return;
 if(!bind())return;
 centerWindow();
 if(!S)S=load();w.classList.remove("hidden");w.setAttribute("aria-hidden","false");
 window.__esmFloatingZ=(window.__esmFloatingZ||10050)+1;w.style.zIndex=window.__esmFloatingZ;
 if(running)stop();
 requestAnimationFrame(function(){
  if(!S)return;
  size();ensureBalls();render();start();
 });
}
function hide(){var w=$("bounceCoreWindow");if(w){w.classList.add("hidden");w.setAttribute("aria-hidden","true")}save()}
function close(){save();stop();if(obs){obs.disconnect();obs=null}var w=$("bounceCoreWindow");if(w){w.classList.add("hidden");w.setAttribute("aria-hidden","true");centerWindow()}S=null;preview=null;drawing=false}
function stop(){running=false;if(raf)cancelAnimationFrame(raf);raf=0}

function maxAffordableBalls(){var n=0,f=S.score;while(n<50-S.maxBalls){var c=250*Math.pow(1.42,S.maxBalls+n-1);if(f<c)break;f-=c;n++}return n}
function maxAffordableLines(){var n=0,f=S.score;while(n<10-S.maxLines){var c=500*Math.pow(1.85,S.maxLines+n-1);if(f<c)break;f-=c;n++}return n}
function maxAffordableMultiplier(){var n=0,f=S.score;while(n<1000-S.multiplier){var c=Math.max(8,12*Math.pow(1.012,S.multiplier+n-1));if(f<c)break;f-=c;n++}return n}
function maxAffordableCrit(){var n=0,f=S.score;while(n<(70-S.crit)/5){var c=900*Math.pow(1.55,(S.crit+n*5)/5);if(f<c)break;f-=c;n++}return n}
function buyBallsN(n){for(var i=0;i<n&&S.maxBalls<50;i++){var c=costBalls();if(S.score<c)break;S.score-=c;S.maxBalls++;spawnBall(Math.random())}save();render()}
function buyLinesN(n){for(var i=0;i<n&&S.maxLines<10;i++){var c=costLines();if(S.score<c)break;S.score-=c;S.maxLines++}save();render()}
function buyMultiplierN(n){for(var i=0;i<n&&S.multiplier<1000;i++){var c=costMultiplier();if(S.score<c)break;S.score-=c;S.multiplier++}save();render()}
function buyCritN(n){for(var i=0;i<n&&S.crit<70;i++){var c=costCrit();if(S.score<c)break;S.score-=c;S.crit=Math.min(70,S.crit+5)}save();render()}
function bulkBuy(type,amount){
 if(type===0)buyBallsN(amount===Infinity?maxAffordableBalls():amount);
 else if(type===1)buyLinesN(amount===Infinity?maxAffordableLines():amount);
 else if(type===2)buyMultiplierN(amount===Infinity?maxAffordableMultiplier():amount);
 else if(type===3)buyCritN(amount===Infinity?maxAffordableCrit():amount);
 else bulkPrestige(amount);
}
function bulkPrestige(amount){
 if(prestigeGain()<=0)return;
 if(!window.confirm("Prestige "+(amount===Infinity?"MAX":amount+"×")+" time(s)? This resets the run each time."))return;
 var n=amount===Infinity?100:amount;
 for(var i=0;i<n;i++){var gain=prestigeGain();S.shards+=gain;S.prestigeLevel+=gain;S.score=0;S.multiplier=1;S.maxBalls=1;S.maxLines=1;S.crit=0;S.lines=[];S.balls=[];S.popups=[];spawnBall(0)}
 save();render();
}
function buyBalls(){buyBallsN(1)}
function buyLines(){buyLinesN(1)}
function buyMultiplier(){buyMultiplierN(1)}
function buyCrit(){buyCritN(1)}
function prestige(){
 var gain=prestigeGain();if(gain<=0)return;
 if(!window.confirm("Reset this run for ✦ "+gain+" Core Shards?\n\nPermanent bonus after reset: +"+(S.prestigeLevel+gain)+"% points."))return;
 S.shards+=gain;S.prestigeLevel+=gain;S.score=0;S.multiplier=1;S.maxBalls=1;S.maxLines=1;S.crit=0;S.lines=[];S.balls=[];S.popups=[];spawnBall(0);S.selectedSkin=S.selectedSkin>0&&isSkinUnlocked(S.selectedSkin-1)?S.selectedSkin:0;save()
}
function handleTap(x,y){
 var w=canvas().clientWidth,ow=u(145),ox=w-ow-u(25);
 if(S.buyPanelOffset>20){
  var py=arenaBottom()+u(10)-S.buyPanelOffset,by=py+u(402),bw=(w-u(64))/4;
  if(y>=by&&y<=by+u(47*5)){
   var row=Math.max(0,Math.min(4,Math.floor((y-by)/u(47)))),col=-1;
   for(var k=0;k<4;k++){var bx=u(82)+k*bw;if(x>=bx&&x<=bx+bw-u(6)){col=k;break}}
   if(col>=0){var amount=col===0?1:col===1?10:col===2?100:Infinity;bulkBuy(row,amount);return}
  }
 }
 if(y>=u(27)&&y<=u(83)&&x>=ox&&x<=ox+ow){S.optionsOpen=!S.optionsOpen;return}
 var by=arenaBottom()+u(10),col=(w-u(32))/5;
 if(y>=by&&y<contentHeight()-u(4)){
  if(x<u(16)+col)buyBalls();else if(x<u(16)+2*col)buyLines();else if(x<u(16)+3*col)buyMultiplier();else if(x<u(16)+4*col)buyCrit();else prestige()
 }
}
function handleOptionsTap(x,y){
 var w=canvas().clientWidth,panelW=Math.min(u(410),w-u(24)),px=w-panelW-u(12),py=arenaTop()+u(8);
 if(x<px||x>px+panelW||y<py||y>py+u(740)){S.optionsOpen=false;return}
 if(y>py+u(545)&&y<py+u(615)){
  if(x>=px+u(20)&&x<=px+u(190)){exportSaveFile();return}
  if(x>=px+u(200)&&x<=px+u(370)){importSaveFile();return}
 }
 if(y>py+u(85)&&y<py+u(290)){
  var colors=["#f54646","#ffa63a","#ffdc46","#46dc6e","#46dcff","#4678ff","#af5fff","#ff5abf"],sx=px+u(40),sy=py+u(135);
  for(var i=0;i<8;i++){var cx=sx+(i%4)*u(78),cy=sy+Math.floor(i/4)*u(78);if(Math.hypot(x-cx,y-cy)<u(35)){S.ballColor=colors[i];save();return}}
 }
 if(y>py+u(320)&&y<py+u(530)){
  var ssx=px+u(20),ssy=py+u(332);
  for(var j=0;j<9;j++){var bx=ssx+(j%3)*u(126),by=ssy+Math.floor(j/3)*u(62);if(x>=bx&&x<=bx+u(86)&&y>=by&&y<=by+u(54)&&isSkinUnlocked(j)){S.selectedSkin=j+1;save();return}}
 }
 if(y>py+u(625)&&y<py+u(725)){
  var bw=(panelW-u(60))/3;
  for(var k=0;k<3;k++){var bx2=px+u(20)+k*bw+u(7)*k;if(x>=bx2&&x<=bx2+bw-u(7)){S.uiScale=[.95,1.25,1.45][k];size();save();return}}
 }
 if(x>px+panelW-u(65)&&y<py+u(70))S.optionsOpen=false
}
function point(e){var r=canvas().getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function bind(){
 if(bound)return true;
 var w=$("bounceCoreWindow"),h=$("bounceCoreHeader"),c=canvas();if(!w||!h||!c)return false;
 bound=true;
 h.addEventListener("pointerdown",function(e){if(e.target.closest("button"))return;var r=w.getBoundingClientRect();w.style.transform="none";w.style.left=r.left+"px";w.style.top=r.top+"px";w.style.right="auto";w.style.bottom="auto";off.x=e.clientX-r.left;off.y=e.clientY-r.top;drag=true;h.setPointerCapture&&h.setPointerCapture(e.pointerId);});
 h.addEventListener("pointermove",function(e){if(!drag)return;w.style.left=Math.max(8,e.clientX-off.x)+"px";w.style.top=Math.max(8,e.clientY-off.y)+"px";w.style.right="auto";w.style.bottom="auto"});
 ["pointerup","pointercancel"].forEach(function(k){h.addEventListener(k,function(){drag=false})});
 $("bounceCoreHideBtn").addEventListener("click",hide);$("bounceCoreCloseBtn").addEventListener("click",close);
 c.addEventListener("pointerdown",function(e){
  if(!running)return;var p=point(e);
  if(S.optionsOpen){handleOptionsTap(p.x,p.y);return}
  var panelTop=arenaBottom()+u(10)-S.buyPanelOffset;
  if(S.buyPanelOffset>20){
   var bulkTop=panelTop+u(402);
   if(p.y>=bulkTop&&p.y<=bulkTop+u(47*5)){handleTap(p.x,p.y);return}
  }
  if(p.x>=u(10)&&p.x<=c.clientWidth-u(10)&&p.y>=panelTop&&p.y<=contentHeight()-u(8) &&
     p.y<panelTop+u(32)){
   drag=true;off.x=p.x;off.y=p.y;return;
  }
  if(p.y<arenaTop()||p.y>arenaBottom()){handleTap(p.x,p.y);return}
  drawing=true;preview={x1:p.x,y1:p.y,x2:p.x,y2:p.y};c.setPointerCapture&&c.setPointerCapture(e.pointerId)
 });
 c.addEventListener("pointermove",function(e){
  var p=point(e);
  if(drag){S.buyPanelOffset=Math.max(0,Math.min(400, S.buyPanelOffset+(off.y-p.y)));off.y=p.y;render();return}
  if(!drawing)return;preview.x2=p.x;preview.y2=p.y
 });
 c.addEventListener("pointerup",function(){if(drag){drag=false;save();return}});

 c.addEventListener("pointermove",function(e){if(!drawing)return;var p=point(e);preview.x2=p.x;preview.y2=p.y});
 c.addEventListener("pointerup",function(){if(!drawing)return;drawing=false;if(preview&&Math.hypot(preview.x2-preview.x1,preview.y2-preview.y1)>12){S.lines.push(preview);while(S.lines.length>S.maxLines)S.lines.shift()}preview=null;save()});
 c.addEventListener("pointercancel",function(){drawing=false;preview=null});
 window.addEventListener("keydown",function(e){
  if(!running||!S)return;
  var tag=(e.target&&e.target.tagName)||"";if(tag==="INPUT"||tag==="TEXTAREA")return;
  if(e.key==="1"){e.preventDefault();buyBalls()}else if(e.key==="2"){e.preventDefault();buyLines()}else if(e.key==="3"){e.preventDefault();buyMultiplier()}else if(e.key==="4"){e.preventDefault();buyCrit()}else if(e.key==="5"){e.preventDefault();prestige()}
 });
 if(window.ResizeObserver){obs=new ResizeObserver(function(){size();render()});obs.observe(c.parentElement)}
}
window.openBounceCore=open;window.hideBounceCore=hide;window.closeBounceCore=close;
window.addEventListener("beforeunload",save);
window.addEventListener("DOMContentLoaded",function(){window.__esmFloatingZ=window.__esmFloatingZ||10050;bind()});if(document.readyState!=="loading"){window.__esmFloatingZ=window.__esmFloatingZ||10050;bind()}
})();