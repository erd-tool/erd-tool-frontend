import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps
} from '@xyflow/react';
import type { RelationshipDefinition } from '../../lib/types';

export interface RelationshipEdgeData extends Record<string, unknown> {
  relationship: RelationshipDefinition;
}

function getBadgeToken(side: '1' | 'N', required: boolean) {
  if (side === '1') return required ? '||' : 'o|';
  return required ? '|<' : 'o<';
}

function getBadgePosition(x: number, y: number, kind: 'source' | 'target') {
  return {
    x,
    y: kind === 'source' ? y + 18 : y - 18
  };
}

export function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  selected,
  data
}: EdgeProps<Edge<RelationshipEdgeData>>) {
  const relationship = data?.relationship;
  if (!relationship) return null;

  const [edgePath, centerX, centerY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 18
  });

  const [sourceCardinality = '1', targetCardinality = 'N'] = relationship.cardinality.split(':') as ['1' | 'N', '1' | 'N'];
  const sourceBadge = getBadgePosition(sourceX, sourceY, 'source');
  const targetBadge = getBadgePosition(targetX, targetY, 'target');

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeDasharray: relationship.identifying ? undefined : '8 6'
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={`relationship-end-badge ${selected ? 'selected' : ''}`}
          style={{
            transform: `translate(-50%, -50%) translate(${sourceBadge.x}px, ${sourceBadge.y}px)`
          }}
        >
          {getBadgeToken(sourceCardinality, true)}
        </div>
        <div
          className={`relationship-center-chip ${selected ? 'selected' : ''}`}
          style={{
            transform: `translate(-50%, -50%) translate(${centerX}px, ${centerY}px)`
          }}
        >
          {relationship.identifying ? '식별' : '비식별'}
        </div>
        <div
          className={`relationship-end-badge ${selected ? 'selected' : ''}`}
          style={{
            transform: `translate(-50%, -50%) translate(${targetBadge.x}px, ${targetBadge.y}px)`
          }}
        >
          {getBadgeToken(targetCardinality, relationship.required ?? true)}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
