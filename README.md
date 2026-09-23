# audio-recorder (WeWeb Coded Component)

Graba audio desde el micrófono y, al confirmar, emite el evento `saved` con
`{ value: File }` (nombre `grabacion_<ts>.<ext>`, formato nativo del navegador —
`audio/webm;codecs=opus` en Chrome/Firefox/Android, `audio/mp4` en Safari/iOS).
Desde **v1.1.0** también es **reproductor**: muestra un player custom del audio (recién
grabado o el ya guardado) — reemplaza al `<audio>` nativo, que no puede mostrar la duración
de estos WebM (`duration=Infinity`, `seekable=0`).

- Prop `maxDurationSeconds` (Number, default 240, bindable). Auto-stop al límite.
- Prop `savedAudioUrl` (Text, bindable, v1.1.0): URL del audio ya guardado de esa pregunta.
  Si viene, al montar muestra el player con ese archivo (duración real vía `decodeAudioData`,
  que no depende del header/seekable rotos). Vacío = arranca en modo grabación.
- Estados: `idle → recording → preview → saved`, más `error`. En `preview` (recién grabado)
  botones "Volver a grabar" / "Guardar grabación"; en `saved` botón "Grabar de nuevo".
  Tras guardar **no vuelve a idle**: el player custom se queda mostrando la grabación (sin swap).
- Duración total: `recordedDuration` (cronómetro) para lo recién grabado; `decodeAudioData` para
  el archivo cargado por `savedAudioUrl`. Barra de progreso con `requestAnimationFrame` (60fps).
- No accede al micrófono en el editor de WeWeb (`isEditing`).
- Usa `wwLib.getFrontWindow()` para MediaRecorder/navigator/Blob/File/URL/AudioContext/timers.

⚠️ **En WeWeb hay que bindear `savedAudioUrl` a la URL del audio guardado y QUITAR el `<audio>`
nativo** (antes `cbb97906`) — el player del componente lo reemplaza en los dos casos (recién
grabado y revisión).

## Publicación

Fuente versionada aquí, **fuera** del export WeWeb (`plan-tutorias-2026/`), que se
re-genera en cada push. Se publica en el proyecto "Plan de tutorías 2" vía MCP
`weweb-focus`:

- Crear: `publishComponent({ files, message })` (sin `wwObjectBaseId`).
- Iterar: `loadComponentFiles({ wwObjectBaseId })` → editar → `publishComponent({ files, message, wwObjectBaseId })`.

`files` incluye `package.json`, `ww-config.js`, `AI.json`, `src/wwElement.vue`.

## Integración en Diagnósticos

Se instala como sibling del "File upload" dentro del contenedor `adjunto`
(`f391c700-…`) del componente `pregunta`, con la misma condición de visibilidad
(`context.component?.variables?.['67a33555-…-value']`). El evento `saved`
alimenta un workflow que sube el File a `diagnosticos/audio` y llama
`guardar_respuestas_diagnostico`. Ver
`docs/superpowers/plans/2026-07-03-grabador-audio-diagnosticos.md`.

**Captura vía `tipo='encabezado'` (2026-08-20).** El audio de lectura oral ya no
cuelga de las preguntas 82/98/109 sino de una fila `tipo='encabezado'` por set
(ver `supabase/CLAUDE.md` → regla del encabezado). El LC `pregunta` renderiza ese
tipo como instrucción + grabador + uploader, **sin alternativas y sin número**.
⚠️ Gotcha: la prop `formato_respuesta` **no llega** al encabezado en el LC, así que
las condiciones de visibilidad de audio (grabador `67a33555`, `adjunto` `f391c700`,
div del reproductor `cbb97906`) usan `|| !wwFormulas.toBool(nro_pregunta)` — el
encabezado es el **único** ítem con `numero` nulo. La fórmula del título corta con
`if (n_pregunta == null) return enunciado;` para no pintar el prefijo `"null. :"`.

## Verificación local

`test/harness.html` monta el componente con Vue por CDN y un shim de `wwLib`
para ejercitar la lógica en un navegador (usar Chromium con
`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`).
