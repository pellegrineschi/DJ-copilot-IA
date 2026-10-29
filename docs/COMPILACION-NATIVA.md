# Mixxx experimental en Ubuntu · etapa 3.1

Esta guía usa el checkout oficial `3ebac449e7e5fe2a0186596657696e87ce8b0e56` de Mixxx 2.5.6 y el puente de **observación**, con carga, tempo y CUE bloqueados. El target completo `mixxx` compiló y enlazó correctamente; el ejecutable se abrió y se conectó con Copilot real. La compilación no instala Mixxx sobre `/usr/bin/mixxx`. Las pruebas de audio, canciones y controladora siguen pendientes.

## Entorno y dependencias

Diagnóstico del 29 de octubre de 2026: Ubuntu 24.04.5 amd64, Git 2.43.0, Node 24.14.1, npm 11.11.0 y g++ 13.3.0. Mixxx estable `2.5.6-1~noble`, Qt6 runtime 6.4.2, bibliotecas ALSA/PortAudio/PortMidi y secuenciador ALSA disponibles fuera de la sandbox. Había sesión gráfica X11/Wayland y no había un proceso Mixxx abierto durante el diagnóstico. Faltaban CMake, Ninja, pkg-config y los headers de Qt/audio.

La receta exacta está en `scripts/native-deps-ubuntu.sh`. Agrupa:

- CMake, Ninja y pkg-config: configuración, compilación y localización de bibliotecas.
- Qt6 Base, Declarative/QML, Core5Compat, SVG, ShaderTools y QtKeychain: interfaz, scripting y servidor Unix local.
- PortAudio, JACK2, PortMidi, HIDAPI/USB/UDev: audio y controladores. JACK2 se elige expresamente para conservar la familia instalada.
- MP3/FFmpeg, libsndfile, Ogg/Vorbis/Opus/FLAC/WavPack, FFTW, SoundTouch y RubberBand: decodificación y procesamiento de Mixxx.
- Protobuf, SQLite, TagLib, OpenSSL, GSL, GLib/UPower y LV2: datos, metadatos y componentes del build completo.
- GTest/GMock y Benchmark: dependencias de las pruebas upstream.

`qt6-5compat-dev` es el nombre correcto de Core5Compat en Noble. La simulación APT propuso **148 paquetes nuevos, 4 actualizaciones de GLib y ninguna eliminación**. `sudo -n apt-get ...` no instaló nada: requirió contraseña local.

### Instalación de sistema opcional

Estos comandos requieren decisión del usuario y, para instalar, su contraseña en la terminal. No enviar contraseñas al chat. No fueron necesarios para la vía local usada aquí.

```bash
cd "/opt/lampp/htdocs/DJ copilot IA"
bash scripts/native-deps-ubuntu.sh --simulate
bash scripts/native-deps-ubuntu.sh --install
```

La receta usa `--no-remove`, no instala el paquete Mixxx y no ejecuta `autoremove`, actualizaciones generales o cambios de repositorios. Si APT no puede descargar los headers FFmpeg de Ubuntu Pro, resolver las credenciales de APT con el administrador o usar la vía local siguiente; no degradar las bibliotecas del sistema.

### Dependencias locales sin sudo

Se descargaron **152 paquetes** y se extrajeron sin ejecutar scripts de instalación ni cambiar la base de paquetes. La ubicación persistente utilizada es `/home/matias/src/dj-copilot-build-deps/root`. Las bibliotecas de runtime ya instaladas se referencian mediante enlaces dentro de ese directorio. Este entorno depende de este Ubuntu; no es un SDK portable ni debe copiarse como instalador a otra máquina.

Cuatro descargas ESM (`libavformat-dev`, `libavcodec-dev`, `libavutil-dev`, `libswresample-dev`) respondieron `401 Unauthorized` en la descarga sin privilegios. Se usaron los headers públicos Ubuntu `7:6.1.1-3ubuntu5` de la misma serie FFmpeg 6.1.1. **Las bibliotecas runtime del sistema `7:6.1.1-3ubuntu5+esm15` se conservaron**; no se instaló ni degradó FFmpeg.

Los helpers reproducen la descarga y extracción realizadas. Ejecutar en un destino nuevo; la extracción rechaza destinos existentes para no sobrescribir archivos ni seguir enlaces previos:

