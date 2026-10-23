# Integración con Mixxx: evidencia y límites

Investigación inicial del 22 de octubre de 2026. En el entorno se detectó `mixxx 2.5.6-1~noble` mediante `dpkg-query`. Se leyeron las declaraciones instaladas en `/usr/share/mixxx/controllers/engine-api.d.ts` y `midi-controller-api.d.ts`, la documentación oficial y la interfaz C++ de la rama 2.5. No se presupone una API REST.

## Operaciones verificadas en documentación/código

| Necesidad                   | Interfaz real                                     | Decisión del MVP                                                       |
| --------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| Saber si reproduce          | `engine.getValue('[ChannelN]', 'play')`           | Enviar como telemetría                                                 |
| Saber si hay canción        | `track_loaded`                                    | Enviar sin inferir la identidad                                        |
| BPM                         | `bpm`, `file_bpm`                                 | Mostrar desconocido si el valor es cero                                |
| Duración y avance           | `duration`, `playposition`                        | Segundos; avance aproximado a 2 Hz                                     |
| CUE existente               | `cue_point`, `track_samples`                      | Convertir a segundos por proporción de muestras; -1 es ausencia        |
| Saber si se toca el jog     | `engine.isScratching(deck)`                       | Bandera diagnóstica; no implica permiso de carga                       |
| Suscribirse a controles     | `engine.makeConnection`                           | Disponible; se usa snapshot periódico para evitar mensajes incompletos |
| Temporizador                | `engine.beginTimer` / `stopTimer`                 | Capturar ambos decks cada 500 ms                                       |
| Enviar estado MIDI          | `midi.sendSysexMsg`                               | Paquete numérico con firma, versión y checksum                         |
| Cargar canción resaltada    | `LoadSelectedTrack`                               | Existe, pero no determina la ruta o identidad; no se utiliza           |
| Cargar y reproducir         | `LoadSelectedTrackAndPlay`                        | Prohibido para este producto                                           |
| Modificar tempo / posición  | `rate`, `playposition`, controles CUE             | Técnicamente expuestos, pero el puente v1 no escribe ninguno           |
| Cargar ruta elegida en Node | Sin método en la interfaz legacy inspeccionada    | No implementado; simulación y M3U como alternativa                     |
| Leer título, artista o ruta | No expuesto en el `engine` numérico inspeccionado | Se muestra «Título no disponible por MIDI»                             |

`cue_point / track_samples * duration` evita asumir una cantidad fija de canales o confundir muestras con frames. El tempo relativo se estima con `1 + rate * rateRange * rate_dir`; el tiempo restante es aproximado y no modela loops, reversa, scratching ni futuros cambios de velocidad. La barra de avance **no es una forma de onda analizada**.

Estos hallazgos son sobre la interfaz investigada, no una afirmación de que Mixxx nunca pueda ofrecer otras extensiones. Se necesita otra interfaz verificada, o una extensión de Mixxx, para un `loadByPath` con confirmación inequívoca del archivo.

Fuentes primarias:

