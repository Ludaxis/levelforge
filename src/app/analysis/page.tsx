import { PageHeader } from '@/components/layout/PageHeader';
import { AnalysisShell } from '@/components/analysis/AnalysisShell';

export default function AnalysisPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cadence DDA Analysis"
        description="Import production signal data and replay it through the Cadence DDA pipeline step by step. Client-side, deterministic, game-agnostic."
      />
      <AnalysisShell />
    </div>
  );
}
