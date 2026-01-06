import { MoveCalculator } from '@/components/charts/MoveCalculator';
import { LevelDurationFramework } from '@/components/charts/LevelDurationFramework';

export default function CalculatorPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Level Design Calculator</h1>
        <p className="text-muted-foreground mt-2">
          Industry benchmarks for level duration, move counts, and session design.
          Calculate recommendations based on level number, genre, and progression stage.
        </p>
      </div>
      <LevelDurationFramework />
      <MoveCalculator />
    </div>
  );
}
