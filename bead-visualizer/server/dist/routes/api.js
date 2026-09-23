import { AppError, toAppError } from '../errors.js';
import { assertIdentifier } from '../validate.js';
import { readPrefs, writePrefs } from '../config.js';
export async function registerApi(app, { service, hub, cfg }) {
    const send = async (reply, work) => {
        try {
            reply.send(await work());
        }
        catch (e) {
            const err = toAppError(e);
            app.log.error({ kind: err.kind, detail: err.detail }, err.message);
            reply.code(err.httpStatus).send(err.toPayload());
        }
    };
    app.get('/api/health', async (_req, reply) => send(reply, () => service.health()));
    // The manual "rescan" button: force the cached snapshot to be dropped so the
    // refetch that follows re-spawns bd, rather than being served the snapshot.
    app.post('/api/refresh', async (_req, reply) => send(reply, async () => {
        service.invalidate();
        return { ok: true };
    }));
    app.get('/api/sessions', async (_req, reply) => send(reply, () => service.sessions()));
    app.get('/api/sessions/:id/graph', async (req, reply) => send(reply, () => service.graph(assertIdentifier(req.params.id, 'session id'))));
    app.get('/api/beads/:beadId', async (req, reply) => send(reply, () => service.bead(assertIdentifier(req.params.beadId, 'bead id'))));
    app.post('/api/sessions/:id/purge/preview', async (req, reply) => send(reply, () => service.purgePreview(assertIdentifier(req.params.id, 'session id'), parseMode(req.body?.mode))));
    /**
     * The destructive endpoint. `confirm: true` is not security — the UI's typed
     * session name is what stands between a user and this call — but it does stop a
     * mis-routed fetch or a replayed URL from deleting anything.
     */
    app.post('/api/sessions/:id/purge/execute', async (req, reply) => send(reply, async () => {
        const sessionId = assertIdentifier(req.params.id, 'session id');
        const body = req.body ?? {};
        if (body.confirm !== true) {
            throw new AppError('bad-request', 'Refusing to run a destructive command without confirmation.', 'Send { "confirm": true } once the user has typed the session name.');
        }
        return service.purgeExecute(sessionId, {
            confirm: true,
            mode: parseMode(body.mode),
            ignoreReferences: body.ignoreReferences === true,
            backupFirst: body.backupFirst === true,
        }, (step) => hub.broadcast({ type: 'purge-progress', sessionId, step }));
    }));
    app.get('/api/prefs', async (_req, reply) => send(reply, async () => readPrefs(cfg.prefsFile)));
    app.put('/api/prefs', async (req, reply) => send(reply, async () => {
        const body = req.body ?? {};
        return writePrefs(cfg.prefsFile, {
            ...(typeof body.lastSessionId === 'string' || body.lastSessionId === null
                ? { lastSessionId: body.lastSessionId } : {}),
            ...(typeof body.collapseDone === 'boolean' ? { collapseDone: body.collapseDone } : {}),
        });
    }));
    /** SSE. Comment-only keepalives stop an idle proxy or browser from dropping the stream. */
    app.get('/api/events', (req, reply) => {
        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        const write = (event) => {
            reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        };
        write({ type: 'hello', source: service.source });
        const unsubscribe = hub.subscribe(write);
        const keepalive = setInterval(() => reply.raw.write(': keepalive\n\n'), 25_000);
        req.raw.on('close', () => {
            clearInterval(keepalive);
            unsubscribe();
        });
    });
}
function parseMode(value) {
    if (value === 'purge')
        return 'purge';
    if (value === undefined || value === 'prune')
        return 'prune';
    throw new AppError('bad-request', `Unknown purge mode \`${String(value)}\`.`, 'Use "prune" for closed beads or "purge" for ephemeral ones.');
}
//# sourceMappingURL=api.js.map