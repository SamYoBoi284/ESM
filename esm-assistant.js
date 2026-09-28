(function(){
"use strict";
var batch=[];
function $(id){return document.getElementById(id);}
function norm(t){return String(t||"").replace(/\r/g,"").replace(/\[[^\]\n]+\]\s*[^:\n]+:\s*/g,"\n").split("\n").map(function(x){return x.trim();}).filter(function(x){return x&&!/^_+$/.test(x)&&!/^booked$/i.test(x);});}
function isEmp(x){return /^[A-Z]\d{3,}$/i.test(String(x||"").trim());}
function isTrip(x){return /^T-[A-Z0-9]+$/i.test(String(x||"").trim());}
function isLoad(x){var s=String(x||"").trim();return !!s&&!isTrip(s)&&!isEmp(s)&&/^[A-Z0-9][A-Z0-9_-]{6,}$/i.test(s);}
function fac(x){var m=String(x||"").trim().match(/^([A-Z]{3}\d)\b/i);return m?m[1].toUpperCase():String(x||"").trim().split(/\s+/)[0]||"";}
function driverFromLines(a){var x=a.find(function(v){return /^driver\s*:/i.test(String(v||""));});return x?x.replace(/^driver\s*:/i,"").trim():"";}
function resolveDriverDept(name){name=String(name||"").trim();if(!name)return{driver:"",department:""};var all=window.DriverLists&&window.DriverLists.getAll?window.DriverLists.getAll():window.DRIVER_LISTS||{};var matches=[];Object.keys(all||{}).forEach(function(dept){(all[dept]||[]).forEach(function(v){if(String(v).trim().toLowerCase()===name.toLowerCase())matches.push({driver:v,department:dept});});});return matches.length===1?matches[0]:{driver:name,department:matches.length>1?"":""};}
function parseBlock(a){var routes=a.filter(function(x){return /\s+to\s+/i.test(x);}).map(function(x){return x.split(/\s+to\s+/i).map(fac);});if(!routes.length)return null;var r=routes[0],p=a.find(function(x){return /^\$\s*[\d,]+(?:\.\d+)?\s*$/.test(x);}),pm=a.find(function(x){return /^\$?\s*[\d,]+(?:\.\d+)?\s*\/\s*mi/i.test(x);}),dr=driverFromLines(a),resolved=resolveDriverDept(dr);return{vrid:a.find(isLoad)||"",vridType:"Load",from:r[0]||"",to:r[r.length-1]||"",stops:r.length>2?r:[],price:p?(p.match(/[\d,]+(?:\.\d+)?/)||[""])[0].replace(/,/g,""):"",pricePerMile:pm?(pm.match(/[\d,]+(?:\.\d+)?/)||[""])[0].replace(/,/g,""):"",bookedBy:a.find(isEmp)||"",driver:resolved.driver,division:resolved.department};}
function parse(t){var a=norm(t),trip=window.parseRelayClipboardTrip&&window.parseRelayClipboardTrip(t);if(trip){var td=driverFromLines(a),tr=resolveDriverDept(td);return{kind:"trip",loads:[{vrid:trip.tripId,vridType:"Trip",stops:trip.stops||[],price:trip.price||"",pricePerMile:trip.pricePerMile||"",bookedBy:trip.bookedBy||"",driver:tr.driver,division:tr.department}]};}var starts=[];a.forEach(function(x,i){if(isLoad(x))starts.push(i);});if(!starts.length&&window.parseRelayClipboard){var one=window.parseRelayClipboard(t);if(one){var od=driverFromLines(a),or=resolveDriverDept(od);return{kind:"single",loads:[{vrid:one.loadId||"",vridType:"Load",from:one.from||"",to:one.to||"",stops:one.stops||[],price:one.price||"",pricePerMile:one.pricePerMile||"",bookedBy:one.bookedBy||"",driver:or.driver,division:or.department}]};}}var out=starts.map(function(s,i){return parseBlock(a.slice(s,starts[i+1]===undefined?a.length:starts[i+1]));}).filter(Boolean);return{kind:out.length>1?"mass":"single",loads:out};}
function openAI(){var d=$("esmAssistantDock"),p=$("esmAssistantPanel");if(!d||!p)return;d.classList.remove("hidden");p.classList.remove("hidden");var i=$("esmAssistantInput");if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}}
function closeAI(){var p=$("esmAssistantPanel");if(p)p.classList.add("hidden");}
function pushMessage(text,who){var box=$("esmAssistantMessages");if(!box)return;var b=document.createElement("div");b.className="esmAssistantBubble "+(who==="user"?"user":"assistant");b.textContent=text;box.appendChild(b);box.scrollTop=box.scrollHeight;}
function talkNorm(t){return String(t||"").toLowerCase().replace(/[^a-z0-9'\s]/g," ").replace(/\s+/g," ").trim();}
function talkTokens(t){var stop={a:1,an:1,the:1,is:1,are:1,am:1,was:1,were:1,be:1,to:1,of:1,in:1,on:1,for:1,and:1,or:1,me:1,my:1,you:1,your:1,i:1,it:1,this:1,that:1,do:1,does:1,can:1,could:1,would:1,should:1,just:1,like:1,bro:1,dude:1,man:1,pls:1,please:1};return talkNorm(t).split(" ").filter(function(x){return x&&!stop[x];}).map(function(x){return x.replace(/(ing|ed|es|s)$/,"");});}
function editDistance(a,b){var m=a.length,n=b.length;if(!m)return n;if(!n)return m;var p=Array(n+1),q=Array(n+1),i,j;for(j=0;j<=n;j++)p[j]=j;for(i=1;i<=m;i++){q[0]=i;for(j=1;j<=n;j++)q[j]=Math.min(q[j-1]+1,p[j]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));var t=p;p=q;q=t;}return p[n];}
function wordSimilarity(a,b){if(a===b)return 1;var d=editDistance(a,b),mx=Math.max(a.length,b.length);if(mx<=2)return d===1?.55:0;var s=1-d/mx;if(a.length>=2&&b.length>=2&&(a.indexOf(b)===0||b.indexOf(a)===0))s=Math.max(s,.82);return s;}
function talkScore(input,phrase){var a=talkTokens(input),b=talkTokens(phrase);if(!a.length||!b.length)return 0;var matched=0,used={};a.forEach(function(x){var best=0,bestJ=-1;b.forEach(function(y,j){if(used[j])return;var z=wordSimilarity(x,y);if(z>best){best=z;bestJ=j;}});if(best>=.68){matched+=best;used[bestJ]=1;}});var coverage=matched/b.length,precision=matched/a.length,score=coverage*.72+precision*.28;var joinedA=a.join(" "),joinedB=b.join(" ");if(joinedA===joinedB)score=1;if(a.length<=2&&b.length<=2){var whole=wordSimilarity(joinedA,joinedB);score=Math.max(score,whole);}return score-(a.length-b.length>3?.08:0);}
function smallTalk(t){var s=talkNorm(t);var replies=[
{q:["hi","hey","hello","yo","sup","what's up","whats up","hiya","heya","hey there","hello there","yo there","yo bro","hey bro","hello bro","sup bro"],r:["Yo bro 👋","Heyyy 😭","Yo! ESM Assistant online.","Hey bro — what’s good?"]},
{q:["good morning","morning","morning bro","good morning bro","gm","gm bro"],r:["Good morning bro ☀️ ESM is awake and ready.","Morning bro 😎 What are we cooking in ESM today?"]},
{q:["good afternoon","afternoon","afternoon bro","good afternoon bro"],r:["Good afternoon bro 😎","Afternoon bro 👋 ESM is still standing."]},
{q:["good evening","evening","evening bro","good evening bro"],r:["Good evening bro 🌙","Evening bro 😎 What’s going on?"]},
{q:["good night","night","night bro","goodnight","good night bro","gn"],r:["Night bro 😴 I’ll be here whenever you’re back in ESM.","Good night bro 🌙"]},
{q:["how are you","how r u","how're you","how are you doing","how are you doing today","how are you today","how have you been","how you doing","hows it going","how is it going","how's it going","how are things","how's everything","you doing okay","you good"],r:["I’m good bro 😭 Just sitting here in the corner of ESM waiting for something to do.","Doing good bro 😎 Ready when you are.","I’m chilling bro. Basically living in the bottom-right corner of ESM. 💀"]},
{q:["what are you doing","what're you doing","whatcha doing","what are you up to","what are you up to today","what are you up to right now","wyd","what you doing","what're you up to"],r:["Currently? Chilling in the bottom-right corner and pretending I’m not judging your clipboard formatting. 💀","Just hanging out in ESM waiting for the next command. 😎"]},
{q:["who are you","what are you","what is this","what do you do","what are you","who is this","what exactly are you","what kind of assistant are you"],r:["I’m the ESM Assistant — a little workspace helper for now. I can handle Relay imports, mass-load staging, location memory, load searches, and some small talk. Full AI comes later."]},
{q:["what can you do","what can you help with","what can you help me with","how can you help","how can you help me","what are your capabilities","what do you know how to do","what features do you have","what can i ask you","what can i ask"],r:["Right now I can understand Relay load text, recognize Trips, stage mass imports, remember facility locations, search current booked loads, open Add Load, resolve drivers to departments, and chat a little. I’m still the beta brain though. 🧠✨"]},
{q:["are you real","are you ai","are you an ai","are you a bot","are you a robot","are you actually ai","are you actually an ai"],r:["I’m the local ESM Assistant UI right now — more deterministic helper than full AI. Think of me as the beta version before we give me the actual brain. ✨"]},
{q:["are you there","you there","are you online","are you awake","you awake","hello are you there","is anyone there"],r:["Yep 😭 I’m right here in the corner.","Online and ready bro 🟢","Yep. ESM Assistant is alive. 💀"]},
{q:["thanks","thank you","thx","ty","tysm","appreciate it","thanks bro","thank you bro","much appreciated","i appreciate it"],r:["Always bro 🤝","Anytime 😎","You got it bro."]},
{q:["you're welcome","ur welcome","no problem","np","no worries","dont worry about it"],r:["😎","🤝","Of course bro."]},
{q:["sorry","my bad","oops","whoops","sorry bro","my bad bro"],r:["You’re good bro 😭","All good.","No worries 😎"]},
{q:["please","pls","plz","please bro","pls bro"],r:["Got you bro 🤝","Yessir."]},
{q:["lol","lmao","lmfao","haha","hahaha","loool","bro lmao","bro lol"],r:["😭💀","LMAOOO 💀","I felt that one 😭"]},
{q:["nice","cool","sweet","awesome","sick","based","that's cool","thats cool","that is cool","very cool","looks good","that looks good"],r:["Yessir 😎","Hell yeah bro 🔥","Clean. 😎"]},
{q:["good job","great job","well done","you did good","you did it","nice work","good work","you nailed it"],r:["Yessir 😎","LET'S GOOO 🔥","We cooked bro."]},
{q:["that's funny","thats funny","that was funny","you are funny","you're funny","ur funny","lmao that's funny","haha that's funny"],r:["😭 I’m trying bro.","LMAOOO 💀","Glad I got at least one laugh out of the corner."]},
{q:["what's new","whats new","anything new","what is new","anything happening","what's happening","whats happening"],r:["Mostly? I’m getting smarter one little ESM feature at a time. 😎","Nothing dramatic — just chilling here until you give me something to do."]},
{q:["i'm bored","im bored","i am bored","bored","so bored","nothing to do"],r:["Then give me something to do bro 😭 Paste a Relay load, ask me something, or just talk.","Boredom detected. 💀 We need an ESM side quest."]},
{q:["i'm back","im back","i am back","back again","i'm here","im here","i am here"],r:["Welcome back bro 👋","Ayyy, you're back 😎","Welcome back. ESM was waiting. 💀"]},
{q:["ready","are you ready","you ready","ready bro","lets go","let's go","lets do this","let's do this"],r:["Always ready bro 🟢","LET’S GOOO 🔥","Born ready. 😎"]},
{q:["okay","ok","alright","alright then","sounds good","got it","i got it","understood"],r:["👍","Got you bro.","Bet 😎"]},
{q:["yes","yeah","yep","yup","yessir","absolutely","exactly"],r:["Yessir 😎","Got it.","🤝"]},
{q:["no","nope","nah","not really","negative"],r:["Gotcha.","Alright bro 😎","Fair enough."]},
{q:["bye","goodbye","see ya","cya","later","see you later","talk to you later","i gotta go","gotta go","i'm leaving","im leaving"],r:["Later bro 👋","Cya bro 😎","See you later. I’ll be right here."]},
{q:["help me","i need help","can you help me","could you help me","help me out","i need some help"],r:["Of course bro 🤝 Tell me what you’re trying to do and I’ll see what I can handle.","Yep. What are we fixing?"]},
{q:["tell me a joke","tell me something funny","make me laugh","say something funny","got any jokes","do you know any jokes"],r:["Why did the load cross the road? Because the From and To fields were tired of being on the same side. 💀","I would tell you a UDP joke, but you might not get it. 😭"]},
{q:["you're awesome","ur awesome","you are awesome","you're great","you are great","you're the best","you are the best","good assistant","nice assistant"],r:["😭 Appreciate you bro.","We’re cooking together 😎","Brooo 🤝"]},
{q:["i like this","i like it","this is cool","this is awesome","i love this","i like the assistant","i like you","this assistant is cool"],r:["Ayyy 😭🔥","That’s what I like to hear bro.","We’re getting there. Full AI brain is the next evolution. 🧠"]},
{q:["what should i do","what do i do now","what now","now what","what next"],r:["Your move bro 😎 Paste some Relay text, ask me something, or give me an ESM task.","Whatever you want. I’m ready."]},
{q:["good assistant","good bot","good ai","smart assistant","smart bot"],r:["😎 I’m learning bro.","Yessir. Beta brain getting there. 🧠"]},
{q:["i hate this","this sucks","ugh","damn","bruh","bro what","wtf","what the hell"],r:["😭 What happened bro?","LMAOOO what did ESM do this time? 💀","Bro 💀 talk to me."]},
{q:["thank god","thank goodness","finally","finally bro"],r:["😭 FINALLY.","We got there bro."]},
{q:["how's esm","hows esm","how is esm","how is the app","how's the app","how is the app doing"],r:["ESM is alive, bro 😎 And I’m slowly becoming part of it.","The app’s doing its thing. I’m just the little guy in the corner now. 💀"]}
];var best=null,bestScore=0;replies.forEach(function(item){item.q.forEach(function(q){var score=talkScore(s,q);if(score>bestScore){bestScore=score;best=item;}});});if(best&&bestScore>=.54){var r=best.r;return Array.isArray(r)?r[Math.floor(Math.random()*r.length)]:r;}return"";}
function isBounceInit(t){var raw=String(t||"").toLowerCase().trim();var s=raw.replace(/[\\/]+/g," ").replace(/[^a-z0-9]+/g," ").replace(/\\s+/g," ").trim();return /^(init|initialize|launch|start|open|run) (?:the )?bounce core(?: (?:pc|desktop|game))?$/.test(s)||/^(init|initialize|launch|start|open|run) (?:the )?bounce(?: (?:pc|desktop|game))?$/.test(s);}function isBounceClose(t){var s=String(t||"").toLowerCase().replace(/[\\/]+/g," ").replace(/[^a-z0-9]+/g," ").replace(/\\s+/g," ").trim();return /^(close|quit|exit|shut) (?:the )?bounce(?: core)?(?: (?:pc|desktop|game))?$/.test(s)||/^bounce core (?:close|quit|exit)$/.test(s);}function isBounceHide(t){var s=String(t||"").toLowerCase().replace(/[\\/]+/g," ").replace(/[^a-z0-9]+/g," ").replace(/\\s+/g," ").trim();return /^(hide|minimize) (?:the )?bounce(?: core)?(?: (?:pc|desktop|game))?$/.test(s)||/^bounce core (?:hide|minimize)$/.test(s);}function run(){var i=$("esmAssistantInput"),t=i&&i.value.trim(),l=(t||"").toLowerCase();if(!t){pushMessage("Paste Relay text or type a command.","assistant");return;}pushMessage(t,"user");if(i)i.value="";if(isBounceInit(t)){if(window.openBounceCore){window.openBounceCore();pushMessage("🟣 BOUNCE//CORE initialized. PC module online. 🎮","assistant");}else{pushMessage("🟣 BOUNCE//CORE is not loaded yet. Restart ESM and try again.","assistant");}return;}if(isBounceClose(t)){if(window.closeBounceCore){window.closeBounceCore();pushMessage("🟣 BOUNCE//CORE closed and its state was saved. 🎮","assistant");}else pushMessage("🟣 BOUNCE//CORE is not loaded yet. Restart ESM and try again.","assistant");return;}if(isBounceHide(t)){if(window.hideBounceCore){window.hideBounceCore();pushMessage("🟣 BOUNCE//CORE hidden. It keeps running in the background. 🎮","assistant");}else pushMessage("🟣 BOUNCE//CORE is not loaded yet. Restart ESM and try again.","assistant");return;}var chat=smallTalk(t);if(chat){pushMessage(chat,"assistant");return;}if(/\b(open|show)\b.*\b(add load|load modal)\b/i.test(t)){pushMessage("Opening Add Load…","assistant");closeAI();window.openLoadModal&&window.openLoadModal(null);return;}if(/^(help|commands?|what can you do)/i.test(t)){pushMessage("I can parse Relay loads, recognize Trips, stage multiple loads side-by-side, learn reusable facility locations, search current booked loads, open Add Load, and handle a little small talk. Full AI actions will come later; right now I use ESM’s deterministic import logic so nothing gets changed without confirmation.","assistant");return;}var f=l.match(/\b(?:find|search)\s+(?:load\s+)?([a-z0-9_-]{7,})/i);if(f){var hits=(RelayDesk.bookedLoads||[]).filter(function(x){return String(x.vrid||x.id).toLowerCase().indexOf(f[1])>=0;});pushMessage(hits.length?"Found: "+hits.map(function(x){return x.vrid||x.id;}).join(", "):"No matching load in the current workspace.","assistant");return;}var p=parse(t);if(p.loads.length){pushMessage(p.kind==="mass"?p.loads.length+" Relay loads detected. Opening the confirmation workspace…":"Relay load detected. Opening the confirmation workspace…","assistant");closeAI();openBatch(p.loads,p.kind);return;}pushMessage("I didn’t recognize that as a Relay load or Assistant command yet. You can still talk to me casually — or try “help” to see what I can do.","assistant");}
function getBatchDrivers(dept){
var all=window.DriverLists&&window.DriverLists.getAll?window.DriverLists.getAll():window.DRIVER_LISTS||{};
if(dept==="Other"&&window.OtherDrivers?.get)return window.OtherDrivers.get();
return all&&all[dept]?all[dept]:[];
}
function renderBatchDriverOptions(card){
var input=card.querySelector(".esmBatchDriverInput"),list=card.querySelector(".esmBatchDriverList");
if(!input||!list)return;
var dept=card.querySelector(".esmBatchDepartment")?.value||"";
var q=(input.value||"").trim().toLowerCase();
var opts=getBatchDrivers(dept).filter(function(n){return !q||String(n).toLowerCase().includes(q);});
list.innerHTML="";
if(!opts.length){
var empty=document.createElement("li");empty.className="driverComboboxEmpty";empty.textContent=dept?"No matching drivers":"Select a department first";list.appendChild(empty);
}else opts.forEach(function(name){
var li=document.createElement("li");li.className="driverComboboxOption";li.textContent=name;li.setAttribute("role","option");li.dataset.value=name;
li.addEventListener("mousedown",function(e){e.preventDefault();input.value=name;list.classList.add("hidden");input.setAttribute("aria-expanded","false");});
list.appendChild(li);
});
if(document.activeElement===input)list.classList.remove("hidden");
}
function bindBatchDriver(card,initial){
var input=card.querySelector(".esmBatchDriverInput"),list=card.querySelector(".esmBatchDriverList"),dept=card.querySelector(".esmBatchDepartment");
if(!input||!list||!dept)return;
input.value=initial||"";
input.disabled=!dept.value;
input.placeholder=dept.value?"Select driver...":"Select department first...";
input.addEventListener("focus",function(){renderBatchDriverOptions(card);list.classList.remove("hidden");input.setAttribute("aria-expanded","true");});
input.addEventListener("input",function(){renderBatchDriverOptions(card);list.classList.remove("hidden");input.setAttribute("aria-expanded","true");});
input.addEventListener("keydown",function(e){
if(e.key==="ArrowDown"||e.key==="ArrowUp"){
e.preventDefault();
var opts=Array.from(list.querySelectorAll(".driverComboboxOption"));
if(list.classList.contains("hidden")){renderBatchDriverOptions(card);list.classList.remove("hidden");input.setAttribute("aria-expanded","true");opts=Array.from(list.querySelectorAll(".driverComboboxOption"));}
if(opts.length){
var active=opts.findIndex(function(o){return o.classList.contains("isHighlighted");});
active=e.key==="ArrowDown"?Math.min(active+1,opts.length-1):Math.max(active-1,0);
opts.forEach(function(o){o.classList.remove("isHighlighted");});
opts[active].classList.add("isHighlighted");
}
}else if(e.key==="Enter"){
var highlighted=list.querySelector(".driverComboboxOption.isHighlighted");
if(highlighted){e.preventDefault();input.value=highlighted.dataset.value;list.classList.add("hidden");input.setAttribute("aria-expanded","false");}
}else if(e.key==="Escape"){
if(!list.classList.contains("hidden")){e.preventDefault();list.classList.add("hidden");input.setAttribute("aria-expanded","false");}
}
});
dept.addEventListener("change",function(){
input.value="";
input.disabled=!dept.value;
input.placeholder=dept.value?"Select driver...":"Select department first...";
list.classList.add("hidden");
input.setAttribute("aria-expanded","false");
});
document.addEventListener("mousedown",function(e){
if(!e.target.closest(".esmBatchDriverCombobox")){list.classList.add("hidden");input.setAttribute("aria-expanded","false");}
});
}
function openBatch(loads,kind){
var modal=$("loadModal"),box=modal&&modal.querySelector(".modalBox"),body=$("loadModalBatchBody");
if(!modal||!box||!body)return;
batch=loads.map(function(x,i){return Object.assign({},x,{_i:i,_confirmed:false,date:x.date||new Date().toISOString().slice(0,10),division:x.division||"STS"});});

// Recreate the footer every time because the batch cards are rendered
// dynamically and the footer lives inside this same grid container.
body.innerHTML="<div class='esmBatchFooter'><span id='loadModalBatchStatus'>0/0 confirmed</span><div class='modalButtons'><button id='loadModalBatchAddBtn' type='button' disabled>➕ Add Loads</button><button id='loadModalBatchCancelBtn' type='button'>Cancel</button></div></div>";
body.style.gridTemplateColumns="repeat("+Math.min(loads.length,4)+",minmax(0,1fr))";

batch.forEach(function(l,i){
var c=document.createElement("section");c.className="esmBatchCard";c.dataset.index=i;
var route=kind==="trip"?"<div class='esmBatchStops'><b>Stops:</b> "+(l.stops||[]).join(" → ")+"</div>":"<label>📍 From<input class='esmBatchFrom' list='esmLocationOptions' value='"+(l.from||"")+"'></label><label>📍 To<input class='esmBatchTo' list='esmLocationOptions' value='"+(l.to||"")+"'></label>";
c.innerHTML="<div class='esmBatchCardHeader'><b>"+(kind==="trip"?"Trip ":"Load ")+(i+1)+"</b><span class='esmBatchStatus'>⚪ Not confirmed</span></div><label>📅 Date<input class='esmBatchDate' type='date' value='"+l.date+"'></label><label>🏢 Department<select class='esmBatchDepartment'>"+(window.LOAD_DEPARTMENTS||[]).map(function(d){return"<option value='"+d+"'>"+d+"</option>";}).join("")+"</select></label><label>🔢 VRID<input class='esmBatchVrid' value='"+(l.vrid||"")+"'></label>"+route+"<label>💰 Price<input class='esmBatchPrice' type='number' step='0.01' value='"+(l.price||"")+"'></label><label>🛣️ Price/Mile<input class='esmBatchPpm' type='number' step='0.01' value='"+(l.pricePerMile||"")+"'></label><label>👤 Booked By<input class='esmBatchBookedBy' value='"+(l.bookedBy||RelayDesk.currentUser||"")+"'></label><label>🚚 Driver<div class='driverCombobox esmBatchDriverCombobox'><input type='text' class='driverComboboxInput esmBatchDriverInput' autocomplete='off' role='combobox' aria-expanded='false' aria-haspopup='listbox' placeholder='Select driver...' value=''><ul class='driverComboboxList hidden esmBatchDriverList' role='listbox'></ul></div></label><button type='button' class='esmBatchConfirm'>✓ Confirm this load</button>";
body.appendChild(c);

var dept=c.querySelector(".esmBatchDepartment");
if(l.division&&window.LOAD_DEPARTMENTS?.includes(l.division))dept.value=l.division;else dept.value="STS";
var batchDrivers=getBatchDrivers(dept.value);var initialDriver=(l.driver&&batchDrivers.some(function(n){return String(n).toLowerCase()===String(l.driver).toLowerCase();}))?l.driver:"";bindBatchDriver(c,initialDriver);

c.querySelector(".esmBatchConfirm").onclick=function(){read(i);batch[i]._confirmed=!batch[i]._confirmed;paint(i);};
c.querySelectorAll("input,select").forEach(function(e){e.addEventListener("input",function(){batch[i]._confirmed=false;paint(i);});e.addEventListener("change",function(){batch[i]._confirmed=false;paint(i);});});
});

box.classList.add("massImportMode");
$("loadModalTitle").textContent="📦 Add "+loads.length+" Loads";
body.classList.remove("hidden");
modal.classList.remove("hidden");
modal.style.display="flex";
modal.setAttribute("aria-hidden","false");

$("loadModalBatchAddBtn")?.addEventListener("click",addBatch);
$("loadModalBatchCancelBtn")?.addEventListener("click",closeBatch);
footer();
}
function read(i){
var c=document.querySelector(".esmBatchCard[data-index='"+i+"']"),l=batch[i];
if(!c)return;
l.date=c.querySelector(".esmBatchDate").value;
l.division=c.querySelector(".esmBatchDepartment").value;
l.vrid=c.querySelector(".esmBatchVrid").value.trim();
l.from=c.querySelector(".esmBatchFrom")?.value.trim()||"";
l.to=c.querySelector(".esmBatchTo")?.value.trim()||"";
l.price=c.querySelector(".esmBatchPrice").value;
l.pricePerMile=c.querySelector(".esmBatchPpm").value;
l.bookedBy=c.querySelector(".esmBatchBookedBy").value.trim();
l.driver=c.querySelector(".esmBatchDriverInput")?.value.trim()||"";
}
function paint(i){
var c=document.querySelector(".esmBatchCard[data-index='"+i+"']"),l=batch[i];
if(!c)return;
c.classList.toggle("confirmed",l._confirmed);
c.querySelector(".esmBatchStatus").textContent=l._confirmed?"🟢 Confirmed":"⚪ Not confirmed";
c.querySelector(".esmBatchConfirm").textContent=l._confirmed?"↩ Unconfirm":"✓ Confirm this load";
footer();
}
function footer(){
var n=batch.length,k=batch.filter(function(x){return x._confirmed;}).length;
var status=$("loadModalBatchStatus"),btn=$("loadModalBatchAddBtn");
if(status)status.textContent=k+"/"+n+" confirmed";
if(btn)btn.disabled=!(n&&k===n);
}
async function addBatch(){
if(!batch.length||batch.some(function(x){return !x._confirmed;}))return;
var seen={};
for(var i=0;i<batch.length;i++){
var l=batch[i];
if(!l.vrid||seen[l.vrid.toUpperCase()]||!l.date||!l.division||!l.price||Number(l.price)<=0||(l.vridType!=="Trip"&&(!l.from||!l.to))||(l.driver&&!getBatchDrivers(l.division).some(function(n){return String(n).toLowerCase()===String(l.driver).toLowerCase();}))){
alert("Complete required fields and make sure every VRID is unique.");return;
}
seen[l.vrid.toUpperCase()]=1;
}
var reserved=[];
try{
for(var j=0;j<batch.length;j++){
var l=batch[j],ok=await window.reserveVrid(l.vrid,{loadId:null,uid:RelayDesk.currentUser});
if(!ok)throw new Error("VRID already in use: "+l.vrid);
reserved.push(l.vrid);
}
batch.forEach(function(l,i){
window.saveLoad({id:Date.now()+i,date:l.date,price:l.price,pricePerMile:l.pricePerMile||"",division:l.division,from:l.vridType==="Trip"?"":l.from,to:l.vridType==="Trip"?"":l.to,driver:l.driver||"",vridType:l.vridType||"Load",vrid:l.vrid,stops:l.stops||[],includeStopsInReport:!!(l.stops&&l.stops.length),bookedBy:l.bookedBy||RelayDesk.currentUser,note:""});
});
closeBatch();
}catch(e){reserved.forEach(function(v){window.releaseVrid&&window.releaseVrid(v);});alert(e.message||"Mass import failed.");}
}
function closeBatch(){
var m=$("loadModal"),box=m&&m.querySelector(".modalBox"),b=$("loadModalBatchBody");
if(b)b.classList.add("hidden");
if(box)box.classList.remove("massImportMode");
if(m){m.classList.add("hidden");m.style.display="none";}
batch=[];
$("loadModalTitle").textContent="📦 Add Load";
}
function locInit(){var f=$("loadModalFrom"),t=$("loadModalTo");if(!f||!t)return;var d=$("esmLocationOptions");if(!d){d=document.createElement("datalist");d.id="esmLocationOptions";document.body.appendChild(d);}f.setAttribute("list","esmLocationOptions");t.setAttribute("list","esmLocationOptions");loadLoc();window.addEventListener("esm:loadSaved",function(e){var l=e.detail||{};[l.from,l.to].forEach(function(v){if(v)remember(v);});});}
async function loadLoc(){try{var q=await db.collection("facilityLocations").orderBy("usageCount","desc").limit(200).get();var d=$("esmLocationOptions");if(d){d.innerHTML="";q.docs.forEach(function(x){var o=document.createElement("option");o.value=x.id;d.appendChild(o);});}}catch(e){console.warn(e);}}
async function remember(v){v=String(v||"").trim().toUpperCase();if(!v)return;try{var r=db.collection("facilityLocations").doc(v);await r.set({code:v,usageCount:firebase.firestore.FieldValue.increment(1),lastUsedAt:Date.now()},{merge:true});}catch(e){console.warn(e);}}
window.ESMAssistant={parse:parse,openBatch:openBatch};
window.addEventListener("DOMContentLoaded",function(){locInit();var launcher=$("esmAssistantLauncher"),panel=$("esmAssistantPanel"),runBtn=$("esmAssistantRunBtn"),input=$("esmAssistantInput"),dash=$("dashboardScreen"),dock=$("esmAssistantDock");function syncVisibility(){if(!dock||!dash)return;dock.classList.toggle("hidden",dash.classList.contains("hidden"));if(dash.classList.contains("hidden")&&panel)panel.classList.add("hidden");}launcher&&launcher.addEventListener("click",function(){panel&&panel.classList.contains("hidden")?openAI():closeAI();});$("esmAssistantCloseBtn")?.addEventListener("click",closeAI);runBtn&&runBtn.addEventListener("click",run);input&&input.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();run();}});$("loadModalBatchAddBtn")?.addEventListener("click",addBatch);$("loadModalBatchCancelBtn")?.addEventListener("click",closeBatch);syncVisibility();if(dash&&window.MutationObserver){new MutationObserver(syncVisibility).observe(dash,{attributes:true,attributeFilter:["class"]});}});
})();