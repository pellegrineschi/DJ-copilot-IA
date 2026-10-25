# Integración con Mixxx: evidencia y límites

Investigación inicial: 22 de octubre de 2026. Revisiones de etapas 2 y 3: 25 de octubre de 2026. En el entorno se detectó `mixxx 2.5.6-1~noble` mediante `dpkg-query`. Se contrastaron las declaraciones instaladas en `/usr/share/mixxx/controllers/engine-api.d.ts` y `midi-controller-api.d.ts` con el código fuente del **tag 2.5.6**. No se presupone una API REST ni un método para cargar rutas desde un script.

Resultado: en la versión instalada no se encontró una interfaz de controller scripting que entregue título, artista, ruta o ID estable del archivo. Se implementó **asociación manual con biblioteca**. La ruta presentada pertenece a esa selección, no a una respuesta de Mixxx. La carga automática real permanece deshabilitada. Etapa 3 agrega un [prototipo C++ separado](NATIVO.md) de observación y comprobación, todavía sin carga ni validación física nueva.

## Operaciones verificadas en documentación/código

| Necesidad                   | Interfaz real                                     | Decisión del MVP                                                |
| --------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| Saber si reproduce          | `engine.getValue('[ChannelN]', 'play')`           | Enviar como telemetría                                          |
| Saber si hay canción        | `track_loaded`                                    | Enviar sin inferir la identidad                                 |
| BPM                         | `bpm`, `file_bpm`                                 | Mostrar desconocido si el valor es cero                         |
| Duración y avance           | `duration`, `playposition`                        | Segundos; avance aproximado a 2 Hz                              |
| CUE existente               | `cue_point`, `track_samples`                      | Convertir a segundos por proporción de muestras; -1 es ausencia |
| Saber si se toca el jog     | `engine.isScratching(deck)`                       | Bandera diagnóstica; no implica permiso de carga                |
| Suscribirse a controles     | `engine.makeConnection`                           | v2: eventos buffered de carga + estado periódico                |
| Temporizador                | `engine.beginTimer` / `stopTimer`                 | Capturar ambos decks cada 500 ms                                |
| Enviar estado MIDI          | `midi.sendSysexMsg`                               | Paquete numérico con firma, versión y checksum                  |
| Cargar canción resaltada    | `LoadSelectedTrack`                               | Existe, pero no determina la ruta o identidad; no se utiliza    |
| Cargar y reproducir         | `LoadSelectedTrackAndPlay`                        | Prohibido para este producto                                    |
| Modificar tempo / posición  | `rate`, `playposition`, controles CUE             | Técnicamente expuestos; v1 y v2 no escriben ninguno             |
| Cargar ruta elegida en Node | Sin método en la interfaz legacy inspeccionada    | No implementado; simulación y M3U como alternativa              |
| Leer título, artista o ruta | No expuesto en el `engine` de 2.5.6 inspeccionado | «Identidad desconocida» o selección manual explícita            |

`cue_point / track_samples * duration` evita asumir una cantidad fija de canales o confundir muestras con frames. El tempo relativo se estima con `1 + rate * rateRange * rate_dir`; el tiempo restante es aproximado y no modela loops, reversa, scratching ni futuros cambios de velocidad. La barra de avance **no es una forma de onda analizada**.

Estos hallazgos son sobre la interfaz investigada, no una afirmación de que Mixxx nunca pueda ofrecer otras extensiones. Se necesita otra interfaz verificada, o una extensión de Mixxx, para un `loadByPath` con confirmación inequívoca del archivo.

## Por qué el evento de carga sirve, pero no identifica el archivo

