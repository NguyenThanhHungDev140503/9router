export default {
  id: "edge-tts",
  alias: "edge-tts",
  display: {
    name: "Edge TTS",
    authType: "official_api",
    icon: "record_voice_over",
    color: "#0078D4",
    textIcon: "ET"
  },
  category: "freeTier",
  serviceKinds: [
    "tts"
  ],
  mediaPriority: 5,
  noAuth: true,
  ttsConfig: {
    baseUrl: "edge-tts",
    authHeader: "none",
    format: "edge-tts",
    models: []
  }
};