- [Control Objects de Mixxx 2.5](https://manual.mixxx.org/2.5/en/chapters/appendix/mixxx_controls.html).
- [Controller scripting de Mixxx](https://github.com/mixxxdj/mixxx/wiki/Midi-Scripting).
- [Declaraciones `engine-api.d.ts`, rama 2.5](https://github.com/mixxxdj/mixxx/blob/2.5/res/controllers/engine-api.d.ts).
- [Interfaz C++ `ControllerScriptInterfaceLegacy`](https://github.com/mixxxdj/mixxx/blob/2.5/src/controllers/scripting/legacy/controllerscriptinterfacelegacy.h).
- [Declaraciones MIDI de Mixxx](https://github.com/mixxxdj/mixxx/blob/2.5/res/controllers/midi-controller-api.d.ts).
- [Formato de mapeos MIDI XML](https://github.com/mixxxdj/mixxx/wiki/MIDI-Controller-Mapping-File-Format).
- [Interfaz sequencer de ALSA](https://www.alsa-project.org/alsa-doc/alsa-lib/seq.html).

## Instalar el monitor independiente

1. Abrí DJ Copilot IA → **Conexión**. **Guardar copia del mapeo** guarda ambos archivos en la carpeta que selecciones y rechaza sobrescribir archivos existentes.
2. Copiá `DJ-Copilot-IA.midi.xml` y `DJ-Copilot-IA-scripts.js` al directorio de controladores del usuario de Mixxx. En instalaciones estándar de Linux suele ser `~/.mixxx/controllers/`; comprobá la ubicación de tu perfil/paquete si usás otro formato de instalación.
3. Seleccioná **Mixxx por MIDI / ALSA** en el copiloto. Un proceso Python de biblioteca estándar carga `libasound.so.2` y crea un puerto virtual llamado **DJ Copilot IA**. Solo recibe eventos; no manda comandos ni usa sudo.
4. Abrí Mixxx con el puerto ya creado. Si estaba abierto y no aparece el puerto, reiniciá Mixxx cuando sea seguro hacerlo.
5. En Preferencias → Controladores, seleccioná el **puerto virtual**, elegí **DJ Copilot IA — Monitor de solo lectura** y habilitalo. Conservá el dispositivo DDJ-200 con su mapeo actual. No asignes el monitor a la controladora física.
6. Confirmá que la salida MIDI del puerto virtual esté habilitada. El script debe poder enviar SysEx a ese mismo dispositivo virtual. Usá `aconnect -l` para inspeccionar los enlaces si no llega telemetría. No hay que conectar la DDJ-200 al copiloto.
7. Cargá y reproducí un archivo manualmente en Mixxx. Deben llegar ambos paquetes de deck aunque el segundo esté vacío. La app solo declara conexión al recibir paquetes válidos de ambos decks dentro de los últimos dos segundos.

No se instala automáticamente ningún archivo en el perfil de Mixxx y no se cambia configuración del sistema. Al cerrar o cambiar a simulación se cierra el puerto virtual; al reconectar puede hacer falta reactivar el controlador en Mixxx.

## Estado de verificación

- Verificados: controles y firmas de la API instalada, XML y JavaScript generados, interoperabilidad del script real con el decodificador Node en una prueba con `engine` simulado, versión/checksum/caducidad y bloqueo de comandos en modo real.
- Verificado en el entorno aislado de comandos: la ausencia de `/dev/snd/seq` produce un error explícito; no se muestra una conexión ficticia.
- Verificado al abrir Electron en el escritorio Ubuntu: el proceso Python creó correctamente el puerto ALSA real `128:0`. El puerto se cerró al finalizar la prueba. La app siguió mostrando que esperaba telemetría de Mixxx.
- **Pendiente:** selección del preset en Mixxx, recepción desde el proceso Mixxx y coexistencia física con la DDJ-200. No se instalaron mapeos en el perfil del usuario ni se tuvieron los MP3 solicitados durante la implementación.
- Las pruebas de protocolo no sustituyen esta validación física. No afirmar «integración comprobada en vivo» hasta completar la guía manual.

## Protocolo v1

Cada deck emite 40 bytes SysEx. Se utiliza el identificador educativo/no comercial `0x7d`; no es un identificador de fabricante exclusivo. Los datos son enteros little endian empaquetados en grupos de 7 bits.

| Offset | Longitud | Valor                                               |
| ------ | -------- | --------------------------------------------------- |
| 0      | 1        | `F0`                                                |
| 1–6    | 6        | `7D 44 4A 43 49 01` (firma DJCI + versión)          |
| 7      | 1        | Deck 1 o 2                                          |
| 8      | 1        | Flags: loaded=1, play=2, cue válido=4, scratching=8 |
| 9      | 2        | Secuencia módulo 16384                              |
| 11     | 3        | BPM ×100                                            |
| 14     | 3        | BPM originales ×100                                 |
| 17     | 4        | Duración en milisegundos                            |
| 21     | 4        | Posición en milisegundos                            |
| 25     | 4        | CUE en milisegundos, válido solo con flag           |
| 29     | 3        | Ratio de tempo ×10000                               |
| 32     | 6        | Reservados, todos cero                              |
| 38     | 1        | Suma de bytes 1…37 módulo 128                       |
| 39     | 1        | `F7`                                                |

La firma y checksum detectan formatos ajenos y corrupción; no son autenticación criptográfica de otros procesos locales. El protocolo v1 no tiene comandos de escritura.

## Carga automática futura

No navegar a ciegas por la selección de la biblioteca con teclas/MIDI: el usuario podría cambiarla entre la selección y la carga. Tampoco modificar la base SQLite de Mixxx en ejecución, activar Auto DJ ni usar controles que inician reproducción.

Para habilitar `loadByPath`, la futura integración debe confirmar identidad del archivo, estado actual de ambos decks, reserva explícita del destino, identificador de operación, ACK de carga y timeout. Debe revalidar cada paso dentro de Mixxx, dejando de actuar si el usuario interviene; nunca resolver una carrera pausando al DJ. El contrato de adaptador del MVP deja esa capacidad apagada hasta que exista evidencia.
