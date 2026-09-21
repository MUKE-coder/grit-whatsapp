// Grit Framework Configuration
export default {
  name: "whatsapp",
  style: "default",
  api: {
    port: 8080,
    prefix: "/api",
  },
  web: {
    port: 3000,
  },
  admin: {
    port: 3001,
  },
  expo: {
    scheme: "whatsapp",
  },
  desktop: {
    framework: "wails",
    port: 5174,
  },
};
