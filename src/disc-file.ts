import type { DolphinModule } from './dolphin-adapter';
const mountpoint = '/wiionline-disc';
export function supportsDiscFiles(module: DolphinModule): boolean {
  return !!module.WORKERFS && ['mkdir','mount','unmount','rmdir'].every(name => typeof module.FS[name as keyof DolphinModule['FS']] === 'function');
}
/** WORKERFS reads File.slice() synchronously on demand, without copying a whole RVZ to MEMFS. */
export async function mountRvz(module: DolphinModule, file: File) {
  if (!supportsDiscFiles(module)) throw new Error('Dieser Kern enthält keinen Dateileser für große RVZ-Abbilder.');
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (header.length !== 4 || header[0] !== 0x52 || header[1] !== 0x56 || header[2] !== 0x5a || header[3] !== 1) throw new Error('Die Datei hat keinen gültigen RVZ-Dateikopf.');
  const fs = module.FS;
  fs.mkdir!(mountpoint);
  try {
    // Stable alias: the user's filename is never interpreted as a virtual path.
    fs.mount!(module.WORKERFS, { blobs: [{ name: 'disc.rvz', data: file }] }, mountpoint);
  } catch (error) {
    fs.rmdir!(mountpoint);
    throw error;
  }
  let released = false;
  return {
    path: `${mountpoint}/disc.rvz`,
    release() {
      if (released) return;
      fs.unmount!(mountpoint);
      fs.rmdir!(mountpoint);
      released = true;
    },
  };
}
