import { watch } from 'chokidar';
/**
 * Paths under `.beads/` that change without a bead changing. bd's embedded Dolt
 * rewrites its noms manifest/journal on *every read*, so watching the store would
 * make the sidecar react to its own `bd list` — an endless refresh loop. Ignore the
 * Dolt store, lock files, the ephemeral session db, and the version/timestamp
 * stamps; a genuine bead change still surfaces in `issues.jsonl` (and the other
 * `.jsonl` exports), which stay watched.
 */
const IGNORED_CHURN = /(?:^|[/\\])(?:dolt|embeddeddolt)(?:[/\\]|$)|[/\\](?:[^/\\]*\.lock|last-touched|\.local_version|ephemeral\.sqlite3[^/\\]*)$/;
/**
 * One SSE fan-out plus the `.beads/` watcher that feeds it.
 *
 * Watching rather than polling is the whole point: each poll would be a process
 * spawn, and agents write in bursts, so the debounce is what keeps a burst of
 * fifteen writes from becoming fifteen layout passes.
 */
export class EventHub {
    debounceMs;
    sinks = new Set();
    watcher = null;
    timer = null;
    constructor(debounceMs = 400) {
        this.debounceMs = debounceMs;
    }
    subscribe(sink) {
        this.sinks.add(sink);
        return () => this.sinks.delete(sink);
    }
    broadcast(event) {
        for (const sink of this.sinks) {
            try {
                sink(event);
            }
            catch {
                this.sinks.delete(sink);
            }
        }
    }
    watchDir(dir, onError) {
        this.close();
        this.watcher = watch(dir, {
            ignoreInitial: true,
            // Don't react to our own reads: bd's embedded Dolt churns its store on every
            // query (see IGNORED_CHURN). Without this, one `bd list` triggers a refresh
            // that runs another `bd list`, forever.
            ignored: (p) => IGNORED_CHURN.test(p),
            // Dolt writes through temp files; settling avoids reading a half-written store.
            awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
            depth: 6,
        });
        const bump = () => this.schedule();
        this.watcher.on('add', bump).on('change', bump).on('unlink', bump);
        if (onError)
            this.watcher.on('error', (e) => onError(e));
    }
    schedule() {
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.timer = null;
            this.broadcast({ type: 'beads-changed', at: new Date().toISOString() });
        }, this.debounceMs);
    }
    async close() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.watcher) {
            await this.watcher.close();
            this.watcher = null;
        }
    }
}
//# sourceMappingURL=events.js.map