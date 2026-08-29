export default {
  id: "google-tts",
  alias: "google-tts",
  display: {
    name: "Google TTS",
    authType: "official_api",
    icon: "record_voice_over",
    color: "#4285F4",
    textIcon: "GT"
  },
  category: "freeTier",
  serviceKinds: [
    "tts"
  ],
  mediaPriority: 5,
  noAuth: true,
  ttsConfig: {
    baseUrl: "google-tts",
    authHeader: "none",
    format: "google-tts",
    models: []
  }
};
