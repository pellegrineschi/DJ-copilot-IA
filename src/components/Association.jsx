import React, { useState } from 'react';
import { Modal } from './editors.jsx';

export default function Association({ context, deck, tracks, onClose, onSave }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = deck?.canAssociate && deck.identityToken === context.token;
  const real = tracks.filter((t) => !t.isDemo && t.path);
  const matching = real.filter((t) =>
    `${t.artist} ${t.title} ${t.path}`
      .toLocaleLowerCase('es')
      .includes(search.toLocaleLowerCase('es')),
  );
  const track = real.find((t) => t.id === selected);
  return (
    <Modal title={`Asociar canción · Deck ${context.deckId}`} onClose={onClose}>
      <p className="modal-description">
        Elegí el mismo archivo que está cargado en Mixxx. Esta asociación es manual: Mixxx no
        confirma el título ni la ruta. Una nueva carga o pérdida de señal la descarta.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!current || !track || !checked || busy) return;
          setBusy(true);
          setError('');
          const result = await onSave({
            deckId: context.deckId,
            token: context.token,
            trackId: track.id,
            checkedInMixxx: checked,
          });
          setBusy(false);
          if (!result.ok)
            setError(result.error || 'No se pudo asociar. Volvé a comprobar el deck.');
        }}
      >
        <label className="form-label">
          Buscar archivo importado
          <input
            autoFocus
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Título, artista o ruta"
          />
        </label>
        <label className="form-label">
          Canción de la biblioteca
          <select
            className="association-picker"
            required
            size={5}
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setChecked(false);
            }}
          >
            <option value="" disabled>
              Elegí un archivo…
            </option>
            {matching.map((t) => (
              <option key={t.id} value={t.id}>
                {t.artist} — {t.title} · {t.path}
              </option>
            ))}
          </select>
        </label>
        {!real.length && (
          <p className="modal-description">Importá tus MP3 desde Biblioteca antes de asociar.</p>
        )}
        {track && (
          <p className="association-path">
            <strong>Ruta en tu biblioteca</strong>
            <span>{track.path}</span>
          </p>
        )}
        <label className="association-check">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            disabled={!track || !current}
          />
          Comprobé en Mixxx que este archivo está cargado en el Deck {context.deckId}.
        </label>
        {!current && (
          <p className="identity-warning" role="alert">
            El deck o la conexión cambió. Cerrá esta ventana y comprobá nuevamente la canción.
          </p>
        )}
        {error && (
          <p className="identity-warning" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary"
          type="submit"
          disabled={!current || !track || !checked || busy}
        >
          {busy ? 'Verificando archivo…' : 'Guardar asociación manual'}
        </button>
      </form>
    </Modal>
  );
}
