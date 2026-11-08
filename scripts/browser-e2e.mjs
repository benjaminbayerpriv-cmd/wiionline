// Echte Browser-Pruefung ueber Chrome DevTools Protocol (headless, eigenes Profil).
// Voraussetzung: npm run build && npm run test:browser:stage && npm run preview (Port 4173), Kern installiert.
// Aufruf: node scripts/browser-e2e.mjs [basis-url] [pfad/zur/xfb-bars.dol]
// Nachweis: (1) Seite laedt, Kern initialisiert, DOL bootet, Bild mit acht Graustufen; (2) echte Maus-/Tastaturereignisse
// (CDP Input.dispatch*) -> DOM-Handler -> Adapter -> Wiimote -> Gastspeicher des libogc-WPAD-Homebrews. Kein Geschwindigkeitstest.
import { spawn } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
async function launch(url){
  const port = 9300 + Math.floor(Math.random()*500);
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "wii-chrome-"));
  const p = spawn(chrome, ["--headless=new",`--remote-debugging-port=${port}`,`--user-data-dir=${prof}`,"--no-first-run","--no-default-browser-check","--disable-background-timer-throttling","--disable-renderer-backgrounding","--window-size=1280,900","about:blank"],{stdio:"ignore"});
  const sleep = ms=>new Promise(r=>setTimeout(r,ms));
  let targets; for(let i=0;i<50;i++){try{targets=await (await fetch(`http://127.0.0.1:${port}/json`)).json();if(targets.find(t=>t.type==="page"))break;}catch{}await sleep(200);}
  const page=targets.find(t=>t.type==="page"); const ws=new WebSocket(page.webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
  let id=0; const pend=new Map(); const events=[];
  ws.onmessage=m=>{const d=JSON.parse(m.data); if(d.id&&pend.has(d.id)){pend.get(d.id)(d);pend.delete(d.id);} else events.push(d);};
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async(expr)=>{const r=await send("Runtime.evaluate",{expression:expr,returnByValue:true,awaitPromise:true}); if(r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value;};
  await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable");
  await send("Page.navigate",{url});
  const close=()=>{try{ws.close()}catch{} p.kill("SIGKILL"); try{fs.rmSync(prof,{recursive:true,force:true})}catch{};};
  return {send,ev,sleep,events,close};
}

import {fileURLToPath} from "node:url";
const base=process.argv[2]||"http://127.0.0.1:4173"; const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const dol=process.argv[3]||path.join(root,"graphics/homebrew/xfb-bars.dol");
let failed=0; const ok=(n,p,d)=>{if(!p)failed++;console.log(p?"PASS":"FAIL",n,d===undefined?"":JSON.stringify(d));};

async function appTest(){
  const b=await launch(base+"/");
  try{

  const {send,ev,sleep}=b;
  await sleep(3000);
  console.log("isolated:",await ev("crossOriginIsolated"));
  for(let i=0;i<60;i++){ if(await ev("!document.querySelector('#file').disabled")) break; await sleep(1000);}
  console.log("status:",await ev("document.querySelector('#status').textContent"));
  console.log("core:",await ev("document.querySelector('#core-info').textContent"));
  const doc=await send("DOM.getDocument"); const q=await send("DOM.querySelector",{nodeId:doc.result.root.nodeId,selector:"#file"});
  await send("DOM.setFileInputFiles",{nodeId:q.result.nodeId,files:[dol]});
  for(let i=0;i<60;i++){ if(await ev("!document.querySelector('#start').disabled")) break; await sleep(500);}
  console.log("after load:",await ev("document.querySelector('#status').textContent"));
  const r=await ev("(()=>{document.querySelector('#start').scrollIntoView();const b=document.querySelector('#start').getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]})()");
  for(const t of ["mousePressed","mouseReleased"]) await send("Input.dispatchMouseEvent",{type:t,x:r[0],y:r[1],button:"left",clickCount:1});
  for(let i=0;i<40;i++){ if(await ev("document.querySelector('#empty').hidden")) break; await sleep(500);} await sleep(2000);
  console.log("start:",await ev("document.querySelector('#start').disabled+' '+document.querySelector('#start').textContent+' empty.hidden='+document.querySelector('#empty').hidden"));
  console.log("after start:",await ev("document.querySelector('#status').textContent"));
  console.log("canvas:",JSON.stringify(await ev(`(()=>{const c=document.querySelector('#display');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;const s=new Set();for(let i=0;i<d.length;i+=4*97)s.add(d[i]+','+d[i+1]+','+d[i+2]);return {w:c.width,h:c.height,distinct:s.size,sample:[...s].slice(0,12)}})()`)));
  console.log("log:",(await ev("document.querySelector('#log').textContent")).split("\n").slice(-12).join("\n"));
  

    const c=await ev("(()=>{const c=document.querySelector('#display');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;const s=new Set();for(let i=0;i<d.length;i+=4)s.add(d[i]);return {w:c.width,h:c.height,gray:s.size}})()");
    ok("App: Kern initialisiert, DOL laeuft, Bild mit 8 Graustufen",(await ev("document.querySelector('#status').textContent"))==="Emulation läuft."&&c.gray===8,c);
  }finally{b.close();}
}
async function inputTest(){
  const results=[];const rec=(n,p,d)=>{results.push(p);ok(n,p,d);};
  const b=await launch(base+"/diagnostics/wpad/index.html");
  try{
  const {send,ev,sleep}=b; await sleep(1500);
  const rect=async sel=>ev(`(()=>{const e=document.querySelector('${sel}');e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height}})()`);
  const click=async(sel)=>{const r=await rect(sel);for(const t of ["mousePressed","mouseReleased"])await send("Input.dispatchMouseEvent",{type:t,x:r.x+r.w/2,y:r.y+r.h/2,button:"left",buttons:t=="mousePressed"?1:0,clickCount:1});};
  await ev("window.P=[];const o=Worker.prototype.postMessage;Worker.prototype.postMessage=function(m,...r){if(m&&m.type==='input')P.push(JSON.stringify(m.input));return o.call(this,m,...r)};0");
  await click("#interactive");
  for(let i=0;i<120;i++){ if((await ev("document.querySelector('#interactive-status').textContent")).startsWith("Gast bereit"))break; await sleep(500);}
  console.log("status:",await ev("document.querySelector('#interactive-status').textContent"));
  let want=null;const gs=async()=>{let g;for(let i=0;i<30;i++){await sleep(200);g=JSON.parse(await ev("document.querySelector('#guest-state').textContent||'{}'"));if(!want||want(g))break;}want=null;return g;};
  const live=async()=>{await sleep(400);return ev("document.querySelector('#guest-state').textContent");};
  // pointer hover
  const r=await rect("#input-plane"); const cx=r.x+r.w/2, cy=r.y+r.h/2;
  const mouse=(type,x,y,button="none",buttons=0)=>send("Input.dispatchMouseEvent",{type,x,y,button,buttons,clickCount:1});
  await mouse("mouseMoved",cx,cy); want=g=>g.dots?.some(d=>d.visible); let g=await gs();
  rec("Hover zeigt IR-Punkte im Gast",g.dots?.some(d=>d.visible),g.dots);
  const xs=g.dots.filter(d=>d.visible).map(d=>d.x);
  await mouse("mouseMoved",r.x+r.w*0.3,cy); want=g=>g.dots.filter(d=>d.visible)[0]?.x<xs[0]-20; g=await gs(); const xs2=g.dots.filter(d=>d.visible).map(d=>d.x);
  want=null;rec("Zeiger nach links -> Gast-IR-X sinkt (libogc spiegelt X)",xs2[0]!==undefined&&xs[0]!==undefined&&Math.min(...xs2)<Math.min(...xs),{mitte:xs,links:xs2});
  await mouse("mouseMoved",cx,cy);
  await mouse("mousePressed",cx,cy,"left",1); want=g=>g.heldHex==="0x8"; g=await gs(); rec("Linke Maustaste -> A (0x8)",g.heldHex==="0x8",g.heldHex);
  await mouse("mousePressed",cx,cy,"right",3); want=g=>g.heldHex==="0xc"; g=await gs(); rec("Links+rechts gleichzeitig -> A+B (0xc)",g.heldHex==="0xc",g.heldHex);
  await mouse("mouseReleased",cx,cy,"left",2); want=g=>g.heldHex==="0x4"; g=await gs(); rec("Links loslassen -> nur B (0x4)",g.heldHex==="0x4",g.heldHex);
  await mouse("mouseReleased",cx,cy,"right",0); want=g=>g.heldHex==="0x0"; g=await gs(); rec("Alles loslassen -> 0",g.heldHex==="0x0",g.heldHex);
  const key=(type,code,key,vk)=>send("Input.dispatchKeyEvent",{type,code,key,windowsVirtualKeyCode:vk});
  await key("rawKeyDown","KeyX","x",88); want=g=>g.heldHex==="0x8"; g=await gs(); rec("Taste X -> A",g.heldHex==="0x8",g.heldHex);
  await key("rawKeyDown","KeyZ","z",90); want=g=>g.heldHex==="0xc"; g=await gs(); rec("X+Z -> A+B",g.heldHex==="0xc",g.heldHex);
  await key("keyUp","KeyX","x",88); await key("keyUp","KeyZ","z",90); want=g=>g.heldHex==="0x0"; g=await gs(); rec("Tasten loslassen -> 0",g.heldHex==="0x0",g.heldHex);
  await key("rawKeyDown","ArrowLeft","ArrowLeft",37); want=g=>g.heldHex==="0x100"; g=await gs(); rec("Pfeil links -> LEFT (0x100)",g.heldHex==="0x100",g.heldHex);
  // focus loss while key held and mouse hovering
  await key("keyUp","ArrowLeft","ArrowLeft",37); await mouse("mouseMoved",cx,cy); await key("rawKeyDown","KeyX","x",88); want=g=>g.heldHex==="0x8"&&g.dots.some(d=>d.visible); g=await gs(); rec("Vorbedingung: X gehalten, Zeiger sichtbar",g.heldHex==="0x8"&&g.dots.some(d=>d.visible),g.heldHex);
  await ev("document.querySelector('#focus-away').focus(); document.activeElement.id"); want=g=>g.heldHex==="0x0"&&g.dots.every(d=>!d.visible); g=await gs();
  rec("Fokusverlust (Canvas blur) -> neutral: keine Taste, kein IR-Punkt",g.heldHex==="0x0"&&g.dots.every(d=>!d.visible),{held:g.heldHex,dots:g.dots});
  await key("keyUp","KeyX","x",88);
}finally{b.close();}
}
await appTest(); await inputTest();
console.log(failed?`FEHLGESCHLAGEN: ${failed}`:"ALLE BESTANDEN"); process.exit(failed?1:0);