```bash
python3 scripts/native-download-deps.py "$HOME/src/dj-copilot-build-deps" --public-ffmpeg-headers
python3 scripts/native-extract-deps.py "$HOME/src/dj-copilot-build-deps/packages" "$HOME/src/dj-copilot-build-deps/root"
bash scripts/native-local-env.sh "$HOME/src/dj-copilot-build-deps/root" cmake --version
bash scripts/native-local-env.sh "$HOME/src/dj-copilot-build-deps/root" pkg-config --modversion Qt6Core Qt6Network libavcodec
```

**En esta máquina ya existen los paquetes y `root`: no repetir la extracción.** La descarga guarda plan y log; la extracción guarda nombres y SHA-256 de los paquetes. Se comprobó la extracción reproducible en un directorio temporal nuevo: CMake 3.28.3, Qt6 Core/Network 6.4.2 y libavcodec 60.31.102 disponibles.

Este entorno local depende de los runtimes de esta máquina y de su ruta absoluta: conservá la carpeta mientras uses el ejecutable. No es un SDK portátil. El manifiesto de los 152 paquetes usados, con versiones y SHA-256, está en `artifacts/native-3.1/dependencies-manifest.json`.

El wrapper modifica PATH, rutas de bibliotecas, pkg-config e includes **solo para el comando hijo**. Los includes multiarch son necesarios para `openssl/opensslconf.h`; no se modifica `/usr/include`, el shell del usuario ni la configuración global.

## Checkout y compilación

El checkout ya preparado está en `/home/matias/src/mixxx-copilot-2.5.6`. Se ejecutó:

```bash
git clone --branch 2.5.6 --depth 1 https://github.com/mixxxdj/mixxx.git "$HOME/src/mixxx-copilot-2.5.6"
git -C "$HOME/src/mixxx-copilot-2.5.6" rev-parse HEAD
node scripts/native-prepare.mjs "$HOME/src/mixxx-copilot-2.5.6"
git -C "$HOME/src/mixxx-copilot-2.5.6" diff --check
git -C "$HOME/src/mixxx-copilot-2.5.6" diff -- CMakeLists.txt src/mixer/playermanager.cpp
```

No repetir clone o el parche sobre el checkout existente. El parche verifica commit y limpieza; agrega cuatro archivos de puente, dos entradas CMake, un include y una llamada de arranque. No cambia el motor de audio. Los archivos bajo `src/copilot/` son nuevos y deben revisarse además del diff de archivos ya versionados.

Configuración y build utilizados desde el proyecto Copilot:

```bash
bash scripts/native-local-env.sh "$HOME/src/dj-copilot-build-deps/root" \
  cmake --fresh -S "$HOME/src/mixxx-copilot-2.5.6" \
  -B "$HOME/src/mixxx-copilot-2.5.6/build-copilot" -G Ninja \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo -DQT6=ON \
  -DCMAKE_INSTALL_PREFIX="$HOME/src/mixxx-copilot-2.5.6/install-copilot"
bash scripts/native-local-env.sh "$HOME/src/dj-copilot-build-deps/root" \
  cmake --build "$HOME/src/mixxx-copilot-2.5.6/build-copilot" --target mixxx --parallel 4
```

El target `mixxx` incluye aplicación gráfica, motor, controladores, bibliotecas, observador y servidor IPC. No es el ejecutable fixture. QML y PortMidi quedan habilitados. No se cambian flags de seguridad para forzar éxito. CMake descarga libdjinterop 0.24.3 y libkeyfinder 2.2.8 con los SHA-256 fijados por upstream; sus instalaciones quedan dentro del build, no en `/usr`.

El primer intento falló por `openssl/opensslconf.h` al no estar en la búsqueda multiarch del compilador. Se corrigió el wrapper y se reconfiguró con `cmake --fresh` usando los mismos argumentos anteriores. Esto regeneró las comprobaciones y archivos derivados de CMake; no se parchearon fuentes de audio. Logs de los intentos en `artifacts/native-3.1/`.

No ejecutar `cmake --install`, `sudo make install` ni copiar el binario sobre el estable. Consultar el [registro de validación](VALIDACION.md) para el resultado final de build y ejecución de esta entrega.

## Ejecutar y conectar

El build ya terminó en esta máquina. Cerrá Mixxx habitual manualmente cuando sea seguro. El lanzador rechaza iniciar si detecta otro Mixxx; nunca lo mata.

