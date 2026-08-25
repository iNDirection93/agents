import { useEffect, useState } from 'react';
import type { AvatarManifest } from '@beadviz/contract';

export interface AvatarResolver {
  /** URL for an agent's image; the generic fallback when the agent is unmapped. */
  src(agent: string | null): string;
  /** The agent's neon tint, or null to use the status colour. */
  hue(agent: string | null): string | null;
  label(agent: string | null): string;
  warnings: string[];
  loaded: boolean;
}

interface ManifestResponse extends AvatarManifest {
  warnings: string[];
}

const EMPTY: ManifestResponse = { version: 1, fallback: 'generic-agent.svg', agents: {}, warnings: [] };

/**
 * Avatars come from a folder the user populates (§1.4). Nothing is bundled and
 * nothing is fetched from the network, so every failure mode here ends at the
 * built-in fallback rather than a broken image.
 */
export function useAvatars(): AvatarResolver {
  const [manifest, setManifest] = useState<ManifestResponse>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/avatars/manifest')
      .then((r) => (r.ok ? (r.json() as Promise<ManifestResponse>) : EMPTY))
      .catch(() => EMPTY)
      .then((m) => {
        if (!live) return;
        setManifest(m);
        setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return {
    loaded,
    warnings: manifest.warnings,
    src(agent) {
      const entry = agent ? manifest.agents[agent] : undefined;
      return `/avatars/${entry?.file ?? manifest.fallback}`;
    },
    hue(agent) {
      return (agent ? manifest.agents[agent]?.hue : undefined) ?? null;
    },
    label(agent) {
      if (!agent) return 'Unassigned';
      return manifest.agents[agent]?.label ?? agent;
    },
  };
}
