# DJ Copilot IA

Aplicación de escritorio para Ubuntu con Electron, React, Vite, Node.js y SQLite. Prepara una biblioteca y permite ensayar la selección del próximo tema mientras vos decidís cuándo mezclar.

**Etapa 2:** asociación manual entre cada deck real y un MP3 importado, con título, artista y ruta de biblioteca claramente marcados como selección del usuario. El mapeo v2 detecta nuevas cargas y descarta asociaciones anteriores. No identifica canciones por BPM/duración ni presenta una selección manual como confirmación automática.

El usuario ya confirmó la telemetría v1 con Mixxx y la coexistencia de la DDJ-200. Esa integración se conserva sin cambios. El nuevo mapeo v2 está probado automáticamente; falta probarlo físicamente con los tres MP3 reales. En **Mixxx 2.5.6**, la API de mapeos inspeccionada no expone título/ruta ni carga por ruta con confirmación. **La preparación automática real continúa deshabilitada.** La preparación completa sigue disponible en el simulador sin audio. Ver [evidencia y límites](docs/MIXXX.md).

## Empezar en Ubuntu

Requisitos: Node.js **24 o posterior**, npm y una sesión gráfica. Mixxx **2.5.6** es la versión investigada; Python 3 y `libasound.so.2` solo hacen falta para el monitor MIDI. No se necesitan módulos npm nativos de SQLite o MIDI, compilador C++ ni paquetes pip.

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

| Función                                                    | Simulación           | Mixxx MIDI v1 / v2                                |
| ---------------------------------------------------------- | -------------------- | ------------------------------------------------- |
| Reproducción, BPM original/actual, posición, duración, CUE | Biblioteca/demo      | Telemetría numérica; v1 validado por el usuario   |
| Título y artista del deck                                  | Sí                   | v1 desconocido; v2 selección manual de biblioteca |
| Ruta e identidad confirmadas por Mixxx                     | No aplica            | No disponibles; la ruta asociada es de biblioteca |
| Descartar identidad en cada nueva carga                    | Sí                   | v2: eventos y generación por deck                 |
| Carga por ruta y preparación automática                    | Simulada y protegida | Deshabilitadas                                    |
| Ajuste de tempo y CUE                                      | Simulado             | Sin escrituras                                    |
| Play, mezcla, faders, EQ y efectos automáticos             | Nunca                | Nunca                                             |
| Biblioteca, playlists, CUE local, favoritos, M3U           | Sí                   | Sí                                                |

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
```

La prueba de escritorio usa una carpeta temporal, un MP3 sintético, controles de Mixxx simulados y diálogos controlados. Ejecuta el mapeo v2 y el decodificador de producción, sin crear otro puerto ALSA, importar tu música ni instalar mapeos. No demuestra integración física. Las capturas se guardan en `artifacts/`.

```text
src/                    Interfaz React y estilos locales
electron/               Ventana, aislamiento, diálogos y puente IPC
backend/                SQLite, importador de MP3 y coordinación de comandos
core/                   Motor de preparación y recomendaciones locales
adapters/simulator.mjs  Simulador bajo el mismo contrato de adaptador
adapters/midi/          Decodificador SysEx, monitor y receptor ALSA
mixxx/                  Mapeo independiente XML + JavaScript de solo lectura
extensions/             Contratos y límites para IA/voz futuras
tests/                  Seguridad, biblioteca, persistencia y protocolo
scripts/                Desarrollo, diagnóstico y prueba Electron
docs/                   Arquitectura, evidencia técnica y pruebas manuales
```

[Arquitectura y riesgos](docs/ARQUITECTURA.md) · [Integración Mixxx](docs/MIXXX.md) · [Pruebas Ubuntu](docs/PRUEBAS.md) · [Resultados de validación](docs/VALIDACION.md)
