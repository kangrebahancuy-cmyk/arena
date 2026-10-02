import { defineConfig, loadEnv } from 'vite';
import pkg from './package.json' with { type: 'json' };

// The browser only ever talks to its OWN origin ("/api/...").
// In dev (and `vite preview`) Vite forwards those requests to the game server, so:
//   - browser code never needs to know the server address (nothing to leak, nothing to mis-configure),
//   - no CORS is required, and cookies (Phase 11) stay first-party,
//   - it works unchanged from a phone on the same Wi-Fi.
// Phase 10 adds a "/ws" entry here (with `ws: true`) for the realtime socket.
//
// 127.0.0.1 instead of "localhost" on purpose: on Windows, "localhost" may resolve to IPv6 (::1)
// while the server listens on IPv4, which makes the proxy fail with ECONNREFUSED.
export default defineConfig(({ mode }) => {
  // Read from apps/client/.env or the real environment. These values stay in this Node-side config
  // file: only VITE_-prefixed variables are ever exposed to browser code.
  const env = loadEnv(mode, '.', '');
  const apiTarget = env.DEV_API_PROXY_TARGET ?? 'http://127.0.0.1:3001';
  const proxy = { '/api': { target: apiTarget } };

  return {
    define: {
      // Public build metadata only (shown on the boot screen).
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: {
      // Listen on all interfaces so a phone on the same network can open the dev server.
      host: true,
      port: 5173,
      proxy,
    },
    preview: {
      host: true,
      port: 4173,
      proxy,
    },
  };
});
