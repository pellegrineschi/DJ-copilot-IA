# Guía de pruebas en Ubuntu

## Pruebas automatizadas

```bash
npm test
npm run build
npm run test:desktop
```

Las pruebas de Node cubren el escenario de tres temas, ambos decks activos, deck sin referencia, reserva/manualidad, no sobrescribir un preparado, carreras durante carga, cancelación, doble clic, CUE ausente/inválido, límite de BPM, telemetría vencida, recuperación, historial, estimación, importación de MP3 sintético, archivos corruptos, duplicados, no seguir enlaces, conservación de bytes, persistencia SQLite, M3U y protocolo SysEx.

La prueba de protocolo ejecuta **el archivo real de script de Mixxx** dentro de un contexto VM con controles simulados; sus bytes pasan por el decodificador de producción. No se limita a probar dos copias de un codificador inventado. Un `engine.setValue` lanzaría un error en ese contexto.

La prueba Electron abre una biblioteca temporal, ensaya los tres temas, verifica que cada preparación termina pausada, importa un MP3 de prueba a través del IPC, guarda un CUE y comprueba que el monitor real no permite automático. No usa los MP3 del usuario. Capturas en `artifacts/`.

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

## Prueba física del monitor MIDI (pendiente)

Hacerla fuera de una presentación en vivo. La app no controla reproducción, pero la configuración/reconexión de controladores de Mixxx puede requerir reiniciar el programa.

1. Ejecutar `npm run doctor` y `aconnect -l`. Confirmar que hay secuenciador ALSA.
2. Guardar/instalar el mapeo separado según [MIXXX.md](MIXXX.md). Confirmar que el mapeo original DDJ-200 no cambió.
3. Activar el monitor en el copiloto y después el preset del puerto virtual en Mixxx.
4. Verificar que la etiqueta muestra **MIDI · SOLO LECTURA** solo al llegar datos de ambos decks.
5. Play/pause manual en cada deck y DDJ-200: comparar estado. Comprobar BPM original/actual, duración, CUE y avance aproximado. Los títulos deben decir que no están disponibles por MIDI.
6. Mover tempo o CUE desde Mixxx y observar actualizaciones, sin movimientos autónomos de ningún control.
7. Detener/deshabilitar el controlador virtual en Mixxx: dentro de dos segundos debe figurar «Sin señal»; nunca seguir indicando conexión reciente.
8. Desconectar el puente, reiniciarlo y verificar que vuelve a recibir paquetes. Si el puerto cambia, reactivar el controlador virtual en Mixxx.
9. Probar la DDJ-200 durante la recepción: reproducción, jogs, faders y EQ deben mantener su comportamiento habitual. Registrar la versión de Mixxx, sistema, nombre del puerto y resultado.

Hasta completar esto no se considera validada la comunicación física, aunque las pruebas unitarias del contrato estén aprobadas. El flujo de carga automática en Mixxx seguirá deshabilitado porque no está implementado.

## Diagnóstico

- **No aparece `/dev/snd/seq`:** la sesión/contenedor no tiene ALSA sequencer. Ejecutar la app en el escritorio Ubuntu que ve el hardware. Un administrador puede revisar módulo y permisos; la app no los modifica.
- **Puerto listo pero sin conexión:** habilitar el preset en el puerto virtual y su salida; comprobar `aconnect -l`, el log de Mixxx y ambos decks. Tener un puerto no prueba que el script se haya cargado.
- **Archivo corrupto:** se informa por nombre en el resultado de importación; revisar ese MP3 sin cambiar automáticamente sus bytes.
- **Archivo movido:** la ruta guardada puede quedar obsoleta. El MVP no busca ni reemplaza archivos por similitud. Importar una copia idéntica se detecta como duplicado, por lo que la relocalización de rutas requiere una mejora posterior.
- **Electron y sandbox de Ubuntu:** ejecutar como usuario normal. Si Chromium informa que no puede iniciar su sandbox, revisar la configuración de user namespaces/AppArmor o instalar/configurar el helper oficial de sandbox con un administrador. No se desactiva el sandbox como comportamiento normal de la app.
- **Recuperación:** errores de preparación no dejan el motor ocupado. Restaurar conexión y volver a preparar explícitamente. Cambiar playlist/configuración apaga automático; activarlo de nuevo solo después de revisar el estado.
