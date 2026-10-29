# Validación · etapa 3.1

Fecha: **29 de octubre de 2026**. Repositorio Copilot en rama `main`, commit inicial `c64ab7a9b7a7976eddfc395e08bfc8b63623510f`, sin cambios locales al comenzar. No se hizo push ni merge durante esta etapa.

**Mixxx 2.5.6 completo compiló, enlazó y se ejecutó con el puente nativo. Copilot de producción se conectó al servidor real.** Se verificaron dos decks vacíos, continuidad durante 30 segundos, rechazo de escrituras y recuperación con sesión nueva. **Identidad con canciones, audio y DDJ-200 nativa siguen pendientes de prueba humana.** Carga automática, ajuste de BPM y CUE pertenecen a etapa 3.2 y permanecen bloqueados.

## Resultados y procedencia

| Comprobación                                                    | Resultado y alcance                                                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                      | 55 casos aprobados en cinco archivos: 22 motor, 4 biblioteca, 6 MIDI v1, 14 MIDI v2/identidad y 9 cliente nativo |
| `npm run test:native` con wrapper local                         | 8 casos aprobados; servidor C++ y sockets Unix reales, **decks y archivos fixture**                              |
| `npm run build`                                                 | Producción React/Vite aprobada                                                                                   |
| `npm run test:desktop`                                          | Aprobado; Electron con sandbox, simulación, MIDI artificial y modo nativo sin puente                             |
| Compilación completa Mixxx                                      | Aprobada: target `mixxx`, 841 pasos del build final, incluido enlazado de `libmixxx-lib.a` y ejecutable gráfico  |
| Ejecutable completo con perfil propio                           | Iniciado; proceso real y recursos del checkout comprobados; audio no validado                                    |
| `npm run test:native:live -- /tmp/dj-native-0gKzVE 30`          | Aprobado contra **Mixxx real**, 120 mensajes/120 muestras en 30 s y Electron de producción                       |
| Identidad/estado de ambos decks                                 | Vacíos, sin reproducción, identidad desconocida; no se inventaron BPM ni títulos                                 |
| Autenticación, pérdida de socket y recuperación                 | Aprobadas contra Mixxx real; sesiones nuevas sin permisos anteriores                                             |
| Carga/prepare/tempo/CUE y comandos arbitrarios                  | Rechazados por servidor real; automático/preparar también bloqueados en UI y backend                             |
| Título, artista, ruta, BPM/duración con MP3 reales              | **No ejecutados; pendientes de cargas manuales**                                                                 |
| Cargas, reemplazos y expulsiones en Mixxx real                  | **No ejecutados**; contrato/señales revisados y casos artificiales aprobados                                     |
| Reproducción, latencia, estabilidad prolongada y DDJ-200 nativa | **No ejecutadas; pendientes de prueba física**                                                                   |
| MIDI v2, asociación y DDJ-200 de etapa 2                        | Confirmados físicamente por el usuario antes de esta etapa; no se repitió hardware                               |
| Binario/configuración/mapeos estables                           | SHA-256 de los 8 archivos registrados antes/después: **sin cambios**                                             |

`npm run format:check`, `git diff --check` y la comprobación de sintaxis de los nuevos scripts Bash/JavaScript/Python también pasaron. El resumen de Node de este entorno cuenta cinco archivos; contienen los 55 casos indicados.

## Entorno y compilación completa

Ubuntu **24.04.5 Noble amd64**, Git 2.43.0, Node 24.14.1, npm 11.11.0, g++ 13.3.0, Electron 44.9.3 y Mixxx instalado `2.5.6-1~noble`. Qt6 runtime 6.4.2, sesión gráfica y dispositivos ALSA disponibles en el host. La sandbox no expone los mismos dispositivos ni permite las pruebas de socket/GUI; se ejecutaron con autorización fuera de ella. No se desactivó el sandbox de Electron.

Faltaban CMake, Ninja, pkg-config y headers Qt/audio. La simulación de APT propuso 148 paquetes nuevos y cuatro actualizaciones GLib, sin eliminaciones. `sudo -n apt-get install ...` no pudo autenticarse y **no instaló nada**. Se continuó con 152 paquetes `.deb` descargados y extraídos en un prefijo local, sin `dpkg --install`, scripts de instalación ni cambios globales.

