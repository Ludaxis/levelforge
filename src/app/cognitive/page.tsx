import { CognitiveBalance } from '@/components/charts/CognitiveBalance';

export default function CognitivePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Cognitive Balance</h1>
        <p className="text-muted-foreground mt-2">
          Adjust the balance between automatic (System 1) and deliberate (System 2) thinking
          for each game phase. Based on Daniel Kahneman&apos;s dual-process theory.
        </p>
      </div>
      <CognitiveBalance />
    </div>
  );
}