En `EngineBuffer::slotTrackLoaded`, Mixxx 2.5.6 llama a `m_pTrackLoaded->forceSet(1)` tras cada carga correcta. La expulsión usa `forceSet(0)`. Por lo tanto, una nueva carga puede emitir **1→1**, aun si BPM/duración/posición coinciden. El v2 incrementa un contador por callback sin deduplicar el valor booleano. La conexión buffered conserva los callbacks; no se usa `makeUnbufferedConnection`, que puede comprimir actualizaciones. Se revisó también `ControlObjectScript::slotValueChanged`, que invoca el callback sin deduplicar por valor. Fuentes: [EngineBuffer 2.5.6](https://github.com/mixxxdj/mixxx/blob/2.5.6/src/engine/enginebuffer.cpp) y [ControlObjectScript 2.5.6](https://github.com/mixxxdj/mixxx/blob/2.5.6/src/control/controlobjectscript.cpp).

El contador señala una **carga nueva**, no una canción determinada. Copilot borra la asociación de ese deck y exige volver a elegir el MP3. No usa nombres aproximados ni correspondencias por BPM/duración. La prueba automática reproduce estos callbacks; queda pendiente comprobar que el preset nuevo los recibe en la instalación física del usuario.

## Otras vías investigadas

- **API del mapeo instalado:** `getValue` devuelve valores numéricos; no hay un `getTrack`, `getPlayer` ni `loadTrack(path)` en la interfaz 2.5.6 inspeccionada. [ControllerScriptInterfaceLegacy 2.5.6](https://github.com/mixxxdj/mixxx/blob/2.5.6/src/controllers/scripting/legacy/controllerscriptinterfacelegacy.h).
- **Desarrollo posterior:** la rama `main` consultada declara `engine.getPlayer(group)` y un objeto `Player` con señales de metadatos. Eso **no está en 2.5.6**, ni demuestra carga por ruta con confirmación. No se utilizó ni se actualizó Mixxx. [Declaraciones de desarrollo](https://github.com/mixxxdj/mixxx/blob/main/res/controllers/engine-api.d.ts).
- **Metadatos de broadcasting:** el manual permite metadatos de transmisión, incluso personalizados/estáticos. No aportan un vínculo verificable entre cada deck, el archivo y su ruta; tampoco cubren de forma suficiente el deck pausado. No se inicia un stream para resolverlo. [Live broadcasting 2.5](https://manual.mixxx.org/2.5/en/chapters/livebroadcasting).
- **Exportar M3U:** sirve para llevar rutas explícitas de la biblioteca de Copilot a Mixxx. La exportación no informa qué archivo se cargó después en cada deck.
- **API nativa:** `BaseTrackPlayer` tiene `getLoadedTrack`, señales de carga y `slotLoadTrack(TrackPointer, bool)`; `PlayerManager` tiene `slotLoadLocationToPlayer(QString, QString, bool)`. Son interfaces C++ internas, no endpoints externos ni métodos de JavaScript. Fuentes: [BaseTrackPlayer 2.5.6](https://github.com/mixxxdj/mixxx/blob/2.5.6/src/mixer/basetrackplayer.h) y [PlayerManager 2.5.6](https://github.com/mixxxdj/mixxx/blob/2.5.6/src/mixer/playermanager.h). Una integración nativa podría partir de ellas, pero requeriría desarrollar y validar cambios dentro de Mixxx; no se puede declarar segura una extensión por la mera existencia de esos métodos.
- **Comunicaciones externas:** MIDI SysEx transporta los datos que el script conoce; cambiar el transporte no hace aparecer rutas ausentes de su API. No se encontró en las interfaces revisadas un servicio externo documentado que cumpla identidad, carga por ruta y confirmación. No se usa acceso a SQLite de Mixxx ni navegación por teclado.

Fuentes primarias adicionales:

- [Control Objects de Mixxx 2.5](https://manual.mixxx.org/2.5/en/chapters/appendix/mixxx_controls.html).
- [Controller scripting de Mixxx](https://github.com/mixxxdj/mixxx/wiki/Midi-Scripting).
- [Declaraciones `engine-api.d.ts`, tag 2.5.6](https://github.com/mixxxdj/mixxx/blob/2.5.6/res/controllers/engine-api.d.ts).
- [Declaraciones MIDI 2.5.6](https://github.com/mixxxdj/mixxx/blob/2.5.6/res/controllers/midi-controller-api.d.ts).
- [Formato de mapeos MIDI XML](https://github.com/mixxxdj/mixxx/wiki/MIDI-Controller-Mapping-File-Format).
- [Interfaz sequencer de ALSA](https://www.alsa-project.org/alsa-doc/alsa-lib/seq.html).

## Instalar v2 conservando el monitor existente y la Pioneer

1. Abrí DJ Copilot IA → **Conexión → Guardar copia del mapeo v2**. Guarda ambos archivos en la carpeta que selecciones y rechaza sobrescribir archivos existentes. Esta entrega no instaló nada automáticamente en tu perfil.
2. Copiá `DJ-Copilot-IA-v2.midi.xml` y `DJ-Copilot-IA-v2-scripts.js` al directorio de controladores del usuario de Mixxx. En instalaciones estándar de Linux suele ser `~/.mixxx/controllers/`; comprobá la ubicación de tu perfil/paquete. Conservá los dos archivos v1 y los de Pioneer. Si el destino ya contiene v2, guardá la copia en una carpeta vacía para revisarla.
3. Seleccioná **Mixxx por MIDI / ALSA** en el copiloto. Un proceso Python de biblioteca estándar carga `libasound.so.2` y crea un puerto virtual llamado **DJ Copilot IA**. Solo recibe eventos; no manda comandos ni usa sudo.
4. Abrí Mixxx con el puerto ya creado. Si estaba abierto y no aparece el puerto, reiniciá Mixxx cuando sea seguro hacerlo.
5. En Preferencias → Controladores, seleccioná el **puerto virtual**, elegí **DJ Copilot IA v2 — Asociación manual segura** y habilitalo. Usá un único preset en ese puerto. Conservá el dispositivo DDJ-200 con su mapeo actual. No asignes el monitor a la controladora física.
6. Confirmá que la salida MIDI del puerto virtual esté habilitada. El script debe poder enviar SysEx a ese mismo dispositivo virtual. Usá `aconnect -l` para inspeccionar los enlaces si no llega telemetría. No hay que conectar la DDJ-200 al copiloto.
7. Cargá y reproducí un archivo manualmente en Mixxx. Deben llegar ambos paquetes de deck aunque el segundo esté vacío. La app solo declara conexión al recibir paquetes válidos de ambos decks dentro de los últimos dos segundos.
8. Importá el MP3 en Copilot, abrí **Cabina → Asociar canción** y verificá que el archivo seleccionado sea el que cargaste en Mixxx. La etiqueta debe indicar **Identidad seleccionada manualmente**, con la ruta de biblioteca. Probar el cambio de canción es obligatorio antes de confiar en la asociación durante una sesión: ver [PRUEBAS.md](PRUEBAS.md).

**Volver a v1:** seleccioná otra vez **DJ Copilot IA — Monitor de solo lectura** en el mismo puerto virtual. Los archivos originales no cambiaron y siguen funcionando. La telemetría numérica continúa; la identidad vuelve a desconocida y la asociación queda deshabilitada porque v1 no informa generaciones de carga. No hace falta tocar la DDJ-200.

No se instala automáticamente ningún archivo en el perfil de Mixxx y no se cambia configuración del sistema. Al cerrar o cambiar a simulación se cierra el puerto virtual; al reconectar puede hacer falta reactivar el controlador en Mixxx.

## Estado de verificación y procedencia

- **Informado por el usuario antes de etapa 2:** v1 recibe telemetría real de Mixxx; BPM, duración, posición, reproducción y CUE funcionan; la DDJ-200 opera simultáneamente.
- **Verificado automáticamente en etapa 2:** scripts v1/v2 ejecutados en VM con controles de prueba, parser de producción, invalidación de identidad, orden/caducidad, asociación con archivo importado, historial y bloqueos de preparación; también UI Electron con datos aislados. No se abrió un segundo puerto físico durante esta prueba de escritorio.
- **Confirmado por el usuario al iniciar etapa 3:** MIDI v2, asociación con título/artista, invalidación por cambio de archivo, desconexión, recuperación y uso simultáneo de DDJ-200 funcionan físicamente. Se preservan los mapeos y el transporte.
- **Pendiente:** compilar y ejecutar la variante nativa con Mixxx/DDJ-200. Las pruebas de socket C++ y controles artificiales no sustituyen esa validación.

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

La alternativa recomendada ahora es **M3U → carga manual en Mixxx → asociación manual**. Para automatizar después, desarrollar un puente local dentro de una versión revisada de Mixxx, basado en sus interfaces C++ de carga y señales de archivo. Etapa 3 incorpora ese [prototipo de observación y comprobación](NATIVO.md), con transporte compilado y probado. No se instaló ni ejecutó una variante completa de Mixxx y no se implementó carga; la auditoría encontró carreras y efectos secundarios que impiden habilitarla.

Para habilitar `loadByPath`, ese puente debe aceptar una ruta canónica y un ID de operación, confirmar el archivo efectivamente cargado (ruta/ID estable y, si corresponde, hash), y operar con un estado/generación esperado del destino. Debe exigir una reserva explícita, rechazar decks activos o preparados manualmente, emitir ACK/error con timeout y revalidar cada paso dentro de Mixxx si el DJ interviene. Solo después de confirmar la carga podría ajustar tempo dentro del margen y CUE verificado, comprobar de nuevo archivo y pausa y avisar «preparado». Nunca resolver una carrera deteniendo reproducción ni iniciar play. Ninguna de estas garantías se obtiene simplemente enviando `LoadSelectedTrack`.

## Protocolo v2 y asociación

Se conservan el transporte ALSA y los campos numéricos de offsets 0–31. El paquete tiene 55 bytes, versión `02` en offset 6 y una bandera adicional `16` cuando está conectada la escucha de `track_loaded`.

| Offset | Longitud | Valor                                                                               |
| ------ | -------- | ----------------------------------------------------------------------------------- |
| 32     | 7        | Nonce de arranque del script, 49 bits, no cero                                      |
| 39     | 4        | Generación por deck, 28 bits, no cero                                               |
| 43     | 6        | `Date.now()` de emisión en ms, 42 bits                                              |
| 49     | 4        | Secuencia completa por deck, 28 bits; sus 14 bits inferiores coinciden con offset 9 |
| 53     | 1        | Suma de bytes 1…52 módulo 128                                                       |
| 54     | 1        | `F7`                                                                                |

Cada arranque cambia el nonce. Antes del desbordamiento de contadores, se rota la sesión. No es autenticación ni ID de archivo. Se ignoran sesiones retiradas (hasta 128), secuencias repetidas/regresivas, generaciones regresivas y fechas regresivas. Emisión mayor a 2 s de antigüedad o más de 250 ms en el futuro se rechaza; ambos procesos deben usar el reloj del mismo equipo Ubuntu. La frescura v2 se cuenta desde la emisión (o recepción si el reloj emisor está adelantado), de modo que un paquete demorado no recibe dos segundos adicionales al llegar. El receptor vuelve a desconocido un deck vencido y exige nuevos datos estables antes de asociar. Una reconexión del adaptador descarta todas las asociaciones.

La asociación requiere dos muestras y al menos 500 ms sin cambios de generación, ambos decks recientes y escuchas v2 conectadas. Comprueba UUID y SHA-256 de la biblioteca, que el archivo siga disponible y sin cambios, y que el token del deck siga vigente después de leerlo. No afirma coincidencia del archivo con Mixxx. Se puede quitar o cambiar la asociación sin enviar comandos al programa.

El historial MIDI solo admite un registro explícito del usuario mientras el deck asociado reproduce; queda marcado manual y se deduplica por sesión/canción/modo. La mera asociación, un cambio de BPM o un paquete de play no crean una reproducción real confirmada.
