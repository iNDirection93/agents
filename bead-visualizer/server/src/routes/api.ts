import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PurgeExecuteRequest, PurgeMode, ServerEvent } from '@beadviz/contract';
import { AppError, toAppError } from '../errors.js';
import { assertIdentifier } from '../validate.js';
import type { BeadService } from '../service.js';
import type { EventHub } from '../events.js';
import { readPrefs, writePrefs, type AppConfig } from '../config.js';

interface Deps {
  service: BeadService;
  hub: EventHub;
  cfg: AppConfig;
}

export async function registerApi(app: FastifyInstance, { service, hub, cfg }: Deps): Promise<void> {
  const send = async <T>(reply: FastifyReply, work: () => Promise<T>): Promise<void> => {
    try {
      reply.send(await work());
    } catch (e) {
      const err = toAppError(e);
      app.log.error({ kind: err.kind, detail: err.detail }, err.message);
      reply.code(err.httpStatus).send(err.toPayload());
    }
  };

  app.get('/api/health', async (_req, reply) => send(reply, () => service.health()));

  app.get('/api/sessions', async (_req, reply) => send(reply, () => service.sessions()));

  app.get('/api/sessions/:id/graph', async (req: FastifyRequest<{ Params: { id: string } }>, reply) =>
    send(reply, () => service.graph(assertIdentifier(req.params.id, 'session id'))));

  app.get('/api/beads/:beadId', async (req: FastifyRequest<{ Params: { beadId: string } }>, reply) =>
    send(reply, () => service.bead(assertIdentifier(req.params.beadId, 'bead id'))));

  app.post('/api/sessions/:id/purge/preview', async (
    req: FastifyRequest<{ Params: { id: string }; Body?: { mode?: string } }>, reply,
  ) => send(reply, () => service.purgePreview(
    assertIdentifier(req.params.id, 'session id'),
    parseMode(req.body?.mode),
  )));

  /**
   * The destructive endpoint. `confirm: true` is not security — the UI's typed
   * session name is what stands between a user and this call — but it does stop a
   * mis-routed fetch or a replayed URL from deleting anything.
   */
  app.post('/api/sessions/:id/purge/execute', async (
    req: FastifyRequest<{ Params: { id: string }; Body?: Partial<PurgeExecuteRequest> }>, reply,
  ) => send(reply, async () => {
    const sessionId = assertIdentifier(req.params.id, 'session id');
    const body = req.body ?? {};
    if (body.confirm !== true) {
      throw new AppError('bad-request', 'Refusing to run a destructive command without confirmation.', 'Send { "confirm": true } once the user has typed the session name.');
    }
    return service.purgeExecute(
      sessionId,
      {
        confirm: true,
        mode: parseMode(body.mode),
        ignoreReferences: body.ignoreReferences === true,
        backupFirst: body.backupFirst === true,
      },
      (step) => hub.broadcast({ type: 'purge-progress', sessionId, step }),
    );
  }));

  app.get('/api/prefs', async (_req, reply) => send(reply, async () => readPrefs(cfg.prefsFile)));

  app.put('/api/prefs', async (req: FastifyRequest<{ Body?: Record<string, unknown> }>, reply) =>
    send(reply, async () => {
      const body = req.body ?? {};
      return writePrefs(cfg.prefsFile, {
        ...(typeof body.lastSessionId === 'string' || body.lastSessionId === null
          ? { lastSessionId: body.lastSessionId as string | null } : {}),
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

    const write = (event: ServerEvent): void => {
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

function parseMode(value: unknown): PurgeMode {
  if (value === 'purge') return 'purge';
  if (value === undefined || value === 'prune') return 'prune';
  throw new AppError('bad-request', `Unknown purge mode \`${String(value)}\`.`, 'Use "prune" for closed beads or "purge" for ephemeral ones.');
}
