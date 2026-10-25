# Validación · etapa 3

Fecha: 25 de octubre de 2026. Ubuntu; Mixxx instalado `2.5.6-1~noble`; Node `24.14.1`; Electron `44.9.3`; Qt de runtime/headers `6.4.2`. Las versiones npm resueltas quedan en `package-lock.json`; no se agregaron dependencias npm.

**Resultado: prototipo de comunicación/observación/comprobación integrado. No se implementó la carga automática real.** La Fase B original, que requiere cargar un MP3 por ruta y dejarlo pausado, sigue pendiente de una transacción segura dentro del motor. El servidor y el cliente niegan carga, tempo y CUE aunque se intente enviar la orden directamente.

| Comprobación                                                        | Resultado y alcance                                                                                            |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Motor y seguridad                                                   | 22 casos aprobados; simulador                                                                                  |
| Biblioteca, importación, persistencia y exportación                 | 4 casos aprobados                                                                                              |
| Contrato MIDI v1 y transporte                                       | 6 casos aprobados                                                                                              |
| Identidad/asociación MIDI v2 e historial                            | 14 casos aprobados                                                                                             |
| Cliente nativo, protocolo, historial y bloqueos                     | 9 casos aprobados; mensajes de prueba, sin Mixxx                                                               |
| Servidor C++ + cliente Node por Unix socket real                    | 8 casos aprobados; permisos, autorización, vencimiento, rutas, cancelación, duplicados y rechazo de escrituras |
| `npm run build`                                                     | Compilación web de producción aprobada                                                                         |
| `npm run format:check`                                              | Aprobado                                                                                                       |
| `npm run test:desktop`                                              | Aprobado; Electron con `chromiumSandbox: true`; simulación, MIDI artificial y modo nativo sin puente           |
| Servidor C++ independiente                                          | Compilado con g++ C++17, Qt6 Core/Network, `-Wall -Wextra -Werror`                                             |
| Archivo de integración `copilot_bridge.cpp`                         | Compilado a objeto con C++20 contra headers reales de Mixxx 2.5.6; no link de Mixxx completo                   |
| Parche sobre checkout separado                                      | Aplicado al commit fijado; diff comprobado                                                                     |
| Compilar/linkear y ejecutar Mixxx completo modificado               | **Pendiente**                                                                                                  |
| Identidad nativa con MP3 reales / DDJ-200                           | **Pendiente de prueba física**                                                                                 |
| Carga automática real, tempo y CUE nativos                          | **No implementados; capacidades deshabilitadas**                                                               |
| MIDI v2, asociación, invalidación, desconexión/reconexión y DDJ-200 | **Confirmados físicamente por el usuario** al iniciar etapa 3; no se repitió hardware durante esta entrega     |

## Pruebas de aplicación

**55 casos Node**, distribuidos en cinco archivos. `npm test` puede mostrar el resumen por archivo en este entorno. Se conservan los 46 casos anteriores y se agregan 9. Los existentes cubren la preparación protegida del simulador, persistencia, importación sin cambiar bytes, protocolo MIDI, asociación manual y migración v1.

Las pruebas nuevas de `tests/native.test.mjs` comprueban:

- Identidad con procedencia nativa válida y vínculo exacto con biblioteca; ninguna capacidad extra anunciada por el servidor habilita carga.
- Rechazo del ejecutable `fixture-only` por el cliente de producción.
- Autenticación sin primer estado, mensajes inválidos, sesiones equivocadas, secuencias repetidas, fechas antiguas/futuras y campos fuera de rango.
- Descarte de un resultado de biblioteca si cambió la carga mientras se resolvía.
- Cancelación, timeout, rechazo de ACK tardío y ausencia de reenvío de operaciones.
- Historial real compartido entre MIDI/nativo y separado de simulación.
- Conservación de modos existentes y bloqueo de automático/preparación nativa.

No ejecutan Mixxx. Sus mensajes identificados como nativos ejercitan el cliente, no certifican audio ni un MP3 real.

## Transporte C++ real

`npm run test:native` construye `native/bridge_server.cpp` con `native/tests/fixture.cpp`; conecta `NativeAdapter` por sockets Unix reales. Los 8 casos verifican directorio/token/socket privados, autenticación, comprobación sin carga, comandos prohibidos, destino ocupado, revisiones de ambos decks, permiso de 10 s y vencimiento, ambos decks activos, rutas inexistentes/fuera de raíz/symlinks, cancelación, reconexión con nueva sesión, IDs duplicados y credencial incorrecta.