Dependencias persistentes: `/home/matias/src/dj-copilot-build-deps/root`. CMake 3.28.3, Ninja 1.11.1, pkg-config 1.8.1 y Qt6 de desarrollo 6.4.2 quedaron disponibles a través de `scripts/native-local-env.sh`. Los helpers de descarga/extracción se verificaron; una extracción nueva en `/tmp` encontró las herramientas y bibliotecas esperadas. Los detalles y comandos exactos están en [COMPILACION-NATIVA.md](COMPILACION-NATIVA.md).

El checkout oficial nuevo `/home/matias/src/mixxx-copilot-2.5.6` está exactamente en `3ebac449e7e5fe2a0186596657696e87ce8b0e56`, tag 2.5.6. `native-prepare.mjs` aplicó el parche existente. El diff contiene dos entradas CMake, un include y una llamada en PlayerManager, más los cuatro archivos nuevos de `src/copilot/`. No hubo cambios en el motor de audio.

Se configuró `RelWithDebInfo`, Qt6/QML y PortMidi habilitados, generador Ninja, cuatro trabajos y prefijo de instalación dentro del checkout. **No se ejecutó instalación**. El build final terminó con `Linking CXX executable mixxx`, salida 0. El binario de aproximadamente 540 MiB, con símbolos de depuración, está en:

```text
/home/matias/src/mixxx-copilot-2.5.6/build-copilot/mixxx
```

`ldd` no informó bibliotecas ausentes. El log de ejecución identifica `Mixxx 2.5.6 (git 2.5.6-modified (HEAD))`. Esto sustituye la evidencia limitada de etapa 3, que solo había compilado el observador a objeto: ahora se enlazaron interfaz, motor, controladores y puente juntos.

## Problemas encontrados y resolución

- **Dependencias sin permisos administrativos:** la contraseña de sudo no estaba disponible para ejecución automática. Se resolvió con descarga/extracción local; no hace falta completar la instalación administrativa para usar este build.
- **Cuatro headers FFmpeg ESM con HTTP 401:** la descarga sin privilegios no pudo obtener `libavformat-dev`, `libavcodec-dev`, `libavutil-dev` y `libswresample-dev` de `7:6.1.1-3ubuntu5+esm15`. Se extrajeron headers públicos `7:6.1.1-3ubuntu5`. Las bibliotecas runtime ESM instaladas se conservan y se referencian mediante enlaces locales; no se degradó FFmpeg.
- **Primer build falló en `openssl/opensslconf.h`:** faltaba la búsqueda de includes multiarch en el entorno extraído. Se agregaron `C_INCLUDE_PATH` y `CPLUS_INCLUDE_PATH` al wrapper del proceso hijo y se reconfiguró con `cmake --fresh`. El build completo siguiente pasó; no se cambiaron fuentes de audio ni protecciones.
- **Avisos del primer arranque:** ALSA no pudo abrir algunos dispositivos enumerados; JACK no estaba ejecutándose. GTK también consultó una ubicación de red inaccesible. No se alteraron servicios, dispositivos ni montajes. Los avisos iniciales de controles inexistentes ocurrieron al construir PlayerManager; luego ambos decks estuvieron disponibles en la telemetría. No impidieron el IPC, pero el audio sigue sin validar.
- **Perfil nuevo y diálogos iniciales:** la variante se abrió con un perfil vacío, que puede pedir carpeta musical/configuración de audio. Se solicitó al usuario confirmar la cabina. La conexión por IPC puede funcionar durante un diálogo modal; por eso el test no certifica por sí solo el arranque visual completo ni audio operativo.

## Pruebas automatizadas sin Mixxx real

Los 55 casos Node conservan el motor del simulador, biblioteca, importación sin modificar bytes, SQLite, M3U, SysEx, asociación manual y migración de historial. Los nueve casos nativos comprueban proveedor/build, rechazo de fixture en producción, validación de mensajes/sesiones/frescura, resolución de ruta/hash, descarte de resultados tardíos, timeout, cancelación e historial compartido MIDI/nativo. Se agregaron aserciones para la identificación explícita de Mixxx experimental.

