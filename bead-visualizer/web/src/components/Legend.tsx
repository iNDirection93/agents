const ROWS: Array<[string, string]> = [
  ['ready', 'Ready — actionable now'],
  ['in_progress', 'In progress'],
  ['blocked', 'Blocked'],
  ['backlog', 'Backlog — unlit'],
  ['done', 'Done — cooled'],
  ['gate', 'Gate'],
];

/**
 * Brightness encodes how live a bead is, so the legend is a reading of the sign
 * rather than a colour key — and it repeats the ring treatment, which is what
 * carries the meaning in greyscale.
 */
export function Legend(): JSX.Element {
  return (
    <div className="legend" aria-label="Status legend">
      {ROWS.map(([status, label]) => (
        <div className="legend__row" key={status}>
          <span className="legend__swatch" data-status={status} aria-hidden />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
