'use client';

import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { Bookmark, GripVertical, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DIFFICULTY_ELEMENTS,
  getDifficultyElement,
  type DifficultyElementKey,
} from '@/lib/juicyBlast/difficultyElements';
import {
  defaultVariantRules,
  deleteVariantTemplate,
  instantiateTemplate,
  loadVariantTemplates,
  makeRuleId,
  saveVariantTemplate,
  type VariantRule,
  type VariantTemplate,
} from '@/lib/juicyBlast/variantResolve';

interface VariantRuleBuilderProps {
  rules: VariantRule[];
  onChange: (rules: VariantRule[]) => void;
  /** Show the save/load templates toolbar. Defaults to true. */
  showTemplates?: boolean;
}

export function VariantRuleBuilder({
  rules,
  onChange,
  showTemplates = true,
}: VariantRuleBuilderProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [templates, setTemplates] = useState<VariantTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    if (showTemplates) setTemplates(loadVariantTemplates());
  }, [showTemplates]);

  const handleSaveTemplate = useCallback(() => {
    const name = templateName.trim();
    if (!name) return;
    saveVariantTemplate(name, rules);
    setTemplates(loadVariantTemplates());
    setTemplateName('');
  }, [templateName, rules]);

  const handleLoadTemplate = useCallback(
    (id: string) => {
      if (!id) return;
      const tpl = templates.find((t) => t.id === id);
      if (!tpl) return;
      onChange(instantiateTemplate(tpl));
    },
    [templates, onChange]
  );

  const handleDeleteTemplate = useCallback((id: string) => {
    deleteVariantTemplate(id);
    setTemplates(loadVariantTemplates());
  }, []);

  const handleResetToDefaults = useCallback(() => {
    onChange(defaultVariantRules());
  }, [onChange]);

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
      {showTemplates && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
          <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Templates:</span>
          <select
            onChange={(e) => {
              handleLoadTemplate(e.target.value);
              e.currentTarget.value = '';
            }}
            defaultValue=""
            className="h-7 min-w-[120px] rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="" disabled>
              Load template…
            </option>
            {templates.length === 0 && (
              <option value="" disabled>
                (none saved)
              </option>
            )}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <Input
            type="text"
            placeholder="Template name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="h-7 w-36 px-2 text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveTemplate}
            disabled={!templateName.trim() || rules.length === 0}
            className="h-7"
            title="Save current rules as a named template"
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            Save
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetToDefaults}
            className="h-7 text-muted-foreground"
            title="Replace current rules with the shipped defaults"
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Reset to defaults
          </Button>

          {templates.length > 0 && (
            <div className="ml-auto flex items-center gap-1">
              <span className="text-muted-foreground">Delete:</span>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleDeleteTemplate(e.target.value);
                    e.currentTarget.value = '';
                  }
                }}
                defaultValue=""
                className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="" disabled>
                  Pick one…
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

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