Los archivos con extensión MP3 de estos tests contienen texto de fixture: se prueba acceso/ruta, **no decodificación ni reproducción**. El cliente de aplicación no acepta ese proveedor de pruebas. No se arrancó un segundo puerto ALSA ni se conectó a un puente del usuario.

La sandbox bloqueó `QLocalServer::listen`; el mismo comando se ejecutó con autorización fuera de la sandbox. No se relajaron permisos del socket ni se habilitó red para hacerlo pasar.

## Compilación contra Mixxx

Se descargó un checkout oficial separado en `/tmp/dj-copilot-mixxx-2.5.6`, fijado en `3ebac449e7e5fe2a0186596657696e87ce8b0e56`. Se aplicó `scripts/native-prepare.mjs` y se verificó el diff. No se modificó `/usr/bin/mixxx`, ningún perfil estable ni archivos del mapeo DDJ-200.

El entorno no tenía CMake ni el conjunto completo de dependencias de desarrollo de Mixxx. Se descargaron y extrajeron paquetes de headers/herramientas **en `/tmp`**, sin instalarlos en el sistema. Se generó `keys.pb.h` con Protobuf 3.21 y se compiló `copilot_bridge.cpp` a `/tmp/dj-copilot-mixxx-observer.o`, usando los headers reales del tag y C++20. Esto comprueba tipos, señales y llamadas del observador; no comprueba enlazado, inicialización ni comportamiento de audio de Mixxx completo. El header upstream `rigtorp/SPSCQueue` emitió la advertencia de GCC sobre `hardware_destructive_interference_size`; no hubo errores de compilación.

El servidor independiente sí se enlazó con las bibliotecas Qt6 Core/Network instaladas y se ejecutó en los tests de socket. No confundir ese ejecutable fixture con un Mixxx modificado funcional.

## Prueba Electron y capturas

La prueba abrió una biblioteca temporal, ensayó los tres temas sin audio, verificó pausa de los preparados, importó un MP3 sintético y guardó un CUE. Luego ejercitó asociación MIDI v2, comprobación explícita del usuario, título/artista/ruta, historial manual, cambio de carga, caducidad y recuperación. Finalmente seleccionó el modo nativo con una dirección de prueba inexistente y comprobó conexión caída, identidad desconocida, controles de preparación/autorización deshabilitados y cancelación.

`desktop-entry.mjs` sustituye únicamente el arranque ALSA por la VM del mapeo durante la prueba; usa ventana, preload, IPC y backend de producción. No crea otro puerto MIDI real. Las esperas consultan el resultado resuelto del IPC. El sandbox de Chromium permanece activo.

Capturas locales generadas en `artifacts/` (datos de prueba; no evidencia de hardware):

- [Cabina simulada](../artifacts/cabina.png).
- [Biblioteca sintética](../artifacts/biblioteca.png).
- [Monitor MIDI de prueba](../artifacts/monitor-midi.png).
- [Asociación manual](../artifacts/asociacion-manual.png).
- [Deck asociado](../artifacts/deck-asociado.png).
- [Prototipo nativo sin puente, carga bloqueada](../artifacts/nativo-prototipo.png).

No se aportaron ni descargaron los MP3 del usuario. No hubo reproducción automática real, envío de música a servicios externos ni escrituras en los controles de Mixxx.

## Validación pendiente

Seguir [NATIVO.md](NATIVO.md) para compilar la variante completa, ejecutarla con perfil separado, probar señales/identidad y comprobaciones con DDJ-200 y volver al Mixxx estable. El nuevo protocolo no reemplaza el MIDI validado por el usuario.

La preparación real de Orgullosa y luego 18 Kilates requiere implementar primero el commit de carga cancelable dentro del motor, sin cierre anticipado de fuente, cambios de play, resets de EQ/ganancia o propagación de tempo al deck activo. Después deben verificarse fallos y carreras reales, archivo confirmado, pausa final, tempo y CUE. No activar capacidades para saltarse esos pasos. El diseño, evidencia y tareas concretas están documentados en la guía nativa.
