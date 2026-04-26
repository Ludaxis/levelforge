'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export function Section({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('mb-5', className)}>
      {title && <h3 className="text-sm font-semibold mb-2 text-foreground">{title}</h3>}
      <div className="text-sm text-foreground/80 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal list-inside space-y-1.5 pl-1">{children}</ol>;
}

export function Bullets({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc list-inside space-y-1 pl-1">{children}</ul>;
}

export function K({ children }: { children: React.ReactNode }) {
  return <code className="px-1 py-0.5 rounded bg-muted text-[12px] font-mono">{children}</code>;
}

export function Note({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'tip'; children: React.ReactNode }) {
  const toneCls = {
    info: 'border-blue-500/30 bg-blue-500/5 text-blue-200',
    warn: 'border-yellow-500/30 bg-yellow-500/5 text-yellow-200',
    tip: 'border-green-500/30 bg-green-500/5 text-green-200',
  }[tone];
  const label = { info: 'Note', warn: 'Heads up', tip: 'Tip' }[tone];
  return (
    <div className={cn('border rounded-md px-3 py-2 my-2 text-xs', toneCls)}>
      <strong className="font-semibold">{label}: </strong>
      {children}
    </div>
  );
}

export function Verdict({ kind, children }: { kind: 'solvable' | 'risky' | 'stuck'; children: React.ReactNode }) {
  const map = {
    solvable: { label: '✓ Solvable', cls: 'text-green-400 border-green-500/30 bg-green-500/5' },
    risky: { label: '~ Risky', cls: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/5' },
    stuck: { label: '✗ Stuck', cls: 'text-red-400 border-red-500/30 bg-red-500/5' },
  }[kind];
  return (
    <div className={cn('border rounded-md px-3 py-2 my-1 text-xs flex gap-2 items-start', map.cls)}>
      <span className="font-mono font-semibold whitespace-nowrap">{map.label}</span>
      <span className="text-foreground/80">{children}</span>
    </div>
  );
}
