import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  AudioLines,
  Check,
  ChevronRight,
  CircleHelp,
  Disc3,
  Download,
  FolderPlus,
  Headphones,
  Library,
  ListMusic,
  LockKeyhole,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Star,
  Unplug,
  UnlockKeyhole,
  X,
} from 'lucide-react';
import './styles.css';
import Toggle from './components/Toggle.jsx';
import Deck from './components/Deck.jsx';
import { Modal, TrackEditor, Planner } from './components/editors.jsx';
import { time, bpm } from './format.js';

const api = window.copilot;
const navItems = [
  { id: 'booth', label: 'Cabina', icon: SlidersHorizontal },
  { id: 'library', label: 'Biblioteca', icon: Library },
  { id: 'set', label: 'Preparar set', icon: ListMusic },
  { id: 'connection', label: 'Conexión', icon: Radio },
  { id: 'activity', label: 'Actividad', icon: Activity },
];

function App() {
  const [state, setState] = useState(null);
  const [tab, setTab] = useState('booth');
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState(false);
  const [editing, setEditing] = useState(null);
  const [newPlaylist, setNewPlaylist] = useState(false);
  const [playlistName, setPlaylistName] = useState('');

  async function run(fn, success) {
    try {
      const result = await fn();
      if (success && result !== null) setToast({ kind: 'success', text: success });
      return { ok: true, result };
    } catch (error) {
      setToast({ kind: 'error', text: error.message });
      return { ok: false };
    }
  }
  const send = (action, payload) => run(() => api.command(action, payload));
  useEffect(() => {
    if (!api) return;
    const off = api.onState((update) => setState((previous) => ({ ...previous, ...update })));
    api
      .snapshot()
      .then(setState)
      .catch((error) => setToast({ kind: 'error', text: error.message }));
    return off;
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 10000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!api)
    return (
      <div className="startup">
        <AudioLines size={44} />
        <h1>DJ Copilot IA</h1>
        <p>
          Esta interfaz necesita la aplicación de escritorio para acceder a tu biblioteca y al
          simulador.
        </p>
        <code>npm run build && npm start</code>
      </div>
    );
  if (!state?.tracks)
    return (
      <div className="startup">
        <AudioLines size={44} />
        <h1>Abriendo tu cabina…</h1>
        {toast && <p role="alert">{toast.text}</p>}
      </div>
    );

  const simulation = state.connection.mode === 'simulation';
  const connected = state.connection.connected;
  const next = state.recommendation;
  const selectedPlaylist = state.playlists.find((p) => p.id === state.playlistId);
  const played = new Set(state.playedIds);
  const loaded = new Set(state.connection.decks.filter((d) => d.loaded).map((d) => d.trackId));
  const realTracks = state.tracks.filter((t) => !t.isDemo);
  const filtered = state.tracks.filter(
    (t) =>
      (!favorites || t.favorite) &&
      `${t.title} ${t.artist} ${t.genre} ${t.bpm ?? ''}`
        .toLocaleLowerCase('es')
        .includes(search.toLocaleLowerCase('es')),
  );
  const playingCount = state.connection.decks.filter((d) => d.playing).length;
  const canTransition = playingCount === 1 && state.connection.decks.every((d) => d.loaded);
  const pendingCount = state.queue.filter((t) => !played.has(t.id)).length;
  const queueSeconds = Math.max(
    0,
    state.queue.reduce(
      (s, t) => s + Math.min(t.duration ?? state.plan.songSeconds, state.plan.songSeconds),
      0,
    ) -
      Math.max(0, state.queue.length - 1) * state.plan.overlapSeconds,
  );

  const move = (id, delta) => {
    const ids = state.queue.map((t) => t.id),
      i = ids.indexOf(id),
      j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    send('queue.set', { ids });
  };
  const importMusic = () => run(() => api.importFolder());

  const renderPlaylist = ({ expanded = false } = {}) => (
    <section className="card playlist-panel">
      <div className="section-title">
        <div>
          <span className="eyebrow">TU RECORRIDO MUSICAL</span>
          <h2>
            Playlist de la sesión <span className="count">{state.queue.length}</span>
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label="Crear playlist"
          title="Crear playlist"
          onClick={() => setNewPlaylist(true)}
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="playlist-selector">
        <ListMusic size={16} />
        <select
          aria-label="Playlist activa"
          value={state.playlistId}
          onChange={(e) => send('playlist.select', { id: e.target.value })}
        >
          {state.playlists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span>{pendingCount} pendientes</span>
      </div>
      <div className={`queue-list ${expanded ? 'expanded' : ''}`}>
        {!state.queue.length && (
          <div className="empty compact">
            <ListMusic size={28} />
            <h3>Un buen set empieza con un tema</h3>
            <p>Agregá canciones desde tu biblioteca.</p>
            <button className="button" onClick={() => setTab('library')}>
              Ir a biblioteca <ArrowRight size={15} />
            </button>
          </div>
        )}
        {state.queue.map((track, i) => (
          <div
            key={track.id}
            className={`queue-row ${next?.track.id === track.id ? 'next' : ''} ${played.has(track.id) ? 'played' : ''}`}
          >
            <span className="queue-number">
              {played.has(track.id) ? <Check size={14} /> : String(i + 1).padStart(2, '0')}
            </span>
            <div className="queue-track">
              <strong title={track.title}>{track.title}</strong>
              <span>
                {track.artist}
                {track.isDemo && ' · DEMO'}
              </span>
            </div>
            <div className="queue-bpm">
              {bpm(track.bpm)}
              <small>BPM</small>
            </div>
            <span className={`queue-state ${next?.track.id === track.id ? 'accent' : ''}`}>
              {loaded.has(track.id)
                ? 'EN DECK'
                : played.has(track.id)
                  ? 'YA SONÓ'
                  : next?.track.id === track.id
                    ? 'SIGUIENTE'
                    : track.cueSeconds === null
                      ? 'SIN CUE'
                      : time(track.cueSeconds)}
            </span>
            <div className="row-actions">
              <button
                className="icon-button"
                aria-label={`Subir ${track.title}`}
                disabled={i === 0}
                onClick={() => move(track.id, -1)}
              >
                <ArrowUp size={13} />
              </button>
              <button
                className="icon-button"
                aria-label={`Bajar ${track.title}`}
                disabled={i === state.queue.length - 1}
                onClick={() => move(track.id, 1)}
              >
                <ArrowDown size={13} />
              </button>
              <button
                className="icon-button"
                aria-label={`Quitar ${track.title} de playlist`}
                onClick={() =>
                  send('queue.set', {
                    ids: state.queue.filter((t) => t.id !== track.id).map((t) => t.id),
                  })
                }
              >
                <X size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="playlist-footer">
        <span>
          {time(queueSeconds)} min estimados · {state.plan.overlapSeconds} s de transición
        </span>
        <button
          className="text-button"
          onClick={() => run(() => api.exportPlaylist(), 'Playlist exportada para Mixxx.')}
        >
          <Download size={13} /> Exportar M3U
        </button>
      </div>
    </section>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <AudioLines size={25} />
          </div>
          <div>
            DJ COPILOT<span>IA · ASISTENTE LOCAL</span>
          </div>
        </div>
        <span className="nav-label">ESPACIO DE TRABAJO</span>
        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={18} />
              {label}
              {id === 'library' && <span>{realTracks.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-session">
          <span className="eyebrow">SESIÓN ACTUAL</span>
          <div className="session-symbol">
            <Disc3 size={20} />
          </div>
          <strong>{selectedPlaylist?.name}</strong>
          <p>
            {state.plan.hours} horas planeadas
            <br />
            {pendingCount} temas pendientes
          </p>
          <div className="session-line">
            <i
              style={{ width: `${Math.min(100, (state.queue.length / state.plan.songs) * 100)}%` }}
            />
          </div>
          <small>
            {state.queue.length} / {state.plan.songs} temas estimados
          </small>
        </div>
        <div className="sidebar-bottom">
          <div>
            <span className="status-dot" />
            Funciona sin internet
          </div>
          <small>v0.1 · Hecho para acompañarte</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            DJ COPILOT <ChevronRight size={13} />
            <span>{navItems.find((n) => n.id === tab).label}</span>
          </div>
          <div className="topbar-right">
            <span className="pill">
              <ShieldCheck size={13} /> Preparación solamente
            </span>
            <span className={`mode-tag ${simulation ? 'sim' : connected ? 'live' : ''}`}>
              <i />
              {simulation
                ? 'SIMULACIÓN'
                : connected
                  ? 'MIDI · SOLO LECTURA'
                  : 'MIDI · SIN CONEXIÓN'}
            </span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {tab === 'booth' ? 'VOS LLEVÁS LA MEZCLA' : 'DJ COPILOT IA'}
              </span>
              <h1>
                {
                  {
                    booth: 'Tu cabina, en control.',
                    library: 'Tu biblioteca musical.',
                    set: 'Dale forma a la noche.',
                    connection: 'Conectá con Mixxx.',
                    activity: 'Cada paso, registrado.',
                  }[tab]
                }
              </h1>
              <p>
                {
                  {
                    booth: 'El próximo tema, listo. El momento de mezclar lo elegís vos.',
                    library: 'Organizá tus MP3 y guardá los puntos que escuchaste y verificaste.',
                    set: 'Ordená el recorrido y calculá cuánta música necesitás.',
                    connection: 'Un puente independiente que convive con tu Pioneer DDJ-200.',
                    activity: 'Preparaciones, bloqueos e historial de esta aplicación.',
                  }[tab]
                }
              </p>
            </div>
            <button className="button primary" onClick={importMusic} disabled={state.importing}>
              <FolderPlus size={16} />
              {state.importing
                ? `Importando ${state.importProgress?.scanned || 0}…`
                : 'Importar música'}
            </button>
          </div>
          {simulation ? (
            <div className="mode-banner">
              <div className="banner-icon">
                <Disc3 size={17} />
              </div>
              <div>
                <strong>Estás en el simulador</strong>
                <span>
                  Sin audio ni control de Mixxx.
                  {state.tracks.some((t) => t.isDemo)
                    ? ' Los temas DEMO usan BPM, duración y CUE ficticios.'
                    : ' Podés ensayar el flujo sin conectar equipos.'}
                </span>
              </div>
              <button className="text-button" onClick={() => setTab('connection')}>
                Configurar MIDI <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <div className="mode-banner midi">
              <Radio size={18} />
              <div>
                <strong>
                  {connected ? 'Monitor real de Mixxx · solo lectura' : 'Esperando conexión MIDI'}
                </strong>
                <span>{state.connection.message}</span>
              </div>
              <button className="text-button" onClick={() => send('mode', { mode: 'midi' })}>
                Reconectar
              </button>
            </div>
          )}

          {tab === 'booth' && (
            <>
              <div className="automation-strip">
                <div className="automation-title">
                  <div className={`automation-icon ${state.engine.auto ? 'enabled' : ''}`}>
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <strong>Preparación automática</strong>
                    <span>
                      {state.engine.pending
                        ? 'Verificando y preparando el próximo deck…'
                        : state.engine.auto
                          ? 'Activa · espera un deck libre y un CUE válido'
                          : 'Desactivada · prepará cada tema cuando quieras'}
                    </span>
                  </div>
                  <Toggle
                    checked={state.engine.auto}
                    label="Preparación automática"
                    disabled={!simulation}
                    onChange={(enabled) => send('auto', { enabled })}
                  />
                </div>
                <div className="safe-control">
                  <ShieldCheck size={16} />
                  <span>Modo seguro</span>
                  <Toggle
                    checked={state.engine.safeMode}
                    label="Modo seguro"
                    onChange={(enabled) => send('safeMode', { enabled })}
                  />
                </div>
              </div>
              <div className="decks-grid">
                {state.connection.decks.map((deck) => (
                  <Deck
                    key={deck.id}
                    deck={deck}
                    simulation={simulation}
                    connected={connected}
                    send={send}
                  />
                ))}
              </div>
              {simulation && (
                <div className="simulation-tools">
                  <span>
                    <CircleHelp size={13} />
                    Ensayo sin audio: los botones simulan tus acciones manuales.
                  </span>
                  <div>
                    <button
                      className="text-button"
                      disabled={playingCount > 0 || state.engine.pending}
                      onClick={() => send('demo')}
                    >
                      <Play size={13} />
                      Iniciar demo de 3 temas
                    </button>
                    <button
                      className="button small"
                      disabled={!canTransition || state.engine.pending}
                      onClick={() => send('sim.transition')}
                    >
                      <ArrowLeftRight size={14} />
                      Simular cambio de deck
                    </button>
                  </div>
                </div>
              )}
              <div className="lower-grid">
                <section className="card recommendation">
                  <div className="section-title">
                    <div>
                      <span className="eyebrow">UN PASO ADELANTE</span>
                      <h2>Próxima canción</h2>
                    </div>
                    <span className="recommend-icon">
                      <Headphones size={20} />
                    </span>
                  </div>
                  {next ? (
                    <>
                      <div className="next-art">
                        <Music2 size={34} strokeWidth={1} />
                        <span>EN TU PLAYLIST</span>
                        {next.track.isDemo && <b>DEMO</b>}
                      </div>
                      <h3>{next.track.title}</h3>
                      <p className="next-artist">{next.track.artist}</p>
                      <div className="next-metadata">
                        <span>
                          <strong>{bpm(next.track.bpm)}</strong> BPM
                        </span>
                        <i />
                        <span className={next.canMatch ? 'mint-text' : ''}>
                          {next.delta === null
                            ? 'Sin referencia'
                            : `${next.delta > 0 ? '+' : ''}${next.delta.toFixed(1)} BPM de diferencia`}
                        </span>
                      </div>
                      <div className="cue-line">
                        <span className="cue-label">CUE</span>
                        {next.cueLabel}
                        <button
                          className="icon-button"
                          title="Editar CUE de la canción"
                          aria-label="Editar CUE recomendado"
                          onClick={() => setEditing(next.track)}
                        >
                          <Settings2 size={14} />
                        </button>
                      </div>
                      <div className="transition-advice">
                        <span>
                          <Sparkles size={13} />
                          {next.technique}
                        </span>
                        <p>{next.explanation}</p>
                        {next.canMatch && (
                          <small>
                            Ajuste de tempo previsto: {next.tempoPercent > 0 ? '+' : ''}
                            {next.tempoPercent.toFixed(2)} %
                          </small>
                        )}
                      </div>
                      <button
                        className="button primary prepare-button"
                        disabled={!simulation || state.engine.pending || playingCount !== 1}
                        onClick={() => send('prepare')}
                      >
                        <AudioLines size={17} />
                        {state.engine.pending ? 'Preparando…' : 'Preparar siguiente'}
                        <ArrowRight size={16} />
                      </button>
                      <div className="recommendation-actions">
                        <button className="text-button" onClick={() => send('skip')}>
                          <SkipForward size={14} />
                          Saltar
                        </button>
                        <button className="text-button" onClick={() => setTab('library')}>
                          Elegir otro tema <ChevronRight size={13} />
                        </button>
                      </div>
                      {!simulation && (
                        <p className="small-note">
                          Cargá este tema manualmente desde la playlist exportada en Mixxx.
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="empty">
                      <Headphones size={32} />
                      <h3>El próximo tema te espera</h3>
                      <p>
                        Importá música y agregala a la playlist, o probá el escenario de
                        demostración.
                      </p>
                      <button className="button" onClick={() => setTab('library')}>
                        Abrir biblioteca <ArrowRight size={14} />
                      </button>
                      <button className="text-button" onClick={() => send('restoreSkipped')}>
                        Restaurar recomendaciones saltadas
                      </button>
                    </div>
                  )}
                </section>
                {renderPlaylist()}
              </div>
              <div className="principle">
                <ShieldCheck size={15} />
                <span>
                  Vos decidís cuándo reproducir. El copiloto no mueve faders, crossfader ni
                  ecualización.
                </span>
                <span>LOCAL / OFFLINE</span>
              </div>
            </>
          )}

          {tab === 'library' && (
            <section className="card library-panel">
              <div className="library-toolbar">
                <div className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="Buscar canciones"
                    placeholder="Buscar artista, tema, BPM o género…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button
                  className={`button ${favorites ? 'selected' : ''}`}
                  onClick={() => setFavorites(!favorites)}
                >
                  <Star size={15} />
                  Favoritos
                </button>
                <span>{filtered.length} canciones</span>
              </div>
              {state.importProgress && (
                <div className="import-report" role="status">
                  {state.importing ? 'Importando' : 'Última importación'}:{' '}
                  {state.importProgress.imported} nuevas · {state.importProgress.duplicates}{' '}
                  duplicadas · {state.importProgress.failed} errores
                  {state.importProgress.errors?.length > 0 && (
                    <details>
                      <summary>Ver archivos con errores</summary>
                      {state.importProgress.errors.map((error, i) => (
                        <p key={i}>{error}</p>
                      ))}
                    </details>
                  )}
                </div>
              )}
              {filtered.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th aria-label="Favorito" />
                        <th>CANCIÓN / ARTISTA</th>
                        <th>GÉNERO</th>
                        <th>BPM</th>
                        <th>DURACIÓN</th>
                        <th>CUE</th>
                        <th>ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((track) => (
                        <tr key={track.id}>
                          <td>
                            <button
                              className={`icon-button ${track.favorite ? 'accent' : ''}`}
                              aria-label={`${track.favorite ? 'Quitar favorito' : 'Favorito'} ${track.title}`}
                              onClick={() =>
                                send('track.update', {
                                  id: track.id,
                                  patch: { favorite: !track.favorite },
                                })
                              }
                            >
                              <Star size={15} fill={track.favorite ? 'currentColor' : 'none'} />
                            </button>
                          </td>
                          <td>
                            <strong className="table-title">
                              {track.title}
                              {track.isDemo && <span className="demo-label">DEMO</span>}
                            </strong>
                            <span className="table-artist">{track.artist}</span>
                          </td>
                          <td className="muted">{track.genre || 'Sin género'}</td>
                          <td className="mono" title={track.bpmSource || 'Sin dato'}>
                            {bpm(track.bpm)}
                          </td>
                          <td className="mono muted">{time(track.duration)}</td>
                          <td>
                            <button
                              className={`cue-edit ${track.cueSeconds === null ? 'missing' : ''}`}
                              onClick={() => setEditing(track)}
                            >
                              {track.cueSeconds === null ? '+ Guardar CUE' : time(track.cueSeconds)}
                              <Settings2 size={12} />
                            </button>
                          </td>
                          <td>
                            <div className="table-actions">
                              <button
                                className="icon-button"
                                title="Agregar a playlist"
                                aria-label={`Agregar ${track.title} a playlist`}
                                disabled={state.queue.some((t) => t.id === track.id)}
                                onClick={() => send('queue.add', { id: track.id })}
                              >
                                <Plus size={16} />
                              </button>
                              <button
                                className="icon-button"
                                title="Elegir como siguiente"
                                aria-label={`Recomendar ${track.title}`}
                                disabled={played.has(track.id) || loaded.has(track.id)}
                                onClick={() => send('selectNext', { id: track.id })}
                              >
                                <SkipForward size={16} />
                              </button>
                              <button
                                className="icon-button"
                                title="Editar metadatos y CUE"
                                aria-label={`Editar ${track.title}`}
                                onClick={() => setEditing(track)}
                              >
                                <Settings2 size={15} />
                              </button>
                              {simulation && (
                                <select
                                  aria-label={`Cargar ${track.title} en simulador`}
                                  value=""
                                  onChange={(e) => {
                                    if (e.target.value)
                                      send('sim.load', {
                                        deckId: Number(e.target.value),
                                        trackId: track.id,
                                      });
                                  }}
                                >
                                  <option value="">Deck…</option>
                                  <option value="1" disabled={state.connection.decks[0].playing}>
                                    Deck 1
                                  </option>
                                  <option value="2" disabled={state.connection.decks[1].playing}>
                                    Deck 2
                                  </option>
                                </select>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty large">
                  <div className="empty-icon">
                    <Library size={35} />
                  </div>
                  <h3>
                    {state.tracks.length ? 'No encontramos coincidencias' : 'Tu música empieza acá'}
                  </h3>
                  <p>
                    {state.tracks.length
                      ? 'Probá otro artista, título o BPM.'
                      : 'Elegí una carpeta con archivos MP3. Leemos sus metadatos y conservamos los originales intactos.'}
                  </p>
                  <button
                    className="button primary"
                    onClick={importMusic}
                    disabled={state.importing}
                  >
                    <FolderPlus size={16} />
                    Seleccionar carpeta
                  </button>
                </div>
              )}
              <div className="library-footnote">
                <ShieldCheck size={14} />
                Los BPM se leen de etiquetas o los ingresás vos. No se analizan beatgrids ni se
                inventan puntos CUE.
              </div>
            </section>
          )}

          {tab === 'set' && (
            <div className="set-grid">
              <div>
                <section className="card plan-card">
                  <span className="eyebrow">PLANIFICACIÓN LOCAL</span>
                  <h2>¿Cuánto va a durar la fiesta?</h2>
                  <Planner plan={state.plan} onSave={(payload) => send('plan', payload)} />
                  <div className="plan-estimate">
                    <strong>{state.plan.songs}</strong>
                    <div>
                      canciones estimadas<span>para {state.plan.hours} horas de música</span>
                    </div>
                  </div>
                  <p className="small-note">
                    Estimación con {state.plan.songSeconds} s por tema y {state.plan.overlapSeconds}{' '}
                    s de solapamiento. Con 2 min y transiciones de 10–30 s, cuatro horas necesitan
                    aproximadamente 131–160 temas. 136 corresponde a unos 14 s.
                  </p>
                </section>
                <section className="card session-card">
                  <ShieldCheck size={20} />
                  <h3>Una sesión sin repeticiones</h3>
                  <p>
                    {state.playedIds.length} temas registrados en esta sesión. El orden es manual;
                    todavía no hay selección por energía ni análisis armónico.
                  </p>
                  <button
                    className="button"
                    disabled={playingCount > 0 || state.engine.pending}
                    onClick={() => send('session.new')}
                  >
                    Crear nueva sesión
                  </button>
                  <small>Permite volver a recomendar temas. Conserva el historial.</small>
                </section>
              </div>
              {renderPlaylist({ expanded: true })}
            </div>
          )}

          {tab === 'connection' && (
            <div className="connection-grid">
              <section className="card connection-card">
                <div className="section-title">
                  <Radio size={25} />
                  <span className={`pill ${connected ? 'mint' : ''}`}>
                    <i />
                    {simulation
                      ? 'Simulador disponible'
                      : connected
                        ? 'Telemetría recibida'
                        : 'Sin telemetría'}
                  </span>
                </div>
                <h2>Elegí cómo trabajar</h2>
                <p>
                  La simulación permite probar la preparación completa. El puente real de este MVP
                  monitorea dos decks.
                </p>
                <button
                  className={`mode-choice ${simulation ? 'chosen' : ''}`}
                  onClick={() => send('mode', { mode: 'simulation' })}
                >
                  <Disc3 size={22} />
                  <div>
                    <strong>Simulador</strong>
                    <span>Preparación, tempo y CUE · sin audio</span>
                  </div>
                  {simulation && <Check size={20} />}
                </button>
                <button
                  className={`mode-choice ${!simulation ? 'chosen' : ''}`}
                  onClick={() => send('mode', { mode: 'midi' })}
                >
                  <Radio size={22} />
                  <div>
                    <strong>Mixxx por MIDI / ALSA</strong>
                    <span>BPM, reproducción, posición y CUE · solo lectura</span>
                  </div>
                  {!simulation && <Check size={20} />}
                </button>
                <div className="connection-message">
                  <span className="eyebrow">ESTADO DEL ADAPTADOR</span>
                  <p>{state.connection.message}</p>
                </div>
                {!simulation && (
                  <button className="button" onClick={() => send('mode', { mode: 'midi' })}>
                    <RotateCcw size={15} />
                    Reiniciar puente
                  </button>
                )}
                <div className="limit-setting">
                  <label htmlFor="tempo-limit">Límite de ajuste de tempo en simulación</label>
                  <select
                    id="tempo-limit"
                    value={state.engine.maxTempoPercent}
                    onChange={(e) => send('tempoLimit', { percent: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        ± {n} %
                      </option>
                    ))}
                  </select>
                </div>
              </section>
              <section className="card setup-card">
                <span className="eyebrow">MIXXX 2.5+ · UBUNTU</span>
                <h2>Un mapeo independiente</h2>
                <ol className="setup-steps">
                  <li>
                    <span>01</span>
                    <div>
                      <strong>Guardá los dos archivos del puente</strong>
                      <p>
                        Copialos a la carpeta de controladores de usuario de Mixxx. No reemplaces el
                        mapeo de la DDJ-200.
                      </p>
                      <button
                        className="button small"
                        onClick={() =>
                          run(() => api.saveMapping(), 'Mapeo guardado sin sobrescribir archivos.')
                        }
                      >
                        <Download size={14} />
                        Guardar copia del mapeo
                      </button>
                    </div>
                  </li>
                  <li>
                    <span>02</span>
                    <div>
                      <strong>Activá el monitor MIDI acá</strong>
                      <p>
                        Debe existir <code>/dev/snd/seq</code>. El puente crea el puerto virtual «DJ
                        Copilot IA» mientras la app está abierta.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>03</span>
                    <div>
                      <strong>Abrí las preferencias de Mixxx</strong>
                      <p>
                        En Controladores, habilitá el puerto virtual y elegí «DJ Copilot IA —
                        Monitor de solo lectura». Reiniciá Mixxx si el puerto no aparece.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>04</span>
                    <div>
                      <strong>Comprobá ambos decks</strong>
                      <p>
                        Al reproducir manualmente en Mixxx deberían llegar BPM, posición y estado.
                        Solo mostramos conexión después de recibir datos válidos de los dos decks.
                      </p>
                    </div>
                  </li>
                </ol>
                <div className="info-box">
                  <CircleHelp size={19} />
                  <p>
                    La API verificada no permite elegir un archivo por su ruta ni leer su título. La
                    carga automática real queda pendiente. Exportá una playlist M3U y cargá los
                    temas desde Mixxx.
                  </p>
                </div>
              </section>
            </div>
          )}

          {tab === 'activity' && (
            <div className="activity-grid">
              <section className="card">
                <div className="section-title">
                  <div>
                    <span className="eyebrow">DIAGNÓSTICO</span>
                    <h2>Registro de eventos</h2>
                  </div>
                  <Activity size={20} />
                </div>
                <div className="event-list">
                  {state.events.map((event) => (
                    <div key={event.id} className={`event ${event.level}`}>
                      <span className="event-dot" />
                      <div>
                        <p>{event.message}</p>
                        <time>{new Date(event.time).toLocaleString('es-AR')}</time>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="card">
                <div className="section-title">
                  <div>
                    <span className="eyebrow">HISTORIAL LOCAL</span>
                    <h2>Canciones reproducidas</h2>
                  </div>
                  <Disc3 size={20} />
                </div>
                {state.history.length ? (
                  <div className="history-list">
                    {state.history.map((item) => (
                      <div key={item.id}>
                        <Music2 size={18} />
                        <div>
                          <strong>{item.title}</strong>
                          <span>
                            {item.artist} · {item.mode === 'simulation' ? 'SIMULACIÓN' : 'MIDI'}
                          </span>
                          <small>
                            {new Date(`${item.played_at.replace(' ', 'T')}Z`).toLocaleString(
                              'es-AR',
                            )}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty">
                    <Disc3 size={30} />
                    <h3>Todavía no sonó ningún tema</h3>
                    <p>
                      El monitor MIDI v1 no identifica títulos y no registra canciones reales por
                      suposición.
                    </p>
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
        <footer className="app-footer">
          <span>
            <span className={`status-dot ${connected ? '' : 'offline'}`} />
            {simulation
              ? 'Motor local · simulación'
              : connected
                ? 'Mixxx · telemetría reciente'
                : 'Mixxx · sin datos recientes'}
          </span>
          <span>
            <Headphones size={13} />
            La mezcla sigue en tus manos.
          </span>
        </footer>
      </div>
      {toast && (
        <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <span>{toast.kind === 'error' ? <CircleHelp size={19} /> : <Check size={19} />}</span>
          <p>{toast.text}</p>
          <button className="icon-button" aria-label="Cerrar aviso" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {editing && (
        <TrackEditor
          track={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            const result = await send('track.update', { id: editing.id, patch });
            if (result.ok) setEditing(null);
          }}
        />
      )}
      {newPlaylist && (
        <Modal title="Crear playlist" onClose={() => setNewPlaylist(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await send('playlist.create', { name: playlistName });
              if (result.ok) {
                setNewPlaylist(false);
                setPlaylistName('');
              }
            }}
          >
            <label className="form-label">
              Nombre
              <input
                autoFocus
                required
                maxLength={100}
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                placeholder="Por ejemplo: Sábado · cumbia y cachengue"
              />
            </label>
            <button className="button primary" type="submit">
              Crear playlist <Plus size={16} />
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
