# DJ Copilot IA

Aplicación de escritorio para Ubuntu con Electron, React, Vite, Node.js y SQLite. Prepara una biblioteca y permite ensayar la selección del próximo tema mientras vos decidís cuándo mezclar.

**Etapa 3.1 · Mixxx experimental compilado y conectado:** se compiló y enlazó Mixxx 2.5.6 completo en un checkout separado, con interfaz, motor y puente nativo. El ejecutable real se abrió con perfil propio y Copilot de producción se conectó por socket Unix autenticado. Se verificaron 120 actualizaciones durante 30 segundos, dos decks vacíos, rechazo de escrituras y reconexión con sesión nueva. **Identidad de canciones, reproducción y DDJ-200 en modo nativo siguen pendientes de prueba física.**

**La carga por ruta y preparación automática real continúan deshabilitadas.** La ruta interna de carga de Mixxx requiere cambios adicionales para evitar carreras con PLAY y resets de EQ/ganancia. No se presenta una comprobación como carga o preparación. Ver [investigación, instalación aislada, pruebas y recuperación](docs/NATIVO.md).

El usuario confirmó físicamente **MIDI v2**, asociación manual, invalidación al cambiar de canción, desconexión/reconexión y coexistencia con la DDJ-200. Se conserva esa integración y el simulador de preparación sin audio. La asociación manual sigue disponible en modo MIDI.

## Empezar en Ubuntu

Requisitos: Node.js **24 o posterior**, npm y una sesión gráfica. Mixxx **2.5.6** es la versión investigada; Python 3 y `libasound.so.2` hacen falta para el monitor MIDI. La app, simulador y MIDI no necesitan módulos npm nativos de SQLite/MIDI, compilador C++ ni paquetes pip. Las dependencias de compilación nativa se prepararon localmente, sin instalar paquetes del sistema: ver [compilación y ejecución comprobadas](docs/COMPILACION-NATIVA.md).

```bash
cd "/opt/lampp/htdocs/DJ copilot IA"
npm ci
npm run build
npm start
```

La primera instalación y la descarga inicial del binario de Electron requieren internet. Una vez instaladas las dependencias y el binario, el funcionamiento básico es offline. No hay API keys, servicios remotos ni reproductor de audio dentro de la app.

Para desarrollar con recarga de la interfaz:

```bash
npm run dev
```

Para comprobar requisitos:

```bash
npm run doctor
```

Si aparece `ALSA sequencer: PENDIENTE`, podés usar todas las funciones de simulación y biblioteca. El monitor necesita `/dev/snd/seq` en la sesión donde corre Electron. No hay que ejecutar la aplicación como root. Ver [configuración de Mixxx](docs/MIXXX.md) y [pruebas manuales](docs/PRUEBAS.md).

## Probar el escenario de tres temas

1. Abrí **Cabina → Iniciar demo de 3 temas**. Deck 1 simula El Original y queda un deck libre.
2. Pulsá **Preparar siguiente**: Orgullosa queda en Deck 2, pausada, con el tempo y CUE del escenario de prueba.
3. Activá **Preparación automática**.
4. Pulsá **Simular cambio de deck**. Esta acción representa tu intervención manual: comienza el Deck 2 y se detiene el Deck 1, únicamente dentro del simulador.
5. El copiloto prepara 18 Kilates en Deck 1 y lo deja pausado.

La demo usa los nombres solicitados, pero **BPM, duración y CUE son fixtures ficticios**. No contiene los MP3, no reproduce sonido y no es análisis de esas grabaciones. Los datos de prueba no se exportan a M3U ni se muestran como archivos reales en modo MIDI.

## Trabajar con tus archivos

