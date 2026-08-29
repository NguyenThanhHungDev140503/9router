export default {
  id: "local-device",
  alias: "local-device",
  display: {
    name: "Local Device",
    authType: "official_api",
    icon: "speaker",
    color: "#64748B",
    textIcon: "LD"
  },
  category: "freeTier",
  serviceKinds: [
    "tts"
  ],
  mediaPriority: 5,
  noAuth: true,
  ttsConfig: {
    baseUrl: "local-device",
    authHeader: "none",
    format: "local-device",
    models: []
  }
};
