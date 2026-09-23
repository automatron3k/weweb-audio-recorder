export default {
  editor: {
    label: { en: "Audio recorder", es: "Grabador de audio" },
    icon: "music-note",
  },
  options: {
    displayAllowedValues: ["flex", "inline-flex"],
  },
  inherit: {
    type: "ww-layout",
  },
  triggerEvents: [
    {
      name: "saved",
      label: { en: "On saved", es: "Al guardar grabación" },
      event: { value: null },
      default: true,
    },
  ],
  properties: {
    maxDurationSeconds: {
      label: { en: "Max duration (s)", es: "Duración máx. (s)" },
      type: "Number",
      section: "settings",
      bindable: true,
      defaultValue: 240,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Duración máxima de la grabación en segundos (auto-stop al llegar al límite).",
      },
      propertyHelp: {
        tooltip: "Al llegar a este número de segundos la grabación se detiene sola.",
      },
      /* wwEditor:end */
    },
    savedAudioUrl: {
      label: { en: "Saved audio URL", es: "URL audio guardado" },
      type: "Text",
      section: "settings",
      bindable: true,
      defaultValue: "",
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip:
          "URL del audio ya guardado de esta pregunta. Si viene, el componente muestra el reproductor al revisar (reemplaza al <audio> nativo).",
      },
      propertyHelp: {
        tooltip:
          "Bindear a la URL del audio guardado. Vacío = arranca en modo grabación.",
      },
      /* wwEditor:end */
    },
  },
};
