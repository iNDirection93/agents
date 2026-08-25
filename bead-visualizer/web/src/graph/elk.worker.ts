/// <reference lib="webworker" />

/**
 * This file *is* elk's worker.
 *
 * `elk-worker.min.js` branches on its environment: loaded where `document` is
 * undefined and `self` is defined — that is, inside a Web Worker — it installs
 * itself as the message handler and exports nothing at all. So the only correct way
 * to use it is to let it own a worker, and to speak its protocol from the main
 * thread through `elk-api`, which is what useElkLayout.ts does.
 *
 * Importing it for side effects is the whole file. Anything else here would be
 * fighting it for `self.onmessage`.
 */
import 'elkjs/lib/elk-worker.min.js';
