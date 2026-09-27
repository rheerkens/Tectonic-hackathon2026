import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wraps the built web bundle (`apps/web/dist`). The bundle must be
 * built with VITE_API_ORIGIN pointing at the hosted backend, because a native
 * shell has no same-origin API to proxy to. Set CAP_SERVER_URL to a dev-stack
 * URL for live reload on a device on the same network.
 */
const config: CapacitorConfig = {
  appId: 'com.tectonic.board',
  appName: 'Tectonic Board',
  webDir: 'dist',
  ...(process.env.CAP_SERVER_URL ? { server: { url: process.env.CAP_SERVER_URL, cleartext: true } } : {}),
  ios: { contentInset: 'automatic' },
  android: { allowMixedContent: false },
};

export default config;