`test:native` compila `native/bridge_server.cpp` con `native/tests/fixture.cpp`. Sus ocho casos verifican permisos/directorio/token/socket, autenticación, permiso de 10 s y vencimiento real, comprobación sin carga, ocupación, revisiones de ambos decks, rutas inexistentes/fuera de raíz/symlinks, cancelación, reconexión con sesión nueva, IDs duplicados y credencial incorrecta. Los archivos `.mp3` contienen texto de fixture; no se decodifican.

`test:desktop` ensaya simulación y MIDI con controles artificiales, biblioteca temporal y un MP3 sintético. Usa ventana/preload/IPC/backend de producción, pero `desktop-entry.mjs` sustituye el arranque ALSA por la VM del mapeo. No crea un puerto MIDI ni opera la DDJ-200. También prueba conexión nativa ausente y botones bloqueados. Sus capturas quedan en `artifacts/`.

## Conexión real Mixxx → Copilot

El lanzador abrió el binario completo con recursos del checkout y perfil `~/.local/share/dj-copilot/mixxx-2.5.6-prototype`. La raíz musical fue `artifacts/native-3.1/music`, vacía. Creó `/tmp/dj-native-0gKzVE` con permisos 0700, socket privado y token 0600. Ese directorio corresponde solo a esa ejecución; un relanzamiento crea otro.

`native-live-smoke.mjs` usó el **NativeAdapter de producción** y exigió `provider=mixxx-2.5.6`, build del observador, autenticación y ambos decks disponibles. Observó 120 estados en 30 segundos, sin pérdida ni caducidad durante ese intervalo. Solicitó comandos que el servidor debe rechazar: carga, prepare, tempo, CUE, play, stop, EQ, crossfader, AutoDJ y system. Todos fueron rechazados, sin ejecutar acciones.

Después cortó exclusivamente su socket cliente, comprobó estado desconectado/identidades desconocidas y reconectó con una sesión distinta, sin permisos anteriores. No cerró Mixxx ni manipuló su audio. Abrió `electron/main.mjs` con SQLite temporal y sandbox activo, seleccionó el modo nativo, verificó el proveedor real y los bloqueos de UI/backend, y pulsó Reiniciar puente para obtener otra sesión. No hubo errores JavaScript de página. Cerró su Electron de prueba al terminar.

La captura de Copilot muestra el banner **Mixxx experimental 2.5.6**, ambos decks sin canción y preparación deshabilitada. Se inspeccionó esa captura. **No se cargaron ni reprodujeron los tres MP3 del usuario.** La prueba de desconexión con decks vacíos no sustituye comprobar la invalidación de una identidad cargada real; eso queda en la guía física.

Evidencia local, excluida de Git porque puede incluir rutas/metadatos:

- `artifacts/native-3.1/diagnostic-before.json`, `dependencies-simulation.log`, `dependencies-manifest.json` (152 paquetes, versiones y SHA-256).
- `configure.log`, `build.log` y logs del primer intento fallido.
- `linked-libraries.log`, `launch.log`.
- [Reporte de conexión real](../artifacts/native-3.1/live-report.json).
- [Copilot conectado a Mixxx real](../artifacts/native-3.1/mixxx-real-electron.png).
- `stable-before.json`, `stable-after.json`: comparación de binario estable, `mixxx.cfg` y seis mapeos, incluidos Pioneer DDJ-200.

## Pendiente de intervención humana

Seguir [DDJ200-NATIVO.md](DDJ200-NATIVO.md) con **El Original — Te Hago el Amor**, **Eh Guacho — Orgullosa** y **18 Kilates — Me Olvidé de Ti**. Falta confirmar título/artista/ruta exacta, valores de BPM/duración, reemplazos/expulsión, reproducción, controles físicos, estabilidad prolongada y recuperación tras cerrar/reabrir Mixxx. No se asume que los MP3 estén disponibles en desarrollo.

La variante permanece experimental. Para volver al estable, cerrar la variante cuando sea seguro y abrir `/usr/bin/mixxx` desde el entorno habitual, sin wrapper ni perfil/variables experimentales. Copilot puede volver a MIDI v2. No hay modificaciones de MP3, faders, EQ, crossfader o AutoDJ que deshacer. No se habilita etapa 3.2 por aprobar transporte: requiere su implementación y validación específica posterior.
