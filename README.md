# DJ Copilot IA

Aplicación de escritorio para Ubuntu con Electron, React, Vite, Node.js y SQLite. Prepara una biblioteca y permite ensayar la selección del próximo tema mientras vos decidís cuándo mezclar.

**Estado del MVP:** preparación completa en un simulador sin audio; puente MIDI real de **solo lectura**, pendiente de validación física con Mixxx/DDJ-200. No se presenta el simulador como una conexión real. No se implementó carga automática de archivos en Mixxx: la API de controller scripting verificada no ofrece carga por ruta ni identidad textual del tema. La alternativa actual es exportar una playlist M3U y cargarla manualmente en Mixxx.

## Empezar en Ubuntu

Requisitos: Node.js **24 o posterior**, npm y una sesión gráfica. Mixxx **2.5+**, Python 3 y `libasound.so.2` solo hacen falta para el monitor MIDI. No se necesitan módulos npm nativos de SQLite o MIDI, compilador C++ ni paquetes pip.

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

| Función                                                  | Simulación               | Mixxx MIDI v1                        |
| -------------------------------------------------------- | ------------------------ | ------------------------------------ |
| Estado de reproducción de dos decks                      | Sí, sintético            | Implementado; requiere prueba física |
| BPM originales/actuales, posición, duración, CUE         | Datos de biblioteca/demo | Control Objects numéricos            |
| Título e identidad del tema cargado                      | Sí                       | No disponible; se dice en pantalla   |
| Carga por ruta en deck libre                             | Simulada y protegida     | No implementada                      |
| Preparación automática tras el cambio                    | Sí, sin audio            | Deshabilitada                        |
| Ajuste de tempo y CUE                                    | Simulado                 | Sin escrituras a Mixxx               |
| Play, mezcla, faders, EQ y efectos automáticos           | Nunca                    | Nunca                                |
| Biblioteca, playlists, CUE local, favoritos, exportación | Sí                       | Sí                                   |

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

La prueba de escritorio usa una carpeta temporal, un MP3 sintético de prueba y diálogos controlados. No importa tu música ni instala el mapeo. Las capturas se guardan en `artifacts/`.

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
