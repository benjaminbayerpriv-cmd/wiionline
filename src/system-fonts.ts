import type {DolphinModule} from './dolphin-adapter';
export async function loadSystemFonts(module:DolphinModule) {
  if (!module.FS.mkdirTree) throw new Error('Im Kern fehlt die Dateisystem-Verzeichnisfunktion.');
  const names=['font_western.bin','font_japanese.bin'];
  const assets=await Promise.all(names.map(async name=>{
    const response=await fetch(`/core/sys/GC/${name}`);
    if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error(`Die mitgelieferte Dolphin-Schrift ${name} fehlt.`);
    return new Uint8Array(await response.arrayBuffer());
  }));
  module.FS.mkdirTree('/dolphin-sys/GC');
  names.forEach((name,index)=>module.FS.writeFile(`/dolphin-sys/GC/${name}`,assets[index]));
}
