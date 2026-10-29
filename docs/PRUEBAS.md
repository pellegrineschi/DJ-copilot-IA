# Guía de pruebas en Ubuntu

## Pruebas automatizadas

```bash
npm test
npm run build
npm run test:desktop
# Con las dependencias locales ya preparadas en esta máquina:
bash scripts/native-local-env.sh "$HOME/src/dj-copilot-build-deps/root" npm run test:native
```

Las pruebas de Node cubren el escenario de tres temas, ambos decks activos, deck sin referencia, reserva/manualidad, no sobrescribir un preparado, carreras durante carga, cancelación, doble clic, CUE ausente/inválido, límite de BPM, telemetría vencida, recuperación, historial, estimación, importación de MP3 sintético, archivos corruptos, duplicados, no seguir enlaces, conservación de bytes, persistencia SQLite, M3U y protocolo SysEx.

Etapa 2 agrega: procedencia manual/desconocida, reemplazos 1→1 con BPM/duración idénticos, independencia de ambos decks, seek/tempo/pausa sin perder asociación, expulsión, mensajes perdidos/duplicados/fuera de orden/antiguos/futuros/incompletos, reinicio de mapeo, pérdida de escucha de cargas, conexión parcial, recuperación, hash cambiado, archivo ausente, token invalidado durante lectura, cambio de modo, historial explícito y migración v1 sin pérdida de filas. Ninguna asociación habilita preparar un deck real.

La prueba de protocolo ejecuta **el archivo real de script de Mixxx** dentro de un contexto VM con controles simulados; sus bytes pasan por el decodificador de producción. No se limita a probar dos copias de un codificador inventado. Un `engine.setValue` lanzaría un error en ese contexto.

La prueba Electron abre una biblioteca temporal, ensaya los tres temas, verifica que cada preparación termina pausada, importa un MP3 sintético a través del IPC y guarda un CUE. También abre la asociación, exige la comprobación explícita, registra historial manual, invalida una ventana al reemplazar la carga y comprueba caducidad/recuperación. `scripts/desktop-entry.mjs` reemplaza solo el arranque ALSA por controles simulados durante esta prueba; usa la ventana, preload, IPC y backend de producción. No agrega controles de prueba al renderer ni abre un segundo puerto ALSA. Capturas en `artifacts/`.

## Prueba manual de simulación

1. Inicio: banner «Estás en el simulador», automático desactivado, decks vacíos. Ningún sonido.
2. Demo: iniciar los tres temas; comprobar aviso de BPM/CUE/duración ficticios.
3. Preparar Orgullosa: Deck 1 debe permanecer reproduciendo; Deck 2 queda preparado y pausado. No hay transición automática.
4. Activar automático y simular cambio: Deck 2 pasa a reproducir y Deck 1 recibe 18 Kilates pausado.
5. Simular el siguiente cambio: no debe repetir El Original ni Orgullosa. El registro informa que no quedan temas.
6. Reservar un deck: una preparación debe bloquearse. Cargar manualmente una canción, quitar su reserva y comprobar que tampoco se sobrescribe. Vaciarlo explícitamente permite usarlo.
7. Con ambos decks reproduciendo, no se prepara. Pausar ambos tampoco permite preparar.
8. Eliminar el CUE de un tema y activar modo seguro: exige un CUE. Desactivar modo seguro permite inicio de archivo y sigue informando que no hay CUE verificado.
9. Ajustar BPM del siguiente tema lejos del actual: debe conservar BPM originales e informar que supera el margen.
10. Cerrar y reabrir: biblioteca, playlist y CUE permanecen; automático apagado y decks vacíos.

## Prueba con los tres MP3 del usuario

Los archivos deben ser aportados por el usuario; no se descargaron ni se asumió que existían.

1. Importar las grabaciones de El Original, Eh Guacho y 18 Kilates en **Biblioteca**.
2. Crear una playlist nueva con los **archivos reales**, en ese orden. No usar filas con etiqueta DEMO.
3. En Mixxx, escuchar cada archivo y verificar BPM, duración y CUE. Guardar esos valores en el copiloto.
4. En simulación, cargar El Original en Deck 1 y pulsar Play demo. Vaciar/liberar Deck 2.
5. Preparar Orgullosa, ensayar el cambio y comprobar que 18 Kilates queda pausado. El primer tema cargado manualmente queda protegido: para reutilizar Deck 1 se debe vaciar/liberar explícitamente, incluso después de detenerlo. En la demo integrada el primer tema tiene propiedad del copiloto para ejercitar el ciclo continuo.
6. Exportar M3U8 y abrirla en Mixxx. Confirmar que las tres rutas corresponden a los archivos correctos.

