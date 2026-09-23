import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { loadConfig } from './config.js';
import { createBackend } from './backend.js';
import { BeadService } from './service.js';
import { EventHub } from './events.js';
import { registerApi } from './routes/api.js';
import { registerAvatars } from './routes/avatars.js';
/** `server/src` under tsx and `server/dist` after a build are both two levels down. */
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
async function main() {
    const cfg = loadConfig(appDir);
    const app = Fastify({
        logger: { level: process.env.BEADVIZ_LOG ?? 'info', transport: undefined },
    });
    const backend = createBackend(cfg);
    const service = new BeadService(cfg, backend);
    const hub = new EventHub(400);
    // Drop the backend snapshot the instant the watcher reports a real change, so the
    // SSE-driven refetch that follows reads fresh data rather than the cached snapshot.
    hub.subscribe((e) => {
        if (e.type === 'beads-changed')
            backend.invalidate();
    });
    await registerApi(app, { service, hub, cfg });
    await registerAvatars(app, cfg.avatarsDir);
    // The built client, when there is one. In dev, Vite serves it and proxies here.
    const webDist = join(appDir, 'web', 'dist');
    if (existsSync(webDist)) {
        await app.register(fastifyStatic, { root: webDist, prefix: '/', index: 'index.html', decorateReply: false });
        app.setNotFoundHandler((req, reply) => {
            if (req.url.startsWith('/api/')) {
                reply.code(404).send({ error: { kind: 'not-found', message: `No route ${req.url}.`, hint: 'Check the endpoint table in the README.' } });
                return;
            }
            reply.type('text/html').sendFile('index.html');
        });
    }
    const beadsDir = join(cfg.repoRoot, '.beads');
    if (!cfg.fixture && existsSync(beadsDir)) {
        hub.watchDir(beadsDir, (e) => app.log.warn({ err: e }, 'watcher error'));
    }
    // 127.0.0.1, always. This process spawns a CLI; it has no business on a LAN.
    await app.listen({ port: cfg.port, host: '127.0.0.1' });
    app.log.info({ repoRoot: cfg.repoRoot, avatars: cfg.avatarsDir, source: backend.source, sessionLabelPattern: cfg.sessionLabelPattern }, `bead-visualizer sidecar on http://127.0.0.1:${cfg.port}`);
    const shutdown = async () => {
        await hub.close();
        await app.close();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
main().catch((e) => {
    console.error(`[bead-visualizer] ${e.message}`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map