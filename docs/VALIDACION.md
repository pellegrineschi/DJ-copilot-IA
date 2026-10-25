# Validación · etapa 2

Fecha: 25 de octubre de 2026. Ubuntu; Mixxx instalado `2.5.6-1~noble`; Node `24.14.1`; Electron `44.9.3`. Las versiones npm resueltas quedan en `package-lock.json`; no se agregaron dependencias en esta etapa.

| Comprobación                                                      | Resultado                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| Motor y seguridad                                                 | 22 pruebas aprobadas                                    |
| Biblioteca, importación, persistencia y exportación               | 4 pruebas aprobadas                                     |
| Contrato v1, parser, frescura, compatibilidad y lectura exclusiva | 6 pruebas aprobadas                                     |
| Identidad v2, eventos, asociación, biblioteca e historial         | 14 pruebas aprobadas                                    |
| `npm run build`                                                   | Compilación de producción aprobada                      |
| `npm run format:check`                                            | Aprobado                                                |
| `npm run test:desktop`                                            | Aprobado con Electron abierto y `chromiumSandbox: true` |
| Preservación de integración v1                                    | Script v1, XML v1 y receptor ALSA sin cambios           |
| Telemetría v1 de Mixxx real / uso simultáneo de DDJ-200           | Validado por el usuario antes de esta etapa             |
| Mapeo v2 en Mixxx real y asociación con los tres MP3              | Pendiente de prueba física del usuario                  |
| Identificación automática de archivo                              | No disponible en la API de mapeos 2.5.6 inspeccionada   |
| Carga automática real en Mixxx                                    | No implementada; capacidad deshabilitada                |

**46 casos automatizados** distribuidos en cuatro archivos. `npm test` puede mostrar el resumen por archivo en este entorno. Las 31 pruebas originales se conservan; se agregan 15. `tests/identity.test.mjs` ejecuta el script v2 distribuido con un `engine` de prueba, pasa sus paquetes por el decodificador/adaptador de producción y comprueba:

- Estado desconocido/manual y vínculo con UUID/hash/ruta del archivo importado; ninguna identidad confirmada automáticamente inventada.
- Reemplazo 1→1 con valores numéricos idénticos, independencia de decks, expulsión y pérdida de un paquete recuperada por el contador del latido siguiente.
- Conservación de asociación al cambiar tempo/posición/play; invalidación por vencimiento, reinicio, pérdida del seguimiento y cambio de modo.
- Rechazo de datos incompletos, corruptos, duplicados, fuera de orden, antiguos o futuros; conexión parcial y recuperación después de errores.
- Verificación del archivo local, rechazo si cambia/desaparece, y token revocado mientras se lee el archivo.
- Historial manual explícito, prohibición de registrar un deck pausado/desconocido, deduplicación entre decks y separación de simulación/MIDI.
- Migración de una base con esquema v1 conservando IDs, fechas y pistas, también después de reabrirla.
- Preparación/automático reales bloqueados aun después de asociar una canción que está reproduciéndose.

La prueba Electron comprobó el ciclo de simulación de los tres temas, pausa del tema preparado, importación de MP3 sintético por diálogo/IPC, CUE de 1,25 s y búsqueda. Después abrió la asociación manual, comprobó que requiere marcar la verificación, mostró título/artista/ruta, registró explícitamente la reproducción y rechazó una ventana vieja después de un cambio de carga. También comprobó caducidad y recuperación sin restaurar la asociación anterior. Las esperas consultan el resultado resuelto del IPC, no una promesa tratada como verdadera.

Se corrigió el arranque desde editores que heredan `ELECTRON_RUN_AS_NODE=1`: los lanzadores de producción, desarrollo y pruebas eliminan esa variable para iniciar Electron como aplicación gráfica. No se usa `--no-sandbox`.

En la entrega inicial del 22 de octubre, Electron pudo crear el puerto ALSA `128:0`; luego el usuario confirmó la recepción efectiva desde Mixxx y el uso simultáneo de la Pioneer. **La prueba de escritorio de etapa 2 usa un arranque de prueba separado, sin crear un puerto ALSA real** para no competir con la conexión existente. Ejecuta la ventana, preload, IPC y backend de producción, con controles y datos de prueba. Esto no valida callbacks del nuevo preset dentro de Mixxx real.

Capturas de Electron con biblioteca y telemetría de prueba; no son evidencia de identificación de los MP3 del usuario:

- [Cabina y escenario de tres temas](../artifacts/cabina.png).
- [Biblioteca con MP3 sintético importado](../artifacts/biblioteca.png).
- [Monitor v2 con identidad desconocida](../artifacts/monitor-midi.png).
- [Selector de asociación manual](../artifacts/asociacion-manual.png).
- [Deck asociado y registro manual](../artifacts/deck-asociado.png).

No se aportaron ni descargaron los MP3 de El Original, Eh Guacho o 18 Kilates. No se modificó el mapeo DDJ-200 ni ningún archivo de música del usuario. No hubo generación de audio, reproducción automática real ni envío de música a servicios externos.

## Pendientes físicos y límites

Completar [la prueba v2 con los tres MP3](PRUEBAS.md): seleccionar el preset separado, asociar ambos decks, reemplazar/recargar incluso con números idénticos, expulsar, comprobar desconexión/reconexión y coexistencia DDJ-200. Hasta entonces v2 se considera implementado y probado con controles simulados, **pendiente de validación física**.

La ruta/hash comprobada es del archivo importado en Copilot: no confirma el archivo abierto por Mixxx. El estado manual siempre depende de que el DJ elija el archivo correcto. La investigación y la alternativa nativa para una carga futura con confirmación están en [MIXXX.md](MIXXX.md). La preparación automática real queda deshabilitada y no corresponde ejecutar la segunda prueba física de carga automática todavía.
