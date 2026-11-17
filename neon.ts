import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: false,
  functions: {
    // The shared price API. Its URL goes into the extension build as HUNU_API_URL.
    hunuprices: {
      name: "hunu prices",
      source: "server/src/index.ts",
      // Realtime's variables are not injected into Functions, and the NEON_ prefix is
      // reserved, so they are passed under HUNU_ names. Read from .env.local at deploy.
      env: {
        HUNU_REALTIME_URL: process.env.NEON_REALTIME_URL!,
        HUNU_REALTIME_SECRET: process.env.NEON_REALTIME_SECRET!,
        // Flight fares: only sent once the owner has a Travelpayouts account.
        ...(process.env.TRAVELPAYOUTS_TOKEN ? { TRAVELPAYOUTS_TOKEN: process.env.TRAVELPAYOUTS_TOKEN } : {}),
        ...(process.env.TRAVELPAYOUTS_MARKER ? { TRAVELPAYOUTS_MARKER: process.env.TRAVELPAYOUTS_MARKER } : {}),
      },
    },
  },
  triggers: {
    // Re-checks watched routes once a day (06:00 UTC, 06:00 in Ghana).
    "fare-watch": {
      type: "schedule",
      function: "hunuprices",
      cron: "0 6 * * *",
      functionPath: "/travel/check",
    },
  },
  preview: {
    // Live shared prices: the API seals the query, the extension subscribes to it.
    // Any origin: the extension's chrome-extension:// origin cannot be listed (only
    // http(s) origins are accepted). This is safe here because a client can only read
    // the query the API sealed for it, and shared prices are public through GET /reports.
    realtime: { allowedOrigins: ["*"] },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) return {};
    // New non-default branches auto-expire.
    if (!branch.exists) return { ttl: "7d" };
    return {};
  },
});
