'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import type { SolvabilityBannerProps } from './types';

export function SolvabilityBanner({
  solvability,
  deadlockInfo,
  blocks,
  holes,
  blockTypeCounts,
}: SolvabilityBannerProps) {
  return (
    <>
      {/* Solvability Check */}
      <div
        className={`flex items-center gap-2 p-3 rounded-lg ${
          solvability.solvable ? 'bg-green-500/10 border border-green-500/30' : 'bg-amber-500/10 border border-amber-500/30'
        }`}
      >
        {solvability.solvable ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        )}
        <div className="flex-1">
          <p className={`text-sm font-medium ${solvability.solvable ? 'text-green-500' : 'text-amber-500'}`}>
            {solvability.solvable ? 'Level is solvable!' : 'Not solvable'}
          </p>
          <p className="text-xs text-muted-foreground">
            {!solvability.solvable && deadlockInfo.hasDeadlock
              ? (() => {
                  const mutualCount = Array.from(deadlockInfo.stuckBlocks.values()).filter(r => r.type === 'mutual_block').length / 2;
                  const blockedCount = deadlockInfo.stuckBlocks.size - (mutualCount * 2);
                  const blockerOnlyCount = Array.from(deadlockInfo.blockerBlocks).filter(k => !deadlockInfo.stuckBlocks.has(k)).length;
                  const parts: string[] = [];
                  if (mutualCount > 0) parts.push(`${Math.floor(mutualCount)} mutual`);
                  if (blockedCount > 0) parts.push(`${blockedCount} blocked`);
                  if (blockerOnlyCount > 0) parts.push(`${blockerOnlyCount} blocker${blockerOnlyCount > 1 ? 's' : ''}`);
                  return `Deadlock: ${parts.join(', ')}`;
                })()
              : solvability.message}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="outline">{blocks.size} blocks</Badge>
          {holes.size > 0 && <Badge variant="outline">{holes.size} holes</Badge>}
        </div>
      </div>

      {/* Block Type Counts */}
      {blocks.size > 0 && (
        <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg text-sm">
          <span className="text-muted-foreground font-medium">Block Types:</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-cyan-500" />
            <span>{blockTypeCounts.normal}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-amber-500" />
            <span className="text-amber-400">{blockTypeCounts.gate} gate</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-400" />
            <span className="text-blue-400">{blockTypeCounts.ice} ice</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-purple-500" />
            <span className="text-purple-400">{blockTypeCounts.mirror} mirror</span>
          </div>
        </div>
      )}
    </>
  );
}
