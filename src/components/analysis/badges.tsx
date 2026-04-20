export function OutcomeBadge({ outcome }: { outcome: string }) {
  const cls =
    outcome === 'win'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
      : outcome === 'lose'
        ? 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30'
        : 'bg-muted text-muted-foreground';
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0 text-[10px] ${cls}`}
    >
      {outcome}
    </span>
  );
}

export function FlowStateBadge({ state }: { state: string }) {
  const palette: Record<string, string> = {
    flow: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    boredom:
      'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
    anxiety:
      'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
    frustration:
      'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
    unknown: 'bg-muted text-muted-foreground border-transparent',
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0 text-[10px] ${
        palette[state] ?? palette.unknown
      }`}
    >
      {state}
    </span>
  );
}