```bash
cd "/opt/lampp/htdocs/DJ copilot IA"
bash scripts/native-local-env.sh "$HOME/src/dj-copilot-build-deps/root" \
  node scripts/native-launch.mjs "$HOME/src/mixxx-copilot-2.5.6/build-copilot/mixxx" \
  "/ruta/a/la/carpeta/de/tus/MP3" "$HOME/src/mixxx-copilot-2.5.6/res"
```

Reemplazá únicamente la carpeta musical: tiene que existir. El perfil experimental es `~/.local/share/dj-copilot/mixxx-2.5.6-prototype`, con recursos del checkout y socket en un directorio privado nuevo `/tmp/dj-native-*`. No se copia el perfil ni la base estable. Completá los diálogos iniciales en ese perfil.

En otra terminal, ejecutá el comando impreso por el lanzador, que contiene **el directorio real de esa sesión**. Compilá la interfaz antes si cambió:

```bash
npm run build
DJ_COPILOT_NATIVE_DIR=/tmp/dj-native-XXXXXX npm start
```

Elegí **Conexión → Mixxx nativo · prototipo**. El estado debe indicar **Mixxx experimental 2.5.6**, con ambos decks recientes. No se reconoce un servidor `fixture-only` como Mixxx. Cargar, tempo, CUE y automático permanecen bloqueados.

### Ejecución realizada en esta entrega

Se ejecutó este comando exacto con una carpeta vacía, sin aportar ni cargar MP3:

```bash
mkdir -p artifacts/native-3.1/music
bash scripts/native-local-env.sh /home/matias/src/dj-copilot-build-deps/root \
  node scripts/native-launch.mjs /home/matias/src/mixxx-copilot-2.5.6/build-copilot/mixxx \
  '/opt/lampp/htdocs/DJ copilot IA/artifacts/native-3.1/music' \
  /home/matias/src/mixxx-copilot-2.5.6/res
npm run test:native:live -- /tmp/dj-native-0gKzVE 30
```

El test se ejecutó en otra terminal mientras Mixxx seguía abierto. `/tmp/dj-native-0gKzVE` identifica únicamente esa sesión del 29/10/2026: **después de cerrar o reiniciar Mixxx hay que usar el nuevo directorio**. La carpeta vacía delimita la comprobación de archivos de esa sesión; para comprobar tus MP3, relanzá con su carpeta siguiendo el comando anterior. No se cargan archivos al indicar esa raíz.

La conexión real pasó con dos decks vacíos. El arranque emitió avisos ALSA/JACK, controles aún inexistentes durante la construcción inicial de PlayerManager y una ubicación de red inaccesible consultada por GTK. No se habilitó JACK ni se cambió audio, montajes o mapeos para ocultar esos avisos. Si sigue abierto un diálogo inicial, completalo en el perfil experimental; el test IPC no certifica que el audio esté configurado ni sustituye la inspección de la cabina.

### Prueba técnica de conexión real

Con Mixxx experimental abierto y sin otro Copilot conectado al socket:

```bash
npm run test:native:live -- /tmp/dj-native-XXXXXX 30
```

Usá el directorio impreso, no el texto de ejemplo. Esta prueba exige el proveedor real, observa estados, comprueba rechazo de escrituras, corta únicamente su propio socket y reconecta con otra sesión. Después abre Electron de producción con biblioteca temporal, selecciona el modo nativo y verifica los bloqueos y reconexión. No abre ni cierra Mixxx, no carga archivos y no toca PLAY/PAUSE. Al finalizar cierra solo su Electron de prueba y guarda `live-report.json` y `mixxx-real-electron.png` en `artifacts/native-3.1/`.

Si no hubo cargas manuales durante la observación, el resultado prueba transporte y decks vacíos, **no título/artista/ruta ni reproducción**. La validación de canciones/DDJ-200 se hace siguiendo [la guía física](DDJ200-NATIVO.md). Los reportes pueden contener rutas y títulos; quedan locales, excluidos de Git.

## Regresar al Mixxx estable

Cerrá manualmente el experimental cuando sea seguro. Abrí Mixxx desde su icono habitual o `/usr/bin/mixxx`, sin el wrapper, variables nativas ni `--settings-path`. El wrapper no exporta sus cambios a tu terminal. Su binario, perfil, música y mapeos originales siguen separados.

Abrí Copilot normalmente y elegí MIDI v2. Si cambió el puerto virtual, reactivá su preset según [MIXXX.md](MIXXX.md). No es necesario desinstalar paquetes del sistema, porque la vía local no instaló ninguno. Conservá el checkout/perfil experimental para diagnóstico; no se eliminan automáticamente.
