import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const mapTrack = (row) =>
  row
    ? {
        id: row.id,
        path: row.path,
        hash: row.hash,
        title: row.title,
        artist: row.artist,
        genre: row.genre,
        bpm: row.bpm,
        duration: row.duration,
        cueSeconds: row.cue_seconds,
        cueSource: row.cue_source,
        bpmSource: row.bpm_source,
        favorite: Boolean(row.favorite),
        isDemo: Boolean(row.is_demo),
      }
    : null;

export class LibraryDatabase {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY, path TEXT UNIQUE, hash TEXT UNIQUE,
        title TEXT NOT NULL, artist TEXT NOT NULL, genre TEXT NOT NULL DEFAULT '',
        bpm REAL, duration REAL, cue_seconds REAL, cue_source TEXT, bpm_source TEXT,
        favorite INTEGER NOT NULL DEFAULT 0, is_demo INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS playlists (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS playlist_tracks (
        playlist_id TEXT NOT NULL REFERENCES playlists(id), track_id TEXT NOT NULL REFERENCES tracks(id),
        position INTEGER NOT NULL, PRIMARY KEY (playlist_id, track_id)
      );
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, track_id TEXT NOT NULL REFERENCES tracks(id),
        played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, mode TEXT NOT NULL,
        identity_source TEXT NOT NULL DEFAULT 'unknown', deck_id INTEGER, load_token TEXT,
        UNIQUE(session_id, track_id, mode)
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY, time TEXT NOT NULL, level TEXT NOT NULL, message TEXT NOT NULL
      );
      INSERT OR IGNORE INTO playlists (id, name) VALUES ('default', 'Fiesta argentina');
    `);
    // Migrate only our own library. Keep every old history row and its timestamp.
    if (
      !this.db
        .prepare('PRAGMA table_info(history)')
        .all()
        .some((c) => c.name === 'identity_source')
    ) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(`
          ALTER TABLE history RENAME TO history_v1;
          CREATE TABLE history (
            id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, track_id TEXT NOT NULL REFERENCES tracks(id),
            played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, mode TEXT NOT NULL,
            identity_source TEXT NOT NULL DEFAULT 'unknown', deck_id INTEGER, load_token TEXT,
            UNIQUE(session_id, track_id, mode)
          );
          INSERT INTO history (id,session_id,track_id,played_at,mode,identity_source)
            SELECT id,session_id,track_id,played_at,mode,
              CASE WHEN mode='simulation' THEN 'simulation' ELSE 'unknown' END FROM history_v1;
          DROP TABLE history_v1;
          COMMIT;
        `);
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
  }
  getTrack(id) {
    return mapTrack(this.db.prepare('SELECT * FROM tracks WHERE id=?').get(id));
  }
  tracks({ includeDemo = true } = {}) {
    return this.db
      .prepare('SELECT * FROM tracks WHERE (? = 1 OR is_demo=0) ORDER BY is_demo, artist, title')
      .all(Number(includeDemo))
      .map(mapTrack);
  }
  addTrack(t) {
    const id = t.id || randomUUID();
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO tracks
      (id,path,hash,title,artist,genre,bpm,duration,cue_seconds,cue_source,bpm_source,is_demo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        t.path ?? null,
        t.hash ?? null,
        t.title,
        t.artist || 'Artista desconocido',
        t.genre || '',
        t.bpm ?? null,
        t.duration ?? null,
        t.cueSeconds ?? null,
        t.cueSource ?? null,
        t.bpmSource ?? null,
        Number(Boolean(t.isDemo)),
      );
    return result.changes ? this.getTrack(id) : null;
  }
  updateTrack(id, patch) {
    const track = this.getTrack(id);
    if (!track) throw new Error('Canción no encontrada.');
    const next = { ...track };
    for (const k of ['title', 'artist', 'genre']) {
      if (k in patch) {
        if (
          typeof patch[k] !== 'string' ||
          patch[k].length > 300 ||
          (k !== 'genre' && !patch[k].trim())
        )
          throw new Error('Nombre o género inválido.');
        next[k] = patch[k].trim();
      }
    }
    if ('favorite' in patch) {
      if (typeof patch.favorite !== 'boolean') throw new Error('Favorito inválido.');
      next.favorite = patch.favorite;
    }
    if ('bpm' in patch) {
      if (patch.bpm !== null && (!Number.isFinite(patch.bpm) || patch.bpm < 20 || patch.bpm > 400))
        throw new Error('Los BPM deben estar entre 20 y 400.');
      next.bpm = patch.bpm;
      next.bpmSource = patch.bpm === null ? null : 'manual';
    }
    if ('cueSeconds' in patch) {
      if (
        patch.cueSeconds !== null &&
        (!Number.isFinite(patch.cueSeconds) ||
          patch.cueSeconds < 0 ||
          !track.duration ||
          patch.cueSeconds >= track.duration)
      )
        throw new Error('El CUE debe estar dentro de la duración conocida del archivo.');
      next.cueSeconds = patch.cueSeconds;
      next.cueSource = patch.cueSeconds === null ? null : 'manual';
    }
    this.db
      .prepare(
        'UPDATE tracks SET title=?,artist=?,genre=?,bpm=?,bpm_source=?,cue_seconds=?,cue_source=?,favorite=? WHERE id=?',
      )
      .run(
        next.title,
        next.artist,
        next.genre,
        next.bpm,
        next.bpmSource,
        next.cueSeconds,
        next.cueSource,
        Number(next.favorite),
        id,
      );
    return this.getTrack(id);
  }
  playlists() {
    return this.db.prepare('SELECT * FROM playlists ORDER BY rowid').all();
  }
  assertPlaylist(id) {
    if (!this.db.prepare('SELECT id FROM playlists WHERE id=?').get(id))
      throw new Error('Playlist no encontrada.');
  }
  createPlaylist(name) {
    if (typeof name !== 'string' || !name.trim() || name.length > 100)
      throw new Error('Ingresá un nombre de hasta 100 caracteres.');
    const id = randomUUID();
    this.db.prepare('INSERT INTO playlists VALUES (?,?)').run(id, name.trim());
    return id;
  }
  queue(id) {
    this.assertPlaylist(id);
    return this.db
      .prepare(
        'SELECT t.* FROM playlist_tracks p JOIN tracks t ON t.id=p.track_id WHERE p.playlist_id=? ORDER BY p.position, p.rowid',
      )
      .all(id)
      .map(mapTrack);
  }
  setQueue(id, ids) {
    this.assertPlaylist(id);
    if (
      !Array.isArray(ids) ||
      ids.length > 20000 ||
      new Set(ids).size !== ids.length ||
      ids.some((t) => typeof t !== 'string' || !this.getTrack(t))
    )
      throw new Error('La playlist contiene canciones inválidas o repetidas.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM playlist_tracks WHERE playlist_id=?').run(id);
      const insert = this.db.prepare('INSERT INTO playlist_tracks VALUES (?,?,?)');
      ids.forEach((track, i) => insert.run(id, track, i));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  played(session, mode = 'simulation') {
    return new Set(
      this.db
        .prepare('SELECT track_id FROM history WHERE session_id=? AND mode=?')
        .all(session, mode)
        .map((r) => r.track_id),
    );
  }
  recordPlay(
    session,
    id,
    mode,
    {
      source = mode === 'simulation' ? 'simulation' : 'unknown',
      deckId = null,
      loadToken = null,
    } = {},
  ) {
    const result = this.db
      .prepare(
        'INSERT OR IGNORE INTO history (session_id,track_id,mode,identity_source,deck_id,load_token) VALUES (?,?,?,?,?,?)',
      )
      .run(session, id, mode, source, deckId, loadToken);
    return Boolean(result.changes);
  }
  history() {
    return this.db
      .prepare(
        'SELECT h.*,t.title,t.artist FROM history h JOIN tracks t ON t.id=h.track_id ORDER BY h.id DESC LIMIT 200',
      )
      .all();
  }
  getSetting(key, fallback) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    try {
      return row ? JSON.parse(row.value) : fallback;
    } catch {
      return fallback;
    }
  }
  setSetting(key, value) {
    this.db
      .prepare(
        'INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, JSON.stringify(value));
  }
  log(level, message) {
    this.db
      .prepare('INSERT INTO events (time,level,message) VALUES (?,?,?)')
      .run(new Date().toISOString(), level, String(message).slice(0, 2000));
    this.db.exec('DELETE FROM events WHERE id <= (SELECT COALESCE(MAX(id),0)-1000 FROM events)');
  }
  events() {
    return this.db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 80').all();
  }
  close() {
    this.db.close();
  }
}
