import { watch, type FSWatcher } from 'chokidar';
import type { ServerEvent } from '@beadviz/contract';

type Sink = (event: ServerEvent) => void;

/**
 * One SSE fan-out plus the `.beads/` watcher that feeds it.
 *
 * Watching rather than polling is the whole point: each poll would be a process
 * spawn, and agents write in bursts, so the debounce is what keeps a burst of
 * fifteen writes from becoming fifteen layout passes.
 */
export class EventHub {
  private readonly sinks = new Set<Sink>();
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly debounceMs = 400) {}

  subscribe(sink: Sink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  broadcast(event: ServerEvent): void {
    for (const sink of this.sinks) {
      try { sink(event); } catch { this.sinks.delete(sink); }
    }
  }

  watchDir(dir: string, onError?: (e: Error) => void): void {
    this.close();
    this.watcher = watch(dir, {
      ignoreInitial: true,
      // Dolt writes through temp files; settling avoids reading a half-written store.
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
      depth: 6,
    });
    const bump = (): void => this.schedule();
    this.watcher.on('add', bump).on('change', bump).on('unlink', bump);
    if (onError) this.watcher.on('error', (e) => onError(e as Error));
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.broadcast({ type: 'beads-changed', at: new Date().toISOString() });
    }, this.debounceMs);
  }

  async close(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.watcher) { await this.watcher.close(); this.watcher = null; }
  }
}
