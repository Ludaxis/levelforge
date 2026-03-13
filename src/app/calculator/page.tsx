import { MoveCalculator } from '@/components/charts/MoveCalculator';
import { LevelDurationFramework } from '@/components/charts/LevelDurationFramework';
import { PageHeader } from '@/components/layout/PageHeader';

export default function CalculatorPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Level Design Calculator"
        description="Industry benchmarks for level duration, move counts, and session design. Calculate recommendations based on level number, genre, and progression stage."
      />
      <LevelDurationFramework />
      <MoveCalculator />
    </div>
  );
}
