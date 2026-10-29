import { EventEmitter } from 'node:events';
import { createConnection } from 'node:net';
import { lstat, open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyDeck } from '../simulator.mjs';
import { unknownIdentity } from '../../core/identity.mjs';
import {
  NATIVE_PROTOCOL,
  NATIVE_BUILD,
  NATIVE_LIMIT,
  NATIVE_AGE,
  NATIVE_BLOCK,
  validateNativeState,
} from './protocol.mjs';

export class NativeAdapter extends EventEmitter {
  constructor({
    directory = process.env.DJ_COPILOT_NATIVE_DIR,
    resolveTrack = async () => null,
    clock = () => Date.now(),
    requestTimeout = 2500,
    allowFixture = false,
    start = true,
  } = {}) {
    super();
    Object.assign(this, { directory, resolveTrack, clock, requestTimeout, allowFixture });
    this.closed = false;
    this.connected = false;
    this.sequence = 0;
    this.receivedAt = 0;
    this.session = null;
    this.fixture = false;
    this.raw = null;
    this.linked = [null, null];
    this.linking = [null, null];
    this.pending = new Map();
    this.message =
      'Esperando puente nativo aislado. La instalación estable no incluye este servicio.';
    this.lastCheck = null;
    this.connecting = false;
    this.timer = setInterval(() => this.tick(), 500);
    if (start) void this.connect();
  }
  async connect() {
    if (this.closed || this.connecting || this.socket) return;
    this.connecting = true;
    try {
      if (!this.directory)
        throw new Error('Iniciá la variante aislada y configurá DJ_COPILOT_NATIVE_DIR.');
      const directory = resolve(this.directory);
      const info = await lstat(directory);
      if (
        !info.isDirectory() ||
        info.uid !== process.getuid() ||
        (info.mode & 0o777) !== 0o700 ||
        (await realpath(directory)) !== directory
      )
        throw new Error(
          'El directorio del puente debe ser canónico, privado (0700) y de tu usuario.',
        );
      const tokenFile = await open(
        join(directory, 'token'),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      let token;
      try {
        const metadata = await tokenFile.stat();
        if (
          !metadata.isFile() ||
          metadata.uid !== process.getuid() ||
          (metadata.mode & 0o777) !== 0o600 ||
          metadata.size !== 64
        )
          throw new Error('Permisos o formato de credencial nativa inválidos.');
        token = await tokenFile.readFile('utf8');
      } finally {
        await tokenFile.close();
      }
      if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Credencial nativa inválida.');
      const address = join(directory, 'bridge.sock');
      const socketInfo = await lstat(address);
      if (!socketInfo.isSocket() || socketInfo.uid !== process.getuid() || socketInfo.mode & 0o077)
        throw new Error('Socket nativo inseguro o de otro usuario.');
      if (this.closed) return;
      this.buffer = Buffer.alloc(0);
      const socket = (this.socket = createConnection(address));
      socket.on('error', () =>
        this.fail('No se pudo conectar con el puente nativo. Revisá la variante aislada.'),
      );
      socket.on('close', () =>
        this.fail('Puente nativo desconectado. Operaciones y autorizaciones descartadas.'),
      );
      socket.on('data', (chunk) => this.consume(chunk));
      socket.on('connect', () => {
        const id = (this.helloId = randomUUID());
        socket.write(
          JSON.stringify({ type: 'hello', id, protocol: NATIVE_PROTOCOL, token }) + '\n',
        );
      });
      this.authTimer = setTimeout(
        () => this.fail('El puente no completó la autenticación a tiempo.'),
        this.requestTimeout,
      );
    } catch (error) {
      this.fail(
        error.code === 'ENOENT'
          ? 'No está disponible el puente de esta sesión. Abrí la variante aislada y usá el directorio indicado por su lanzador.'
          : error.code === 'EACCES'
            ? 'No hay permiso para acceder al puente. Usá una sesión privada creada por tu usuario.'
            : error.message,
      );
    } finally {
      this.connecting = false;
    }
  }
  consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let index;
    while ((index = this.buffer.indexOf(10)) !== -1) {
      if (index > NATIVE_LIMIT) return this.fail('Mensaje nativo demasiado grande.');
      const line = this.buffer.subarray(0, index).toString('utf8');
      this.buffer = this.buffer.subarray(index + 1);
      try {
        this.receive(JSON.parse(line));
      } catch {
        this.fail('Mensaje nativo inválido.');
        return;
      }
      if (!this.socket) return;
    }
    if (this.buffer.length > NATIVE_LIMIT)
      this.fail('Mensaje nativo incompleto o demasiado grande.');
  }
  receive(message) {
    if (!this.session) {
      if (
        !message ||
        message.type !== 'reply' ||
        message.id !== this.helloId ||
        message.ok !== true ||
        message.code !== 'HELLO' ||
        typeof message.session !== 'string' ||
        !/^[0-9a-f-]{36}$/.test(message.session) ||
        message.value?.protocol !== NATIVE_PROTOCOL ||
        message.value?.build !== NATIVE_BUILD ||
        !['mixxx-2.5.6', ...(this.allowFixture ? ['fixture-only'] : [])].includes(
          message.value?.provider,
        )
      )
        return this.fail('Fuente nativa no compatible o de prueba. No se confirmó identidad.');
      this.fixture = message.value.provider === 'fixture-only';
      this.provider = message.value.provider;
      this.session = message.session;
      clearTimeout(this.authTimer);
      this.authTimer = setTimeout(
        () => this.fail('El puente autenticó pero no entregó un estado válido a tiempo.'),
        this.requestTimeout,
      );
      this.message = this.fixture
        ? 'Prueba IPC nativa · sin Mixxx ni audio'
        : 'Mixxx experimental 2.5.6 · identidad y comprobación nativa';
      return;
    }
    if (message.type === 'reply') {
      if (message.session !== this.session) return this.fail('Sesión nativa incorrecta.');
      const pending = this.pending.get(message.id);
      if (!pending) return; // Late replies never mutate state or resurrect requests.
      if (
        typeof message.ok !== 'boolean' ||
        typeof message.message !== 'string' ||
        typeof message.code !== 'string'
      )
        return this.fail('Confirmación nativa inválida.');
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message);
      else pending.reject(Object.assign(new Error(message.message), { code: message.code }));
      return;
    }
    if (!validateNativeState(message, this.session, this.sequence, this.clock()))
      return this.fail('Telemetría nativa inválida, antigua o fuera de orden.');
    if (this.raw && message.decks.some((d, i) => d.revision < this.raw.decks[i].revision))
      return this.fail('Revisión nativa regresiva.');
    clearTimeout(this.authTimer);
    this.sequence = message.sequence;
    this.receivedAt = Math.min(this.clock(), message.sentAt);
    this.raw = message;
    this.connected = message.decks.every((d) => d.available);
    for (const deck of message.decks) {
      const key = deck.path ? `${this.session}:${deck.revision}:${deck.path}` : null;
      if (this.linked[deck.id - 1]?.key !== key) this.linked[deck.id - 1] = null;
      if (!key || this.fixture || this.linking[deck.id - 1] === key || this.linked[deck.id - 1])
        continue;
      this.linking[deck.id - 1] = key;
      const expectedPath = deck.path,
        expectedSession = this.session,
        expectedRevision = deck.revision;
      void Promise.resolve(this.resolveTrack(expectedPath))
        .then((track) => {
          if (
            this.closed ||
            !this.connected ||
            this.session !== expectedSession ||
            this.raw?.decks[deck.id - 1].revision !== expectedRevision ||
            this.raw?.decks[deck.id - 1].path !== expectedPath
          )
            return;
          this.linked[deck.id - 1] = { key, trackId: track?.id ?? null };
          this.emit('state', this.snapshot());
        })
        .catch(() => {})
        .finally(() => {
          if (this.linking[deck.id - 1] === key) this.linking[deck.id - 1] = null;
        });
    }
    this.emit('state', this.snapshot());
  }
  request(command, payload = {}, { requireState = true } = {}) {
    if (
      !this.socket ||
      !this.session ||
      this.closed ||
      (requireState && !this.snapshot().connected)
    )
      return Promise.reject(new Error('Sin conexión nativa reciente. Reconectá explícitamente.'));
    if (this.pending.size >= 16)
      return Promise.reject(new Error('Demasiadas solicitudes nativas pendientes.'));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail('Timeout nativo: conexión cerrada y solicitudes descartadas.');
      }, this.requestTimeout);
      this.pending.set(id, { resolve, reject, timer, command });
      this.socket.write(
        JSON.stringify({ type: 'request', id, session: this.session, command, payload }) + '\n',
      );
    });
  }
  tick() {
    if (this.closed) return;
    if (
      this.raw &&
      (this.clock() - this.receivedAt > NATIVE_AGE || this.clock() < this.receivedAt)
    ) {
      this.fail('Telemetría nativa vencida. Reconectá y autorizá nuevamente.');
      return;
    }
    if (this.session && !this.pinging) {
      this.pinging = true;
      void this.request('ping', {}, { requireState: false })
        .catch(() => {})
        .finally(() => {
          this.pinging = false;
        });
    }
    this.emit('state', this.snapshot());
  }
  fail(message) {
    if (this.closed) return;
    this.message = message;
    this.connected = false;
    this.receivedAt = 0;
    this.session = null;
    this.raw = null;
    this.sequence = 0;
    this.linked = [null, null];
    this.linking = [null, null];
    this.lastCheck = null;
    clearTimeout(this.authTimer);
    const socket = this.socket;
    this.socket = null;
    socket?.removeAllListeners();
    socket?.destroy();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.pending.clear();
    this.emit('state', this.snapshot());
  }
  snapshot() {
    const fresh =
      this.connected &&
      this.clock() >= this.receivedAt &&
      this.clock() - this.receivedAt <= NATIVE_AGE;
    const decks = (this.raw?.decks ?? [emptyDeck(1), emptyDeck(2)]).map((d, index) => {
      const confirmed = fresh && !this.fixture && !d.loading && Boolean(d.path);
      const authorized =
        fresh && this.raw.authorizedDeck === d.id && this.clock() <= this.raw.authorizedUntil;
      const trackId = confirmed ? (this.linked[index]?.trackId ?? null) : null;
      return {
        ...d,
        trackId,
        fresh,
        locked: true,
        owner: 'manual',
        canAssociate: false,
        nativeAuthorized: authorized,
        title: confirmed
          ? d.title || 'Título sin etiqueta'
          : d.loaded
            ? 'Identidad desconocida'
            : null,
        artist: confirmed ? d.artist || 'Artista sin etiqueta' : null,
        identity: confirmed
          ? {
              status: 'confirmed',
              source: 'mixxx-native',
              path: d.path,
              trackId,
              reason: 'Ruta y metadatos informados por el puente nativo de Mixxx.',
              libraryLinked: Boolean(trackId),
            }
          : unknownIdentity('Esperando confirmación nativa de carga.'),
        associationReason: NATIVE_BLOCK,
      };
    });
    return {
      mode: 'native',
      connected: fresh,
      receivedAt: this.receivedAt,
      message: this.message,
      decks,
      fixture: this.fixture,
      provider: this.session ? this.provider : null,
      build: this.session ? NATIVE_BUILD : null,
      session: this.session,
      lastCheck: this.lastCheck,
      pending: [...this.pending.values()].some((p) => p.command !== 'ping'),
      // Fail closed even if a server advertises extra capabilities. This adapter
      // has no implementation of an atomic audio-engine transaction.
      capabilities: {
        telemetry: true,
        trackIdentity: !this.fixture,
        manualIdentity: false,
        loadByPath: false,
        tempo: false,
        cue: false,
        preflight: true,
      },
      automationReason: NATIVE_BLOCK,
    };
  }
  context() {
    const state = this.snapshot();
    if (!state.connected) throw new Error('Sin estado nativo reciente.');
    return { revisions: state.decks.map((d) => d.revision) };
  }
  async authorize(deckId, replace = false) {
    if (![1, 2].includes(deckId) || typeof replace !== 'boolean')
      throw new Error('Autorización inválida.');
    this.lastCheck = null;
    return this.request('authorize', { ...this.context(), deckId, replace });
  }
  async inspect(track) {
    const state = this.snapshot();
    const target = state.decks.find((d) => d.nativeAuthorized);
    if (!target) throw new Error('Autorizá un deck detenido para comprobar el archivo.');
    if (!track || track.isDemo || !track.path) throw new Error('Elegí un MP3 importado real.');
    const result = await this.request('inspect', {
      ...this.context(),
      deckId: target.id,
      path: track.path,
    });
    if (
      result.code !== 'PREFLIGHT_ONLY' ||
      result.value?.path !== track.path ||
      result.value?.deckId !== target.id ||
      result.value?.loaded !== false ||
      result.value?.prepared !== false
    ) {
      this.fail('Resultado de comprobación inválido. No se confirmó ninguna preparación.');
      throw new Error(this.message);
    }
    this.lastCheck = { ...result.value, message: result.message, at: this.clock() };
    this.emit('state', this.snapshot());
    return result.value;
  }
  async reserve() {
    this.lastCheck = null;
    return this.request('reserve');
  }
  cancelPending() {
    // No automatic replay: close the session, which revokes native authorization.
    if ([...this.pending.values()].some((p) => p.command !== 'ping'))
      this.fail('Solicitud cancelada. Reconectá para continuar.');
    else if (this.session) void this.request('cancel').catch(() => {});
  }
  async prepare() {
    throw new Error(NATIVE_BLOCK);
  }
  close() {
    this.fail('Conexión nativa cerrada.');
    this.closed = true;
    clearInterval(this.timer);
    this.removeAllListeners();
  }
}
