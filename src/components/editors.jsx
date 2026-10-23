import React, { useEffect, useState } from 'react';
import { X, Headphones, Check, ArrowRight } from 'lucide-react';
import { time } from '../format.js';

export function Modal({ title, onClose, children }) {
  const ref = React.useRef(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="section-title">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Cerrar ventana" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function TrackEditor({ track, onClose, onSave }) {
  const [form, setForm] = useState({
    title: track.title,
    artist: track.artist,
    genre: track.genre,
    bpm: track.bpm ?? '',
    cueSeconds: track.cueSeconds ?? '',
  });
  const field = (key, value) => setForm({ ...form, [key]: value });
  return (
    <Modal title="Preparar esta canción" onClose={onClose}>
      <p className="modal-description">
        Los cambios se guardan en DJ Copilot. Tu archivo MP3 no se modifica.
        {track.isDemo && ' Esta canción es una demostración con valores ficticios.'}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            ...form,
            bpm: form.bpm === '' ? null : Number(form.bpm),
            cueSeconds: form.cueSeconds === '' ? null : Number(form.cueSeconds),
          });
        }}
      >
        <label className="form-label">
          Título
          <input
            required
            maxLength={300}
            value={form.title}
            onChange={(e) => field('title', e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label className="form-label">
            Artista
            <input
              required
              maxLength={300}
              value={form.artist}
              onChange={(e) => field('artist', e.target.value)}
            />
          </label>
          <label className="form-label">
            Género
            <input
              maxLength={300}
              value={form.genre}
              onChange={(e) => field('genre', e.target.value)}
            />
          </label>
        </div>
        <div className="form-grid">
          <label className="form-label">
            BPM verificados
            <input
              type="number"
              min="20"
              max="400"
              step="0.01"
              placeholder="Desconocido"
              value={form.bpm}
              onChange={(e) => field('bpm', e.target.value)}
            />
          </label>
          <label className="form-label">
            Punto CUE · segundos
            <input
              type="number"
              min="0"
              max={track.duration ? track.duration - 0.001 : undefined}
              step="0.001"
              placeholder="Sin CUE guardado"
              value={form.cueSeconds}
              disabled={!track.duration}
              onChange={(e) => field('cueSeconds', e.target.value)}
            />
          </label>
        </div>
        <div className="info-box">
          <Headphones size={20} />
          <p>
            Escuchá el archivo en Mixxx y anotá el punto de entrada que verificaste. Duración:{' '}
            {time(track.duration)}. Vaciar el campo elimina el CUE; 0 es el inicio del archivo.
          </p>
        </div>
        <button type="submit" className="button primary">
          Guardar preparación <Check size={16} />
        </button>
      </form>
    </Modal>
  );
}

export function Planner({ plan, onSave }) {
  const [form, setForm] = useState({
    hours: plan.hours,
    songSeconds: plan.songSeconds,
    overlapSeconds: plan.overlapSeconds,
  });
  return (
    <form
      className="planner-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
    >
      <label className="form-label">
        Duración del set · horas
        <input
          type="number"
          min="0.25"
          max="24"
          step="0.25"
          value={form.hours}
          onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })}
          required
        />
      </label>
      <div className="form-grid">
        <label className="form-label">
          Segundos por tema
          <input
            type="number"
            min="30"
            max="1800"
            value={form.songSeconds}
            onChange={(e) => setForm({ ...form, songSeconds: Number(e.target.value) })}
            required
          />
        </label>
        <label className="form-label">
          Transición · segundos
          <input
            type="number"
            min="0"
            max={form.songSeconds - 1}
            value={form.overlapSeconds}
            onChange={(e) => setForm({ ...form, overlapSeconds: Number(e.target.value) })}
            required
          />
        </label>
      </div>
      <button className="button" type="submit">
        Actualizar estimación <ArrowRight size={14} />
      </button>
    </form>
  );
}
