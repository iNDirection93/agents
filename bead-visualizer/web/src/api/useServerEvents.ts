import { useEffect, useRef } from 'react';
import type { ServerEvent } from '@beadviz/contract';

/**
 * The SSE channel. Agents mutate the database underneath you constantly, so the
 * refresh is pushed rather than polled — each poll would be a process spawn.
 *
 * The handler is held in a ref so a re-render never tears down the stream; a
 * reconnecting EventSource that drops on every state change is worse than none.
 */
export function useServerEvents(onEvent: (e: ServerEvent) => void): void {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const source = new EventSource('/api/events');
    source.onmessage = (msg) => {
      try {
        handler.current(JSON.parse(msg.data as string) as ServerEvent);
      } catch {
        // A malformed frame is not worth tearing the stream down for.
      }
    };
    // EventSource reconnects on its own; logging every blip would be noise.
    source.onerror = () => undefined;
    return () => source.close();
  }, []);
}
