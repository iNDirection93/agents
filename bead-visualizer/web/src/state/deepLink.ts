/**
 * `?session=X&bead=Y` — the point is that you can paste a link to a specific bead
 * into a conversation with an agent, so the URL is the source of truth on load and
 * a mirror of the UI afterwards.
 */
export interface DeepLink {
  session: string | null;
  bead: string | null;
}

const SAFE = /^[A-Za-z0-9._-]{1,64}$/;

export function readDeepLink(search: string = window.location.search): DeepLink {
  const params = new URLSearchParams(search);
  const session = params.get('session');
  const bead = params.get('bead');
  return {
    session: session && SAFE.test(session) ? session : null,
    bead: bead && SAFE.test(bead) ? bead : null,
  };
}

/** replaceState, not pushState: selecting beads should not fill the back button. */
export function writeDeepLink(link: DeepLink): void {
  const params = new URLSearchParams(window.location.search);
  if (link.session) params.set('session', link.session);
  else params.delete('session');
  if (link.bead) params.set('bead', link.bead);
  else params.delete('bead');

  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ''}`;
  if (next !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(null, '', next);
  }
}