## Regresión física v2 con los tres MP3

El usuario confirmó al iniciar etapa 3 telemetría v2, asociación, invalidación, desconexión/reconexión y coexistencia con la DDJ-200. Esta guía queda disponible para repetir la regresión fuera de una presentación en vivo; cambiar/reconectar controladores puede requerir reiniciar Mixxx. No se necesita reproducir ni detener nada automáticamente desde Copilot.

1. Ejecutar `npm run doctor` y `aconnect -l`. Confirmar que hay secuenciador ALSA.
2. Guardar/instalar el mapeo **v2** separado según [MIXXX.md](MIXXX.md). Confirmar que v1 y el mapeo original DDJ-200 no cambiaron. Elegir v2 solo en el puerto virtual.
3. Activar el monitor en el copiloto y después el preset del puerto virtual en Mixxx.
4. Verificar que la etiqueta muestra **MIDI · SOLO LECTURA** solo al llegar datos de ambos decks.
5. Importar los MP3 reales: **El Original — Te Hago el Amor — Extended Mix**, **Eh Guacho — Orgullosa 2k26** y **18 Kilates — Me Olvidé de Ti**. No usar filas DEMO. Verificar la versión del archivo, no solo su título.
6. Cargar El Original manualmente en Deck 1 de Mixxx. Comparar BPM original/actual, duración, CUE y posición. Copilot debe mostrar **Identidad desconocida** hasta seleccionar **Asociar canción**. Elegir el archivo, comparar su ruta con el archivo cargado en Mixxx y marcar la comprobación. Esperado: título/artista de biblioteca, etiqueta **Identidad seleccionada manualmente**, ruta asociada de biblioteca. No debe decir confirmada automáticamente.
7. Repetir con Orgullosa en Deck 2. Asociar un deck no debe cambiar el otro. Mientras suena uno, registrar explícitamente la reproducción manual: debe aparecer una sola fila en Actividad y no repetirla en cada latido. Solo asociar o pulsar play en Mixxx no debe crear un registro real automáticamente.
8. Desde Mixxx, reemplazar manualmente la canción de un deck detenido por 18 Kilates. La identidad anterior debe desaparecer, también si se vuelve a cargar **el mismo archivo** o se usa otro con BPM/duración iguales. Expulsar la canción también debe limpiar la asociación. Si no se limpia, volver a v1 y reportar versión/log; no confiar en v2 hasta resolverlo.
9. Abrir la ventana de asociación y, antes de guardarla, cambiar la canción desde Mixxx. Guardar debe quedar bloqueado; abrir una nueva ventana permite comprobar y asociar la nueva carga. Cambiar tempo, posición, CUE o play/pause de la misma carga debe conservar la asociación.
10. Deshabilitar el controlador virtual en Mixxx: al vencer los 2 s y procesarse el siguiente chequeo (intervalo de 500 ms), debe figurar **Sin señal**, borrarse la identidad vencida y bloquearse la asociación. No debe tocar reproducción ni mezcla.
11. Reiniciar/reconectar el puente. Si el puerto cambia, reactivar el controlador virtual en Mixxx. La señal debe recuperarse y la identidad seguir desconocida hasta otra asociación. Comprobar que la preparación automática permanece deshabilitada incluso después de asociar.
12. Probar DDJ-200 durante la recepción: reproducción, jogs, faders y EQ deben mantener su comportamiento habitual. Registrar versión, puerto, los tres archivos usados y resultado por paso.

La confirmación física de etapa 2 procede del usuario; no se volvió a operar su controladora durante etapa 3. El ciclo automático real todavía no corresponde: el puente nuevo no implementa una carga transaccional segura. El ciclo automático existente sigue siendo una prueba de simulación.

## Prototipo nativo de etapa 3.1

