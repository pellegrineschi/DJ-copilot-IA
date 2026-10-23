# Validación de la entrega inicial

Fecha: 22 de octubre de 2026. Ubuntu; Mixxx instalado `2.5.6-1~noble`; Node `24.14.1`; Electron `44.9.3`. Las versiones npm resueltas quedan en `package-lock.json`.

| Comprobación                                                    | Resultado                                               |
| --------------------------------------------------------------- | ------------------------------------------------------- |
| Motor y seguridad                                               | 22 pruebas aprobadas                                    |
| Biblioteca, importación, persistencia y exportación             | 4 pruebas aprobadas                                     |
| Contrato del script Mixxx, parser, frescura y lectura exclusiva | 5 pruebas aprobadas                                     |
| `npm run build`                                                 | Compilación de producción aprobada                      |
| `npm run format:check`                                          | Aprobado                                                |
| `npm run test:desktop`                                          | Aprobado con Electron abierto y `chromiumSandbox: true` |
| Puerto MIDI virtual desde Electron                              | ALSA creó `128:0`; cierre de recursos al terminar       |
| Telemetría emitida por Mixxx real / uso simultáneo de DDJ-200   | Pendiente de prueba física                              |
| Carga automática real en Mixxx                                  | No implementada; capacidad deshabilitada                |

La prueba Electron comprobó el ciclo de los tres temas, confirmó la identidad y pausa del tema preparado después del cambio manual, importó un MP3 sintético por el diálogo/IPC, guardó un CUE de 1,25 s, buscó la canción y verificó el bloqueo de automático en modo MIDI. Las esperas consultan el resultado resuelto del IPC, no una promesa tratada como verdadera.

Se corrigió el arranque desde editores que heredan `ELECTRON_RUN_AS_NODE=1`: los lanzadores de producción, desarrollo y pruebas eliminan esa variable para iniciar Electron como aplicación gráfica. No se usa `--no-sandbox`.

El diagnóstico ejecutado en el entorno aislado de comandos no veía `/dev/snd/seq`; la prueba posterior de Electron en el escritorio sí pudo crear el puerto. No se confunden esas dos condiciones ni se declara conexión con Mixxx por la mera existencia del puerto.

Capturas de la aplicación real con biblioteca temporal:

- [Cabina y escenario de tres temas](../artifacts/cabina.png).
- [Biblioteca con MP3 sintético importado](../artifacts/biblioteca.png).
- [Monitor MIDI esperando conexión](../artifacts/monitor-midi.png).

No se aportaron ni descargaron los MP3 de El Original, Eh Guacho o 18 Kilates. No se modificó el mapeo DDJ-200 ni ningún archivo de música del usuario. No hubo generación de audio, reproducción automática real ni envío de música a servicios externos.
