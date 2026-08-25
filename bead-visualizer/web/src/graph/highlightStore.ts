import { useSyncExternalStore } from 'react';

export type NodeEmphasis = 'none' | 'lit' | 'dimmed' | 'selected';

/**
 * Hover and selection state, kept outside React.
 *
 * The naive version puts the highlighted set in component state and passes it
 * through node data, which re-renders all 200 nodes on every pointer move. Here
 * each node subscribes to its own slot, so hovering re-renders only the nodes whose
 * emphasis actually changed — which is what makes the transitive highlight usable
 * on a dense graph rather than a slideshow.
 */
export class HighlightStore {
  private listeners = new Map<string, Set<() => void>>();
  private globalListeners = new Set<() => void>();
  private nodeState = new Map<string, NodeEmphasis>();
  private edgeState = new Map<string, boolean>();
  private hovered: string | null = null;
  private selected: string | null = null;

  subscribeNode = (id: string) => (listener: () => void): (() => void) => {
    const set = this.listeners.get(`n:${id}`) ?? new Set();
    set.add(listener);
    this.listeners.set(`n:${id}`, set);
    return () => set.delete(listener);
  };

  subscribeEdge = (id: string) => (listener: () => void): (() => void) => {
    const set = this.listeners.get(`e:${id}`) ?? new Set();
    set.add(listener);
    this.listeners.set(`e:${id}`, set);
    return () => set.delete(listener);
  };

  subscribeGlobal = (listener: () => void): (() => void) => {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  };

  nodeEmphasis = (id: string) => (): NodeEmphasis => this.nodeState.get(id) ?? 'none';
  edgeLit = (id: string) => (): boolean => this.edgeState.get(id) ?? false;
  getHovered = (): string | null => this.hovered;
  getSelected = (): string | null => this.selected;

  /** `lit` nodes are in the chain; when anything is active, everything else dims. */
  apply(opts: {
    hovered: string | null;
    selected: string | null;
    lit: Set<string>;
    litEdges: Set<string>;
    allNodes: string[];
    allEdges: string[];
  }): void {
    const active = opts.hovered !== null || opts.selected !== null;
    const changedNodes: string[] = [];
    const changedEdges: string[] = [];

    for (const id of opts.allNodes) {
      const next: NodeEmphasis = !active
        ? 'none'
        : id === opts.selected
          ? 'selected'
          : opts.lit.has(id)
            ? 'lit'
            : 'dimmed';
      if ((this.nodeState.get(id) ?? 'none') !== next) {
        this.nodeState.set(id, next);
        changedNodes.push(id);
      }
    }
    for (const id of opts.allEdges) {
      const next = active && opts.litEdges.has(id);
      if ((this.edgeState.get(id) ?? false) !== next) {
        this.edgeState.set(id, next);
        changedEdges.push(id);
      }
    }

    const hoverChanged = this.hovered !== opts.hovered || this.selected !== opts.selected;
    this.hovered = opts.hovered;
    this.selected = opts.selected;

    for (const id of changedNodes) this.notify(`n:${id}`);
    for (const id of changedEdges) this.notify(`e:${id}`);
    if (hoverChanged) for (const l of this.globalListeners) l();
  }

  private notify(key: string): void {
    for (const listener of this.listeners.get(key) ?? []) listener();
  }
}

export function useNodeEmphasis(store: HighlightStore, id: string): NodeEmphasis {
  return useSyncExternalStore(store.subscribeNode(id), store.nodeEmphasis(id), store.nodeEmphasis(id));
}

export function useEdgeLit(store: HighlightStore, id: string): boolean {
  return useSyncExternalStore(store.subscribeEdge(id), store.edgeLit(id), store.edgeLit(id));
}