- **Importar música**: seleccioná una carpeta. Se recorren subcarpetas y se leen MP3/MP3 en mayúsculas, etiquetas ID3 y duración. No se siguen enlaces simbólicos. Los archivos no se modifican.
- Se detectan duplicados exactos por SHA-256 y por ruta. Un remaster, versión extendida o archivo recodificado distinto no se considera duplicado musical automáticamente. Los archivos corruptos se informan y no impiden importar los demás.
- En **Biblioteca**, buscá por artista, título, BPM o género. Marcá favoritos y usá `+` para agregar canciones a la playlist activa.
- **Editar** permite guardar BPM verificados y un CUE en segundos dentro de la duración del tema. Un campo vacío significa desconocido; `0` es un CUE explícito al inicio. Los CUE y cambios se guardan solo en la base del copiloto, no en Mixxx ni en etiquetas MP3.
- En simulación, **Deck…** permite cargar una canción manualmente. Queda reservada para vos. **Play demo** representa reproducción sin audio. Para usar el otro deck, **Vaciar** lo libera; el candado permite reservarlo durante una preparación manual.
- El **modo seguro** exige un CUE. Desactivarlo permite comenzar al inicio del archivo sin afirmar que existe un CUE musical. Las protecciones de decks activos y reservados permanecen siempre encendidas.
- El tempo se ajusta en simulación solo si ambos BPM son conocidos y el cambio entra en el límite (±4 % inicial, configurable de 1 a 8 %). Si no, se conserva el original y se informa. BPM compatibles no garantizan fraseo, armonía ni una transición correcta.
- La playlist se puede reordenar, cambiar y exportar como M3U8 UTF-8. Se excluyen los temas ya reproducidos de las recomendaciones. Cambiar canciones, CUE, orden o playlist desactiva la automatización para revisar el nuevo recorrido.
- **Preparar set** calcula cantidad de temas. A 120 s por canción y 14 s de solapamiento, 4 horas requieren aproximadamente 136 temas. El orden del MVP es manual; no se inventa energía ni afinidad musical.
- **Actividad** guarda eventos e historial. Una nueva sesión permite repetir temas y conserva el historial anterior.

## Alcance y límites

| Función                                     | Simulación                 | Mixxx MIDI v2                      | Prototipo nativo                                       |
| ------------------------------------------- | -------------------------- | ---------------------------------- | ------------------------------------------------------ |
| BPM, posición, duración, reproducción y CUE | Datos de prueba/biblioteca | Telemetría validada por el usuario | Transporte real probado; valores con música pendientes |
| Título, artista e identidad                 | Biblioteca/demo            | Asociación manual                  | Señal nativa y ruta; confirmación con MP3 pendiente    |
| Descartar identidad al cambiar carga        | Sí                         | Generación por deck                | Señales nativas y revisión                             |
| Carga por ruta y preparación automática     | Simulada y protegida       | Deshabilitadas                     | Deshabilitadas                                         |
| Ajuste de tempo y CUE                       | Simulado                   | Sin escrituras                     | Sin escrituras                                         |
| Autorizar y comprobar archivo/deck          | No aplica                  | No aplica                          | Permiso por 10 s; nunca carga                          |
| Mezcla, faders, EQ y efectos automáticos    | Nunca                      | Nunca                              | Nunca                                                  |
| Biblioteca, playlist, favoritos, M3U        | Sí                         | Sí                                 | Sí                                                     |

## Prototipo nativo

El Mixxx estable no contiene el puente. En esta máquina el ejecutable experimental ya está en `~/src/mixxx-copilot-2.5.6/build-copilot/mixxx`, fijado al commit oficial `3ebac449e7e5fe2a0186596657696e87ce8b0e56`. Se abre con el wrapper de dependencias locales y `scripts/native-launch.mjs`, después de cerrar Mixxx habitual cuando sea seguro. El lanzador imprime el directorio IPC nuevo; Copilot debe usarlo y seleccionar **Conexión → Mixxx nativo · prototipo**. La app informa **Mixxx experimental 2.5.6**. Ver [comandos de ejecución y recuperación](docs/COMPILACION-NATIVA.md) y [pruebas físicas con los tres temas/DDJ-200](docs/DDJ200-NATIVO.md).

La carga automática de Orgullosa y después 18 Kilates, el ajuste de BPM y el posicionamiento de CUE pertenecen a **etapa 3.2**. Esta entrega conserva su bloqueo. No se incorporó OpenAI ni voz.

## Asociar tus canciones en Mixxx

1. Compilá y abrí la app con `npm run build` y `npm start`.
2. **Conexión → Guardar copia del mapeo v2**. Instalá sus dos archivos según [MIXXX.md](docs/MIXXX.md). Tienen nombres nuevos: no reemplazan v1 ni el mapeo Pioneer. Elegí el preset v2 únicamente para el puerto virtual DJ Copilot IA.
3. Importá tus MP3. Cargá el archivo en Mixxx desde su biblioteca o una playlist M3U exportada.
4. En **Cabina → Asociar canción**, elegí el archivo importado y comprobá en Mixxx que es el mismo. Guardá la asociación manual. El título y artista provienen de la biblioteca; BPM, duración, CUE y posición siguen viniendo de Mixxx.
5. Al reemplazar o expulsar una canción, reiniciar el mapeo o vencer la telemetría, la identidad vuelve a **desconocida**. Reasociá después de comprobarla. Un cambio de tempo o posición no invalida la asociación.
6. Si querés guardar esa reproducción, pulsá **Registrar reproducción manual** mientras el deck suena. Actividad indica su procedencia manual; no se genera un registro real automáticamente a partir de una asociación.

