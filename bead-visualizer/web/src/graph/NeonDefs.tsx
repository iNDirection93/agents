/**
 * One `<filter>` in the document, referenced by every glowing edge.
 *
 * The point is that it is *one*: a separate blur per edge is a separate raster
 * target per edge, and that is the thing that dies at a hundred edges.
 */
export function NeonDefs(): JSX.Element {
  return (
    <svg className="neon-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <filter id="neon-blur" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        {/* Avatars are clipped to the node circle; gates reuse the same mechanism. */}
        <clipPath id="bead-clip" clipPathUnits="objectBoundingBox">
          <circle cx="0.5" cy="0.5" r="0.5" />
        </clipPath>
      </defs>
    </svg>
  );
}
