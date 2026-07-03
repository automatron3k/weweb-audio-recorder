# audio-recorder (WeWeb Coded Component)

Graba audio desde el micrófono y, al confirmar, emite el evento `saved` con
`{ value: File }` (nombre `grabacion_<ts>.<ext>`, formato nativo del navegador —
`audio/webm;codecs=opus` en Chrome/Firefox/Android, `audio/mp4` en Safari/iOS).

- Prop: `maxDurationSeconds` (Number, default 240, bindable). Auto-stop al límite.
- Estados: `idle → recording → preview → (saved | idle)`, más `error`.
- No accede al micrófono en el editor de WeWeb (`isEditing`).
- Usa `wwLib.getFrontWindow()` para MediaRecorder/navigator/Blob/File/URL/timers.

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

## Verificación local

`test/harness.html` monta el componente con Vue por CDN y un shim de `wwLib`
para ejercitar la lógica en un navegador (usar Chromium con
`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`).
