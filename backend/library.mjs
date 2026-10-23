import { createReadStream } from 'node:fs';
import { readdir, stat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, extname, join } from 'node:path';
import { parseFile } from 'music-metadata';

async function* walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile() && extname(path).toLowerCase() === '.mp3') yield path;
  }
}

export async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function importFolder(directory, database, onProgress = () => {}) {
  const root = await realpath(directory);
  if (!(await stat(root)).isDirectory()) throw new Error('Seleccioná una carpeta.');
  const report = { imported: 0, duplicates: 0, failed: 0, scanned: 0, errors: [], ids: [] };
  for await (const file of walk(root)) {
    if (report.scanned >= 20000)
      throw new Error(
        'Se alcanzó el límite de 20.000 archivos por importación. Seleccioná carpetas más pequeñas.',
      );
    report.scanned++;
    try {
      // Read-only: metadata is never written to the source MP3.
      const metadata = await parseFile(file, { duration: true, skipCovers: true });
      const hash = await hashFile(file);
      const duration =
        Number.isFinite(metadata.format.duration) && metadata.format.duration > 0
          ? metadata.format.duration
          : null;
      if (!duration) throw new Error('No se pudo verificar la duración del MP3.');
      const bpm =
        metadata.common.bpm >= 20 && metadata.common.bpm <= 400 ? metadata.common.bpm : null;
      const t = database.addTrack({
        path: file,
        hash,
        title: metadata.common.title || basename(file, extname(file)),
        artist: metadata.common.artist,
        genre: metadata.common.genre?.join(', ') || '',
        bpm,
        bpmSource: bpm ? 'tag ID3' : null,
        duration,
      });
      if (t) {
        report.imported++;
        report.ids.push(t.id);
      } else report.duplicates++;
    } catch (error) {
      report.failed++;
      if (report.errors.length < 20) report.errors.push(`${basename(file)}: ${error.message}`);
    }
    onProgress({
      ...report,
      errors: [...report.errors],
      ids: undefined,
      currentFile: basename(file),
    });
  }
  return report;
}

export function exportM3U(tracks) {
  const real = tracks.filter((t) => !t.isDemo && t.path);
  if (!real.length) throw new Error('La playlist no contiene archivos MP3 reales para exportar.');
  if (real.some((t) => /[\r\n]/.test(t.path)))
    throw new Error(
      'Un nombre de archivo contiene saltos de línea y no puede representarse en M3U. Renombralo antes de exportar.',
    );
  const safe = (s) => String(s).replace(/[\r\n]/g, ' ');
  return (
    '#EXTM3U\n' +
    real
      .map(
        (t) =>
          `#EXTINF:${Math.round(t.duration || -1)},${safe(t.artist)} - ${safe(t.title)}\n${t.path}`,
      )
      .join('\n') +
    '\n'
  );
}
