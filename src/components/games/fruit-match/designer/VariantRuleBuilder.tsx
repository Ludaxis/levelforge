'use client';

import { useCallback, useState, type DragEvent } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DIFFICULTY_ELEMENTS,
  getDifficultyElement,
  type DifficultyElementKey,
} from '@/lib/juicyBlast/difficultyElements';
import {
  makeRuleId,
  type VariantRule,
} from '@/lib/juicyBlast/variantResolve';

interface VariantRuleBuilderProps {
  rules: VariantRule[];
  onChange: (rules: VariantRule[]) => void;
}

export function VariantRuleBuilder({ rules, onChange }: VariantRuleBuilderProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const addRow = useCallback(() => {
    const usedNumbers = new Set(rules.map((r) => r.variantNumber));
    let next = 2;
    while (usedNumbers.has(next)) next += 1;
    onChange([
      ...rules,
      {
        id: makeRuleId(),
        variantNumber: next,
        element: 'maxSelectableItems',
        delta: 0,
      },
    ]);
  }, [rules, onChange]);

  const updateRow = useCallback(
    (id: string, patch: Partial<VariantRule>) => {
      onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    [rules, onChange]
  );

  const removeRow = useCallback(
    (id: string) => {
      onChange(rules.filter((r) => r.id !== id));
    },
    [rules, onChange]
  );

  const onDragStart = (idx: number) => (e: DragEvent<HTMLDivElement>) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (idx: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) return;
    const next = [...rules];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(idx, 0, moved);
    onChange(next);
    setDragIndex(idx);
  };
  const onDragEnd = () => setDragIndex(null);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[auto_80px_1fr_80px_auto] items-center gap-x-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span />
        <span>Variant #</span>
        <span>Element</span>
        <span>Amount</span>
        <span />
      </div>

      <div className="space-y-1.5">
        {rules.map((rule, idx) => {
          const spec = getDifficultyElement(rule.element);
          const dragging = dragIndex === idx;
          return (
            <div
              key={rule.id}
              draggable
              onDragStart={onDragStart(idx)}
              onDragOver={onDragOver(idx)}
              onDragEnd={onDragEnd}
              className={`grid grid-cols-[auto_80px_1fr_80px_auto] items-center gap-x-2 rounded-md border bg-background/40 px-1.5 py-1 ${
                dragging ? 'opacity-50' : ''
              }`}
            >
              <GripVertical className="h-3.5 w-3.5 cursor-grab text-muted-foreground" />
              <Input
                type="number"
                min={1}
                value={rule.variantNumber}
                onChange={(e) =>
                  updateRow(rule.id, {
                    variantNumber: Math.max(
                      1,
                      Math.floor(Number(e.target.value) || 1)
                    ),
                  })
                }
                className="h-7 px-2 text-xs"
              />
              <select
                value={rule.element}
                onChange={(e) =>
                  updateRow(rule.id, {
                    element: e.target.value as DifficultyElementKey,
                  })
                }
                className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              >
                {DIFFICULTY_ELEMENTS.map((el) => (
                  <option key={el.key} value={el.key}>
                    {el.label}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                step={spec?.step ?? 1}
                value={rule.delta}
                onChange={(e) =>
                  updateRow(rule.id, {
                    delta: Math.floor(Number(e.target.value) || 0),
                  })
                }
                className="h-7 px-2 text-xs"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => removeRow(rule.id)}
                aria-label="Remove row"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>

      <Button variant="outline" size="sm" onClick={addRow} className="h-7">
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add row
      </Button>
    </div>
  );
}