`tests/native.test.mjs` comprueba contrato, procedencia, vínculo de biblioteca, caducidad/timeout, cancelación, ACK tardíos, historial compartido MIDI/nativo y rechazo de preparación real. Usa mensajes artificiales, no Mixxx.

`npm run test:native` compila `native/bridge_server.cpp` y conecta el cliente Node mediante sockets Unix reales. Comprueba permisos/token, autorización, ocupación/revisiones, rutas, duplicados, desconexión y rechazo de todas las escrituras. El ejecutable fixture está identificado y la aplicación de producción lo rechaza. Sus archivos `.mp3` solo ejercitan rutas; no se decodifican ni producen audio.

Electron también verifica el tercer modo con el puente ausente: identidad desconocida, conexión caída y botones de carga/autorización bloqueados. Captura `artifacts/nativo-prototipo.png`. Se fuerza una dirección inexistente de prueba; no intenta conectar al puente del usuario.

La variante completa **sí se compiló y ejecutó** en etapa 3.1. La prueba adicional usa el ejecutable real, sin servidor fixture, y Electron de producción:

```bash
npm run test:native:live -- /tmp/dj-native-XXXXXX 30
```

Reemplazar el directorio por el de la sesión actual del lanzador; Mixxx debe estar abierto y sin otro Copilot conectado. El script verifica proveedor/autenticación, dos decks disponibles, continuidad, bloqueo de comandos de escritura, pérdida del socket y sesión nueva. Luego selecciona el modo nativo en Electron, comprueba los bloqueos en UI/backend y reinicia el puente. No carga archivos, no escribe controles ni cierra Mixxx; cierra solo su Electron temporal.

Resultado del 29/10/2026: **aprobado**, 120 mensajes en 30 segundos con ambos decks vacíos, sin reproducir música. Reporte local `artifacts/native-3.1/live-report.json` y captura `mixxx-real-electron.png`. Identidad de archivos cargados, cambios/expulsión, BPM/duración y audio/DDJ-200 permanecen **pendientes de prueba física**. El éxito de transporte no los da por superados.

Para ejecutar o recompilar, seguir [COMPILACION-NATIVA.md](COMPILACION-NATIVA.md). Para probar los tres MP3 manualmente y regresar al estable, seguir [DDJ200-NATIVO.md](DDJ200-NATIVO.md). Los resultados y problemas reales están en [VALIDACION.md](VALIDACION.md). La automatización real se mantiene fuera de esta etapa.

## Diagnóstico

- **No aparece `/dev/snd/seq`:** la sesión/contenedor no tiene ALSA sequencer. Ejecutar la app en el escritorio Ubuntu que ve el hardware. Un administrador puede revisar módulo y permisos; la app no los modifica.
- **Puerto listo pero sin conexión:** habilitar el preset en el puerto virtual y su salida; comprobar `aconnect -l`, el log de Mixxx y ambos decks. Tener un puerto no prueba que el script se haya cargado.
- **Hay telemetría pero Asociar está deshabilitado:** revisar Conexión. Con v1 es lo esperado. Con v2 se necesitan datos de ambos decks, un tema cargado, escucha de eventos operativa y dos muestras durante al menos 500 ms desde la última carga. No iniciar varios presets/productores en el mismo puerto.
- **El archivo cambió desde importar:** la asociación lo rechaza al comprobar SHA-256. No reescribe ni actualiza automáticamente la música; verificar el archivo y, si es una versión nueva, importarlo desde una ubicación nueva.
- **Archivo corrupto:** se informa por nombre en el resultado de importación; revisar ese MP3 sin cambiar automáticamente sus bytes.
- **Archivo movido:** la ruta guardada puede quedar obsoleta. El MVP no busca ni reemplaza archivos por similitud. Importar una copia idéntica se detecta como duplicado, por lo que la relocalización de rutas requiere una mejora posterior.
- **Electron y sandbox de Ubuntu:** ejecutar como usuario normal. Si Chromium informa que no puede iniciar su sandbox, revisar la configuración de user namespaces/AppArmor o instalar/configurar el helper oficial de sandbox con un administrador. No se desactiva el sandbox como comportamiento normal de la app.
- **Recuperación:** errores de preparación no dejan el motor ocupado. Restaurar conexión y volver a preparar explícitamente. Cambiar playlist/configuración apaga automático; activarlo de nuevo solo después de revisar el estado.
