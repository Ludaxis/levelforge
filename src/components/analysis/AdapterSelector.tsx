'use client';

import { Gamepad2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ADAPTERS, type GameAdapter } from '@/lib/cadence/adapters';
import { cn } from '@/lib/utils';

interface AdapterSelectorProps {
  value: string;
  onChange: (adapterId: string) => void;
}

export function AdapterSelector({ value, onChange }: AdapterSelectorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gamepad2 className="h-5 w-5 text-primary" />
          Game Adapter
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ADAPTERS.map((adapter) => (
            <AdapterCard
              key={adapter.id}
              adapter={adapter}
              selected={adapter.id === value}
              onClick={() => onChange(adapter.id)}
            />
          ))}
          <div className="flex items-center justify-center rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            More games can plug in via the adapter contract.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AdapterCard({
  adapter,
  selected,
  onClick,
}: {
  adapter: GameAdapter;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/5'
          : 'hover:border-accent-foreground/30 hover:bg-accent/50'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">{adapter.displayName}</span>
        {selected && <Badge variant="default">Active</Badge>}
      </div>
      <p className="line-clamp-2 text-xs text-muted-foreground">
        {adapter.notes ?? 'No notes provided.'}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        <Badge variant="secondary" className="text-[10px]">
          {adapter.designLevers.length} levers
        </Badge>
        {adapter.variants && (
          <Badge variant="secondary" className="text-[10px]">
            variants {adapter.variants.min}–{adapter.variants.max}
          </Badge>
        )}
      </div>
    </button>
  );
}
