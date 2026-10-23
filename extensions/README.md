# Puntos de extensión

La primera versión no llama servicios de IA ni solicita credenciales. El motor de recomendaciones local está en `core/recommendations.mjs` y funciona sin red.

Una futura implementación podrá sustituir la función pura `recommend(track, active, preferences)` por un proveedor asíncrono. El proveedor solo debe producir sugerencias: `PreparationEngine` seguirá validando cada acción y el adaptador seguirá verificando las revisiones de ambos decks. Nunca delegar las protecciones al modelo.

Antes de habilitar un proveedor pago: activación explícita, credenciales con Electron safeStorage y almacén seguro del sistema, límite local de solicitudes y gasto, cancelación, caché y retorno al proveedor local. No enviar MP3 ni rutas privadas; incluso los metadatos requieren una opción clara de consentimiento. No se presenta un interruptor de IA ficticio en este MVP.

Voz futura: consumir los eventos `success` del motor con un proveedor local de TTS. Exigir selección y prueba del dispositivo de salida antes de activarlo. No tomar el dispositivo principal de Mixxx por defecto. Por ahora la aplicación no genera audio.
