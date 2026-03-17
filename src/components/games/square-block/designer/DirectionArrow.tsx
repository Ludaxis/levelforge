'use client';

import { BlockDirection } from '@/types/squareBlock';
import {
  SquareDirection,
  DIRECTION_ANGLES,
  AXIS_ANGLES,
  isBidirectional,
} from '@/lib/squareGrid';

interface DirectionArrowProps {
  cx: number;
  cy: number;
  direction: BlockDirection;
  size: number;
  color?: string;
}

export function DirectionArrow({ cx, cy, direction, size, color = '#ffffff' }: DirectionArrowProps) {
  const arrowLength = size * 0.7;
  const arrowHeadSize = size * 0.35;
  const strokeWidth = 3;
  const outlineWidth = strokeWidth + 2;

  if (isBidirectional(direction)) {
    const angle = AXIS_ANGLES[direction];
    const lineStart = -arrowLength * 0.35;
    const lineEnd = arrowLength * 0.35;

    return (
      <g transform={`translate(${cx}, ${cy}) rotate(${angle})`}>
        <line x1={lineStart} y1={0} x2={lineEnd} y2={0} stroke="rgba(0, 0, 0, 0.6)" strokeWidth={outlineWidth} strokeLinecap="round" />
        <polygon points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`} fill="rgba(0, 0, 0, 0.6)" />
        <polygon points={`${lineStart + arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineStart - 3},0 ${lineStart + arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`} fill="rgba(0, 0, 0, 0.6)" />
        <line x1={lineStart} y1={0} x2={lineEnd} y2={0} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        <polygon points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`} fill={color} />
        <polygon points={`${lineStart + arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineStart - 3},0 ${lineStart + arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`} fill={color} />
      </g>
    );
  }

  const angle = DIRECTION_ANGLES[direction as SquareDirection];
  const lineStart = -arrowLength * 0.3;
  const lineEnd = arrowLength * 0.35;

  return (
    <g transform={`translate(${cx}, ${cy}) rotate(${angle})`}>
      <line x1={lineStart} y1={0} x2={lineEnd} y2={0} stroke="rgba(0, 0, 0, 0.6)" strokeWidth={outlineWidth} strokeLinecap="round" />
      <polygon points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.55} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.55}`} fill="rgba(0, 0, 0, 0.6)" />
      <line x1={lineStart} y1={0} x2={lineEnd} y2={0} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <polygon points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.55} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.55}`} fill={color} />
    </g>
  );
}
