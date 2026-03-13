import { SawtoothCurve } from '@/components/charts/SawtoothCurve';
import { PageHeader } from '@/components/layout/PageHeader';

export default function SawtoothPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sawtooth Difficulty Curve"
        description="Visualize and customize the 10-level difficulty cycle pattern. This pattern creates tension and release rhythms that maintain player engagement."
      />
      <SawtoothCurve />
    </div>
  );
}
