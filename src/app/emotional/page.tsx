import { EmotionalSpectrum } from '@/components/charts/EmotionalSpectrum';
import { FlowStateChart } from '@/components/charts/FlowStateChart';
import { FlowSawtoothBridge } from '@/components/charts/FlowSawtoothBridge';

export default function EmotionalPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Emotional Design</h1>
        <p className="text-muted-foreground mt-2">
          Engineer player emotions through flow state management and outcome design.
          Keep players in the flow zone while creating near-loss wins and almost-win losses.
        </p>
      </div>
      <FlowStateChart />
      <FlowSawtoothBridge />
      <EmotionalSpectrum />
    </div>
  );
}