El archivo se vuelve a leer y se compara con el SHA-256 de la importación antes de asociarlo. Esto comprueba el archivo local, **no prueba qué archivo tiene cargado Mixxx**. Las asociaciones se mantienen solo durante la conexión actual. Los ensayos y el historial real tienen deduplicación separada por sesión, canción y modo.

La app no observa con certeza que el DJ esté preparando manualmente un deck real; por eso el monitor no usa «pausado» como autorización de carga. No lee ni modifica la base de Mixxx, no opera su GUI, no cambia su selección de biblioteca ni reescribe el mapeo de la DDJ-200.

Quedan para etapas posteriores: carga real con identidad y confirmación robustas, selección por energía/género, temas obligatorios/de reserva, análisis de beatgrid, recomendaciones de loops/efectos, IA optativa y voz con salida de audio independiente. Los límites actuales y la ruta para resolverlos están en [investigación de integración](docs/MIXXX.md).

## Datos y privacidad

La base `library.sqlite` vive en `app.getPath('userData')` de Electron (normalmente `~/.config/DJ Copilot IA/` en Linux). Conserva biblioteca, playlists, CUE, preferencias, historial y hasta 1.000 eventos. Los decks y la automatización no se restauran activos tras reiniciar.

Para pruebas o una biblioteca separada:

```bash
DJ_COPILOT_DATA_DIR=/tmp/dj-copilot-prueba npm start
```

Cerrá la app antes de copiar su carpeta de datos para un respaldo. SQLite usa WAL; si la app sigue abierta, copiar solo el `.sqlite` puede omitir cambios. Importaciones incompletas pueden retomarse: los archivos ya guardados se detectan como duplicados.

El renderer tiene aislamiento de contexto, sandbox, Node deshabilitado, CSP y un puente IPC limitado. No hay endpoint HTTP del backend. Las rutas de importación/exportación se eligen con diálogos nativos. La API futura y la voz están documentadas en [extensions/README.md](extensions/README.md), sin servicios pagos implementados ni activados.

## Pruebas y estructura

```bash
npm test                 # pruebas unitarias/integración locales
npm run build            # compilación de producción
npm run test:desktop     # abre Electron con datos temporales; genera capturas
npm run test:native      # opcional: compila C++ y prueba IPC; requiere Qt6 dev/g++
npm run test:native:live -- /tmp/dj-native-XXXXXX 30 # exige Mixxx experimental ya abierto
```

La prueba de escritorio usa una carpeta temporal, un MP3 sintético, controles de Mixxx simulados y diálogos controlados. Ejecuta el mapeo v2 y el decodificador de producción, sin crear otro puerto ALSA, importar tu música ni instalar mapeos. No demuestra integración física. `test:native` usa un servidor fixture; `test:native:live` exige el Mixxx real y abre Electron de producción. Usá el directorio vigente y seguí [PRUEBAS.md](docs/PRUEBAS.md), incluido el wrapper para headers locales. Capturas y logs quedan en `artifacts/`, fuera de Git.

```text
src/                    Interfaz React y estilos locales
electron/               Ventana, aislamiento, diálogos y puente IPC
backend/                SQLite, importador de MP3 y coordinación de comandos
core/                   Motor de preparación y recomendaciones locales
adapters/simulator.mjs  Simulador bajo el mismo contrato de adaptador
adapters/midi/          Decodificador SysEx, monitor y receptor ALSA
adapters/native/        Cliente autenticado, validación y comprobación sin carga
native/                 Servidor C++, enlace Mixxx y prueba de socket real
mixxx/                  Mapeo independiente XML + JavaScript de solo lectura
extensions/             Contratos y límites para IA/voz futuras
tests/                  Seguridad, biblioteca, persistencia y protocolo
scripts/                Desarrollo, diagnóstico y prueba Electron
docs/                   Arquitectura, evidencia técnica y pruebas manuales
```

[Arquitectura y riesgos](docs/ARQUITECTURA.md) · [Integración Mixxx](docs/MIXXX.md) · [Prototipo nativo](docs/NATIVO.md) · [Pruebas Ubuntu](docs/PRUEBAS.md) · [Resultados de validación](docs/VALIDACION.md)
