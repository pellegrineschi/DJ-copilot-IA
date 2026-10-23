import React from 'react';
import { Disc3, LockKeyhole, UnlockKeyhole, RotateCcw, Pause, Play } from 'lucide-react';
import { time, bpm } from '../format.js';

export default function Deck({ deck, simulation, connected, send }) {
  const position = deck.duration
    ? Math.max(0, Math.min(100, (deck.positionSeconds / deck.duration) * 100))
    : 0;
  const remaining =
    deck.duration && deck.tempoRatio
      ? (deck.duration - deck.positionSeconds) / deck.tempoRatio
      : null;
  const ready = deck.loaded && !deck.playing && deck.owner === 'copilot';
  return (
    <article
      className={`deck card ${deck.playing && connected ? 'playing' : ''} ${ready ? 'ready' : ''}`}
    >
      <div className="deck-top">
        <div className="deck-name">
          <span className="deck-index">{String(deck.id).padStart(2, '0')}</span>
          <span>DECK {deck.id}</span>
        </div>
        <span className={`pill ${!connected ? '' : deck.playing ? 'mint' : ready ? 'amber' : ''}`}>
          <i />
          {!connected
            ? 'Sin señal'
            : deck.playing
              ? 'Reproduciendo'
              : ready
                ? 'Preparado · pausado'
                : deck.loaded
                  ? 'Pausado'
                  : 'Sin canción'}
        </span>
      </div>
      <div className="track-heading">
        <div className={`record ${deck.playing && connected ? 'spinning' : ''}`}>
          <Disc3 size={30} strokeWidth={1.1} />
        </div>
        <div>
          <h2 title={deck.title || 'Deck vacío'}>{deck.title || 'Tu próximo punto de partida'}</h2>
          <p>{deck.artist || 'Cargá un tema para comenzar'}</p>
        </div>
      </div>
      <div className="deck-metrics">
        <div>
          <label>BPM ACTUAL</label>
          <strong>
            {bpm(deck.bpm)}
            <small>BPM</small>
          </strong>
        </div>
        <div className="metric-secondary">
          <label>ORIGINAL</label>
          <span>{bpm(deck.originalBpm)}</span>
        </div>
        <div className="metric-secondary right">
          <label>RESTANTE ≈</label>
          <span>{time(remaining)}</span>
        </div>
      </div>
      <div className="timeline" aria-label={`Posición ${time(deck.positionSeconds)}`}>
        <div className="timeline-fill" style={{ width: `${position}%` }} />
        {deck.cueSeconds !== null && deck.duration ? (
          <i
            className="cue-marker"
            style={{ left: `${(deck.cueSeconds / deck.duration) * 100}%` }}
            title={`CUE ${time(deck.cueSeconds)}`}
          />
        ) : null}
        <i className="playhead" style={{ left: `${position}%` }} />
      </div>
      <div className="timeline-labels">
        <span>{time(deck.positionSeconds)}</span>
        <span>{deck.cueSeconds === null ? 'SIN CUE' : `CUE ${time(deck.cueSeconds)}`}</span>
        <span>{time(deck.duration)}</span>
      </div>
      <div className="deck-bottom">
        <span className="deck-ownership">
          {deck.locked ? <LockKeyhole size={13} /> : <UnlockKeyhole size={13} />}
          {!simulation
            ? 'Control desde Mixxx'
            : deck.playing
              ? 'Deck activo · protegido'
              : deck.locked
                ? 'Reservado para vos'
                : ready
                  ? 'Preparado · protegido'
                  : deck.loaded && deck.owner === 'manual'
                    ? 'Carga manual · protegida'
                    : 'Disponible para el copiloto'}
        </span>
        {simulation && (
          <div className="deck-actions">
            <button
              className="icon-button"
              title={
                deck.locked ? 'Liberar reserva del deck' : 'Reservar deck para preparación manual'
              }
              aria-label={`${deck.locked ? 'Liberar reserva' : 'Reservar'} Deck ${deck.id}`}
              onClick={() => send('sim.lock', { deckId: deck.id, locked: !deck.locked })}
            >
              {deck.locked ? <UnlockKeyhole size={15} /> : <LockKeyhole size={15} />}
            </button>
            <button
              className="icon-button"
              title="Vaciar y liberar este deck del simulador"
              aria-label={`Vaciar Deck ${deck.id}`}
              disabled={deck.playing}
              onClick={() => send('sim.release', { deckId: deck.id })}
            >
              <RotateCcw size={15} />
            </button>
            <button
              className="button small simulation-play"
              disabled={!deck.loaded}
              onClick={() => send('sim.play', { deckId: deck.id, playing: !deck.playing })}
            >
              {deck.playing ? <Pause size={13} /> : <Play size={13} />}{' '}
              {deck.playing ? 'Pausar demo' : 'Play demo'}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
