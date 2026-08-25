import { useEffect, useState } from 'react';

/**
 * The JS half of the reduced-motion gate. CSS handles transitions; this stops the
 * power-on sequence and the flicker from being *scheduled* at all, so they are
 * genuinely off rather than running at 1ms.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (): void => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
