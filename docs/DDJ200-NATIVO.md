# Prueba física del puente nativo con DDJ-200

Esta prueba requiere que vos operes Mixxx y la controladora. No se considera realizada por compilar el programa o aprobar el test de sockets. **Copilot solo observa: no carga canciones ni ajusta BPM/CUE.**

## Preparación

1. Usá una sesión de prueba, fuera de una actuación. Cerrá tu Mixxx habitual cuando sea seguro.
2. Abrí la variante y Copilot siguiendo [COMPILACION-NATIVA.md](COMPILACION-NATIVA.md). Seleccioná **Conexión → Mixxx nativo · prototipo** y comprobá que informa **Mixxx experimental 2.5.6** conectado.
3. Configurá audio y la DDJ-200 **en el perfil experimental nuevo**, usando el preset Pioneer habitual. No reemplaces ni edites los archivos de tu mapeo estable. El puente nativo no necesita el puerto virtual ni el preset MIDI del copiloto.
4. Importá en Copilot los MP3 reales de **El Original — Te Hago el Amor**, **Eh Guacho — Orgullosa** y **18 Kilates — Me Olvidé de Ti**. Elegí las versiones exactas de tus archivos y armá una playlist en ese orden. No usar filas DEMO.
5. Agregá la misma carpeta mediante la biblioteca de la variante Mixxx. No copies la base SQLite del Mixxx abierto ni modifiques sus MP3.

## Comprobar identidad y estado

| Acción tuya en Mixxx/DDJ-200                                         | Resultado esperado en Copilot                                                                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cargar manualmente El Original en Deck 1, después de abrir el puente | Título/artista, etiqueta de identidad confirmada y ruta exacta informada por Mixxx. Si las etiquetas del MP3 están vacías, no debe inventar metadatos. |
| Comparar la ruta de la ficha de Mixxx con la de Copilot              | Debe ser el mismo archivo. BPM/duración similares nunca prueban identidad.                                                                             |
| Comprobar BPM original/actual y duración                             | Coinciden con Mixxx, dentro del redondeo de pantalla. Si Mixxx no conoce BPM, se muestra desconocido.                                                  |
| Iniciar reproducción con PLAY en DDJ-200                             | El deck figura reproduciendo y la posición avanza. El inicio lo realizás vos.                                                                          |
| Usar PAUSE, CUE, SYNC, jogs y hot CUE                                | La controladora conserva su comportamiento. Copilot refleja lo que puede leer y no realiza acciones.                                                   |
| Cargar manualmente Orgullosa en Deck 2, detenido                     | El segundo deck muestra su propia identidad; no cambia la del Deck 1.                                                                                  |
| Reemplazar manualmente Orgullosa por 18 Kilates                      | Desaparece la identidad anterior durante la carga y aparece la nueva tras confirmación.                                                                |
| Recargar el mismo archivo o uno de igual BPM/duración                | Se reconoce el nuevo evento de carga; no se infiere identidad por números iguales.                                                                     |
| Expulsar manualmente la canción                                      | Se elimina título/artista/ruta del deck y vuelve a vacío/desconocido.                                                                                  |
| Solicitar dos cargas muy seguidas                                    | Puede quedar identidad desconocida por ambigüedad. Expulsá y cargá nuevamente sin solapamiento; no debe conservar una confirmación dudosa.             |

No tiene que decir «Preparado» por haber identificado o comprobado un archivo. Los decks nativos siguen bajo control manual. Si una ruta está confirmada pero no coincide con un archivo importado y su hash, puede mostrarse sin vínculo de biblioteca ni registro automático en el historial.

## Conexión y controladora

1. Dejá los dos decks disponibles durante al menos 10 minutos y observá que no aparezcan desconexiones, identidades cruzadas ni bloqueos de la interfaz. Registrá la duración real de tu prueba.
2. Mientras vos reproducís, mové faders, crossfader, EQ y jogs. Copilot no debe alterar sus posiciones ni provocar cortes. Esta comprobación de audio/hardware no se reemplaza por un test de Node.
3. Cerrá **solo Copilot** mientras Mixxx sigue abierto. La reproducción debe continuar bajo tu control. Reabrí Copilot con el directorio IPC vigente y elegí nativo: requiere conexión nueva, sin permisos antiguos.
4. En una sesión sin música reproduciéndose, cerrá Mixxx experimental. Copilot debe perder la conexión y limpiar identidades al vencer el estado. Volvé a abrir el experimental con el lanzador y usá su **nuevo** directorio IPC para reiniciar Copilot.
5. Automático, carga, tempo y CUE desde Copilot deben continuar bloqueados después de cada reconexión. El botón de comprobación solo verifica archivo/estado; no prepara una canción.
6. Cerrá la variante y abrí Mixxx habitual. Verificá que siguen tu biblioteca, preferencias y mapeo Pioneer; Copilot puede volver al monitor MIDI v2 ya validado.

## Registrar resultados

Anotá fecha, versión/binario experimental, nombre y ruta de cada MP3, duración de observación y resultado de cada paso. Si algo falla, anotá la última acción y el mensaje exacto. El log de la variante está dentro de su perfil separado; no compartas el archivo `token` del socket. Enviá únicamente los logs necesarios, revisando antes rutas o datos privados.

La aceptación física de etapa 3.1 requiere identidad correcta, cambios/expulsión reconocidos, recuperación de conexión y DDJ-200 sin interferencias. La carga automática por playlist corresponde a etapa 3.2 y no forma parte de esta prueba.
