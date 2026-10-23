// These are synthetic fixtures, not measurements of the user's recordings.
export const demoTracks = [
  {
    id: 'demo-original',
    title: 'Te Hago el Amor · Extended Mix',
    artist: 'El Original',
    genre: 'Cumbia · DEMO',
    bpm: 96,
    duration: 210,
    cueSeconds: 16,
  },
  {
    id: 'demo-orgullosa',
    title: 'Orgullosa 2k26',
    artist: 'Eh Guacho',
    genre: 'Cachengue · DEMO',
    bpm: 98,
    duration: 180,
    cueSeconds: 12,
  },
  {
    id: 'demo-kilates',
    title: 'Me Olvidé de Ti',
    artist: '18 Kilates',
    genre: 'Cumbia · DEMO',
    bpm: 95,
    duration: 195,
    cueSeconds: 8,
  },
].map((t) => ({
  ...t,
  isDemo: true,
  cueSource: 'fixture sintético',
  bpmSource: 'fixture sintético',
}));
