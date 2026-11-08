import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountRvz} from '../src/disc-file';
import {type DolphinModule} from '../src/dolphin-adapter';
function fixture() {
  const calls: string[]=[];let options: unknown;
  const module={WORKERFS:{},FS:{mkdir:(p:string)=>calls.push(`mkdir:${p}`),mount:(_t:unknown,o:unknown,p:string)=>{options=o;calls.push(`mount:${p}`);},unmount:(p:string)=>calls.push(`unmount:${p}`),rmdir:(p:string)=>calls.push(`rmdir:${p}`)}} as unknown as DolphinModule;
  return {module,calls,options:()=>options};
}
function rvz() {
  let wholeRead=false;
  const file={name:'game.rvz',size:5*1024**3,slice:()=>new Blob([new Uint8Array([82,86,90,1])]),arrayBuffer:async()=>{wholeRead=true;throw new Error('must not copy RVZ');}} as unknown as File;
  return {file,wholeRead:()=>wholeRead};
}
test('multi-gigabyte RVZ mounts the original file and never reads it in full',async()=>{
  const f=fixture(),r=rvz();const staged=await mountRvz(f.module,r.file);
  assert.equal(staged.path,'/wiionline-disc/disc.rvz');
  assert.equal((f.options() as {blobs:{data:File}[]}).blobs[0].data,r.file);
  assert.equal(r.wholeRead(),false);
  staged.release();staged.release();
  assert.deepEqual(f.calls,['mkdir:/wiionline-disc','mount:/wiionline-disc','unmount:/wiionline-disc','rmdir:/wiionline-disc']);
});
test('invalid RVZ signature fails before mounting',async()=>{
  const f=fixture();const file=new File([new Uint8Array([0,0,0,0])],'bad.rvz');
  await assert.rejects(mountRvz(f.module,file),/RVZ-Dateikopf/);assert.deepEqual(f.calls,[]);
});
test('mount failure removes only its empty mountpoint',async()=>{
  const f=fixture();f.module.FS.mount=()=>{throw new Error('reader failed');};
  await assert.rejects(mountRvz(f.module,rvz().file),/reader failed/);
  assert.deepEqual(f.calls,['mkdir:/wiionline-disc','rmdir:/wiionline-disc']);
});
