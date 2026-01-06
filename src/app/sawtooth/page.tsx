import { SawtoothCurve } from '@/components/charts/SawtoothCurve';

export default function SawtoothPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Sawtooth Difficulty Curve</h1>
        <p className="text-muted-foreground mt-2">
          Visualize and customize the 10-level difficulty cycle pattern. This pattern creates
          tension and release rhythms that maintain player engagement.
        </p>
      </div>
      <SawtoothCurve />
    </div>
  );
}
