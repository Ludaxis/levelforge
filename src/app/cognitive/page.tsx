import { CognitiveBalance } from '@/components/charts/CognitiveBalance';
import { PageHeader } from '@/components/layout/PageHeader';

export default function CognitivePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cognitive Balance"
        description="Adjust the balance between automatic (System 1) and deliberate (System 2) thinking for each game phase. Based on Daniel Kahneman's dual-process theory."
      />
      <CognitiveBalance />
    </div>
  );
}
