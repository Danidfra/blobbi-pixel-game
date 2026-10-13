/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';

/**
 * M11D.4, CONTENT SECURITY POLICY for the production build (a <meta> in index.html). Scripts only from this origin
 * (no inline script, no eval), no plugins, no forms posted anywhere, network only to this origin and to Nostr relays
 * (wss:). It narrows what an injected script could do; it does not make a key in this page safe from a script that
 * does run here (see docs/milestones/M11D4.md, threat model). The dev server is not covered (Vite's live reload needs
 * more), so security checks of the CSP use the production build.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' wss:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const contentSecurityPolicy = (): Plugin => ({
  name: 'blobbi-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig({
  plugins: [contentSecurityPolicy()],
  server: { host: '127.0.0.1', port: 5177 },
  build: { target: 'es2022' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 60000,
  },
});
