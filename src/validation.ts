import type { CoreInfo } from './protocol';
export function validateFile(file: Pick<File, 'name' | 'size'>, core: CoreInfo): string | null {
  if (file.size === 0) return 'Die Datei ist leer.';
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!core.formats.includes(extension)) return `Dieser Kern unterstützt: ${core.formats.join(', ')}.`;
  return null;
}
