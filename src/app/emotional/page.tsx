import { EmotionalSpectrum } from '@/components/charts/EmotionalSpectrum';
import { FlowStateChart } from '@/components/charts/FlowStateChart';
import { FlowSawtoothBridge } from '@/components/charts/FlowSawtoothBridge';
import { PageHeader } from '@/components/layout/PageHeader';

export default function EmotionalPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Emotional Design"
        description="Engineer player emotions through flow state management and outcome design. Keep players in the flow zone while creating near-loss wins and almost-win losses."
      />
      <FlowStateChart />
      <FlowSawtoothBridge />
      <EmotionalSpectrum />
    </div>
  );
}
