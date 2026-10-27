// Isolated UI comparison: actual HEAD sources, timeout-only sources, or current fix.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const version = process.argv[2] || 'fixed';
const revisions = { before: 'e7729590eaa58ddb41b9cf475e54bf740ce5aba4', 'after-timeout': '80df71f3c50e2fdd7a50abadbdd421eeac6d5517' };
const ports = { before: 45417, 'after-timeout': 45418, fixed: 45419 };
if (!(version in ports)) throw new Error('Use before, after-timeout or fixed');
const root = process.cwd();
const paths = ['src/application/chat-execution/chat-execution-client.ts', 'src/application/chat-send/chat-send-controller.ts',
  'src/application/chat-send/chat-send-types.ts', 'src/application/chat-send/chat-execution-sessions.ts',
  'src/components/chat-workspace/useChatSend.ts', 'src/components/chat-workspace/presentation/chat-execution-composer.ts', 'src/components/chat/ChatView.tsx'];
const snapshots = new Map();
if (version !== 'fixed') for (const path of paths) snapshots.set(resolve(root, path),
  execFileSync('git', ['show', `${revisions[version]}:${path}`], { cwd: root, encoding: 'utf8' }));
const server = await createServer({ root, configFile: false, envDir: false, cacheDir: `/private/tmp/penumbra-user-overlay-vite/${version}`,
  define: { __OVERLAY_VERSION__: JSON.stringify(version) },
  plugins: [{ name: 'historical-overlay-sources', enforce: 'pre', transform(_code, id) { return snapshots.get(id.split('?')[0]); } }, react(), tailwindcss()],
  resolve: { alias: { '@': resolve(root, 'src') } },
  server: { host: '127.0.0.1', port: ports[version], strictPort: true },
});
await server.listen();
console.log(`${version}: http://127.0.0.1:${ports[version]}/tests/browser/chat-user-overlay.html`);
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, async () => { await server.close(); process.exit(0); });
