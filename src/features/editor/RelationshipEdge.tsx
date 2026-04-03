import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps, useReactFlow } from '@xyflow/react';
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { RelationshipDefinition } from '../../lib/types';
import { useAppStore } from '../../state/app-store';

export interface RelationshipEdgeData extends Record<string, unknown> {
  relationship: RelationshipDefinition;
  laneOffset?: number;
}

function notifyRelationshipDragFinished(relationshipId: string) {
  window.dispatchEvent(
    new CustomEvent('relationship-edge-drag-finished', {
      detail: { relationshipId }
    })
  );
}

function getBadgeToken(side: '1' | 'N', required: boolean) {
  if (side === '1') return required ? '||' : 'o|';
  return required ? '|<' : 'o<';
}

function getQuadraticPoint(
  start: { x: number; y: number },
  end: { x: number; y: number },
  t: number
) {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t
  };
}

function getSegmentNormal(
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  const tangentX = end.x - start.x;
  const tangentY = end.y - start.y;
  const length = Math.hypot(tangentX, tangentY) || 1;
  return {
    x: -tangentY / length,
    y: tangentX / length
  };
}

function buildOrthogonalRoute(
  source: { x: number; y: number },
  target: { x: number; y: number },
  midpoint: { x: number; y: number },
  controlOffset: { x: number; y: number }
) {
  const prefersVerticalCorridor = Math.abs(controlOffset.x) > Math.abs(controlOffset.y) + 16;

  if (prefersVerticalCorridor) {
    const bendX = midpoint.x + controlOffset.x;
    const firstBend = { x: bendX, y: source.y };
    const secondBend = { x: bendX, y: target.y };
    return {
      path: `M ${source.x},${source.y} L ${firstBend.x},${firstBend.y} L ${secondBend.x},${secondBend.y} L ${target.x},${target.y}`,
      centerPoint: getQuadraticPoint(firstBend, secondBend, 0.5),
      sourceSegment: [source, firstBend] as const,
      targetSegment: [secondBend, target] as const
    };
  }

  const bendY = midpoint.y + controlOffset.y;
  const firstBend = { x: source.x, y: bendY };
  const secondBend = { x: target.x, y: bendY };
  return {
    path: `M ${source.x},${source.y} L ${firstBend.x},${firstBend.y} L ${secondBend.x},${secondBend.y} L ${target.x},${target.y}`,
    centerPoint: getQuadraticPoint(firstBend, secondBend, 0.5),
    sourceSegment: [source, firstBend] as const,
    targetSegment: [secondBend, target] as const
  };
}

function offsetFromPoint(
  point: { x: number; y: number },
  normal: { x: number; y: number },
  distance: number
) {
  return {
    x: point.x + normal.x * distance,
    y: point.y + normal.y * distance
  };
}

export function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  selected,
  data
}: EdgeProps<Edge<RelationshipEdgeData>>) {
  const relationship = data?.relationship;
  const laneOffset = data?.laneOffset ?? 0;
  const setSelectedRelationshipId = useAppStore((state) => state.setSelectedRelationshipId);
  const moveRelationshipControlPoint = useAppStore((state) => state.moveRelationshipControlPoint);
  const { screenToFlowPosition } = useReactFlow();
  const didDragRef = useRef(false);

  if (!relationship) return null;

  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const baseNormal = {
    x: -deltaY / length,
    y: deltaX / length
  };
  const midpoint = {
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2
  };
  const fallbackControlPoint = {
    x: midpoint.x + baseNormal.x * (laneOffset + (relationship.curveOffset ?? 0)),
    y: midpoint.y + baseNormal.y * (laneOffset + (relationship.curveOffset ?? 0))
  };
  const fallbackControlOffset = {
    x: fallbackControlPoint.x - midpoint.x,
    y: fallbackControlPoint.y - midpoint.y
  };
  const controlOffset =
    relationship.controlOffset ??
    (relationship.controlPoint
      ? {
          x: relationship.controlPoint.x - midpoint.x,
          y: relationship.controlPoint.y - midpoint.y
        }
      : fallbackControlOffset);
  const orthogonalRoute = buildOrthogonalRoute(source, target, midpoint, controlOffset);
  const edgePath = orthogonalRoute.path;
  const centerPoint = orthogonalRoute.centerPoint;
  const sourceBadgeAnchor = getQuadraticPoint(orthogonalRoute.sourceSegment[0], orthogonalRoute.sourceSegment[1], 0.5);
  const targetBadgeAnchor = getQuadraticPoint(orthogonalRoute.targetSegment[0], orthogonalRoute.targetSegment[1], 0.5);
  const sourceBadgeNormal = getSegmentNormal(orthogonalRoute.sourceSegment[0], orthogonalRoute.sourceSegment[1]);
  const targetBadgeNormal = getSegmentNormal(orthogonalRoute.targetSegment[0], orthogonalRoute.targetSegment[1]);
  const sourceBadge = offsetFromPoint(sourceBadgeAnchor, sourceBadgeNormal, 18);
  const targetBadge = offsetFromPoint(targetBadgeAnchor, targetBadgeNormal, -18);

  const [sourceCardinality = '1', targetCardinality = 'N'] = relationship.cardinality.split(':') as ['1' | 'N', '1' | 'N'];

  function handleControlDragStart(event: ReactPointerEvent<SVGPathElement | HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    didDragRef.current = false;

    const dragStart = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY
    });
    const initialControlOffset = controlOffset;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextPoint = screenToFlowPosition({
        x: moveEvent.clientX,
        y: moveEvent.clientY
      });

      if (Math.abs(moveEvent.clientX - event.clientX) > 3 || Math.abs(moveEvent.clientY - event.clientY) > 3) {
        didDragRef.current = true;
      }

      moveRelationshipControlPoint(relationship.id, {
        x: initialControlOffset.x + (nextPoint.x - dragStart.x),
        y: initialControlOffset.y + (nextPoint.y - dragStart.y)
      });
    };

    const handlePointerUp = () => {
      if (didDragRef.current) {
        notifyRelationshipDragFinished(relationship.id);
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  }

  function handleDragClick(event: React.MouseEvent<SVGPathElement | HTMLDivElement>) {
    if (didDragRef.current) {
      event.preventDefault();
      event.stopPropagation();
      didDragRef.current = false;
      return;
    }
    event.stopPropagation();
    setSelectedRelationshipId(relationship.id);
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: selected ? '#d97706' : '#51657d',
          strokeWidth: selected ? 2.8 : 2.2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          strokeDasharray: relationship.identifying ? undefined : '8 6'
        }}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={28}
        className="relationship-drag-path"
        onPointerDown={handleControlDragStart}
        onClick={handleDragClick}
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
            transform: `translate(-50%, -50%) translate(${centerPoint.x}px, ${centerPoint.y}px)`
          }}
          onPointerDown={handleControlDragStart}
          onClick={handleDragClick}
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
