import {DolphinAdapter,loadSystemFonts} from '/core/adapter.js';
const checks=[];const report={type:'result',pass:false,scope:'Browser -> production TypeScript adapter -> native Wiimote -> guest WPAD memory; no game-speed claim',checks};
const check=(name,pass,detail)=>{checks.push({name,pass:!!pass,detail});postMessage({type:'check',name,pass:!!pass});};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let liveAdapter,liveGuest,liveTimer,lastNonzero=0;
self.onmessage=async(event)=>{
 if(event.data.type==='input'){liveAdapter?.input(event.data.input);return;}
 if(event.data.type==='stop'){if(liveTimer)clearInterval(liveTimer);await liveAdapter?.stop();postMessage({type:'interactive-stopped'});return;}
 const interactive=event.data.type==='interactive';
 let adapter,M,ptr;
 try{
  const corePath='/core/dolphin-core-upstream.js';
  const [{default:create},meta,dol]=await Promise.all([import(/* @vite-ignore */ corePath),fetch(new URL('./wpad_test.json',import.meta.url)).then(r=>r.json()),fetch(new URL('./wpad_test.dol',import.meta.url)).then(r=>r.arrayBuffer())]);
  M=await create({locateFile:name=>`/core/${name}`,print:()=>{},printErr:message=>postMessage({type:'log',message})});
  await loadSystemFonts(M);
  adapter=new DolphinAdapter(M,event=>{if(event.type==='error')postMessage({type:'log',message:event.message});});
  await adapter.load(new File([dol],'wpad_test.dol'));await adapter.start();
  ptr=M._malloc(120);
  const guest=()=>{M.ccall('WiiOnline_CopyGuest','number',['number','number','number'],[meta.result_addr,ptr,120]);const view=new DataView(M.HEAPU8.slice(ptr,ptr+120).buffer);const u=i=>view.getUint32(i*4),s=i=>view.getInt32(i*4);return {magic:u(0),seq:u(1),probe:s(2),held:u(4),accel:[u(7),u(8),u(9)],dots:[0,1,2,3].map(i=>({visible:u(10+i),x:s(14+i),y:s(18+i)})),end:u(29)};};
  const until=async(predicate,timeout=8000)=>{const deadline=performance.now()+timeout;let last;while(performance.now()<deadline){M.ccall('PumpHostJobs',null,[],[]);last=guest();if(predicate(last))return last;await sleep(25);}throw new Error(`Gastzustand nicht erreicht: ${JSON.stringify(last)}`);};
  const input=(buttons=[],x=.5,y=.5,visible=false,accel)=>adapter.input({buttons,pointer:{x,y,visible},accel});
  liveAdapter=adapter;liveGuest=guest;
  const boot=await until(g=>g.magic===0x57504144&&g.end===0x454e4421&&g.seq>5,60000);
  check('Eigenes WPAD-Homebrew läuft im Wii-Gast',true,{seq:boot.seq});
  await until(g=>g.probe===0,15000);check('Gast meldet Wiimote 0 verbunden',true);
  if(interactive){
   liveTimer=setInterval(()=>{const guest=liveGuest();if(guest.held)lastNonzero=guest.held;postMessage({type:'guest-state',guest,lastNonzero});},50);
   postMessage({type:'interactive-ready'});return;
  }
  const expected={A:0x8,B:0x4,ONE:0x2,TWO:0x1,PLUS:0x1000,MINUS:0x10,HOME:0x80,UP:0x800,DOWN:0x400,LEFT:0x100,RIGHT:0x200};
  for(const [name,mask] of Object.entries(expected)){input([name]);const g=await until(g=>g.held===mask);check(`Gast empfängt ${name} über den TypeScript-Adapter`,true,{held:g.held});}
  input(Object.keys(expected));const all=Object.values(expected).reduce((a,b)=>a|b,0);await until(g=>g.held===all);check('Alle elf Tasten gemeinsam',true);
  input();await until(g=>g.held===0);check('Loslassen: Gast hat keine gehaltene Taste',true);
  const geometry={};
  for(const [name,x,y] of [['Mitte',.5,.5],['links-oben',0,0],['rechts-oben',1,0],['links-unten',0,1],['rechts-unten',1,1]]){const old=guest().seq;input([],x,y,true);const g=await until(g=>g.seq>old+2&&g.dots[0].visible&&g.dots[1].visible);geometry[name]=g.dots;check(`Gast erhält IR-Punkte ${name}`,true,g.dots);}
  check('IR-Punkt 0 unterscheidet links/rechts und oben/unten',geometry['links-oben'][0].x!==geometry['rechts-oben'][0].x&&geometry['links-oben'][0].y!==geometry['links-unten'][0].y,geometry);
  input();await until(g=>!g.dots[0].visible&&!g.dots[1].visible);check('Unsichtbarer Zeiger erzeugt keine Gast-IR-Punkte',true);
  const seq=guest().seq;input([], .5,.5,false,{x:0,y:0,z:1});const neutral=await until(g=>g.seq>seq+2);input([], .5,.5,false,{x:1,y:0,z:1});const tilted=await until(g=>g.accel[0]>neutral.accel[0]);check('Beschleunigung x=+1 g erreicht den Gast',true,{neutral:neutral.accel,tilted:tilted.accel});
  input(['A']);await until(g=>g.held===expected.A);await adapter.pause();const paused=guest().seq;await adapter.start();await until(g=>g.seq>paused+2&&g.held===0&&!g.dots[0].visible);check('Pause/Fortsetzen setzt Eingaben neutral zurück',true);
  await adapter.stop();check('Produktiver Adapter stoppt und entlädt den Gast',true);
  report.boundaries=['Only slot 0; no extension or motion-gesture test','IR absolute X/Y and second-dot upper bits not asserted in this browser test','Keyboard DOM path/focus loss is not covered by automated adapter calls','No statement about Wii Play responsiveness or emulation speed'];
 }catch(error){check('Testlauf beendet',false,String(error?.stack||error));}
 finally{if(liveTimer)return;if(M&&ptr)M._free(ptr);report.passed=checks.filter(c=>c.pass).length;report.total=checks.length;report.pass=checks.length>=24&&checks.every(c=>c.pass);postMessage(report);}
};
