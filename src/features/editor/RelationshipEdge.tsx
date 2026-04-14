import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps, useReactFlow } from '@xyflow/react';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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

function normalizeDirection(start: { x: number; y: number }, end: { x: number; y: number }) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY) || 1;
  return {
    x: deltaX / length,
    y: deltaY / length
  };
}

function toGlobalPoint(
  origin: { x: number; y: number },
  direction: { x: number; y: number },
  normal: { x: number; y: number },
  point: { x: number; y: number }
) {
  return {
    x: origin.x + direction.x * point.x + normal.x * point.y,
    y: origin.y + direction.y * point.x + normal.y * point.y
  };
}

function buildIeNotation(
  endpoint: { x: number; y: number },
  direction: { x: number; y: number },
  cardinality: '1' | 'N',
  optional: boolean
) {
  const normal = {
    x: -direction.y,
    y: direction.x
  };
  const lines: string[] = [];
  const circles: Array<{ cx: number; cy: number; r: number }> = [];

  if (optional) {
    const circleCenter = toGlobalPoint(endpoint, direction, normal, { x: 8, y: 0 });
    circles.push({ cx: circleCenter.x, cy: circleCenter.y, r: 4 });
  }

  if (cardinality === '1') {
    const x = optional ? 18 : 10;
    const top = toGlobalPoint(endpoint, direction, normal, { x, y: -9 });
    const bottom = toGlobalPoint(endpoint, direction, normal, { x, y: 9 });
    lines.push(`M ${top.x},${top.y} L ${bottom.x},${bottom.y}`);
  } else {
    const outerX = optional ? 14 : 6;
    const rootX = outerX + 12;
    const root = toGlobalPoint(endpoint, direction, normal, { x: rootX, y: 0 });
    const outerCenter = toGlobalPoint(endpoint, direction, normal, { x: outerX, y: 0 });
    const outerTop = toGlobalPoint(endpoint, direction, normal, { x: outerX, y: -8 });
    const outerBottom = toGlobalPoint(endpoint, direction, normal, { x: outerX, y: 8 });
    lines.push(`M ${root.x},${root.y} L ${outerCenter.x},${outerCenter.y}`);
    lines.push(`M ${root.x},${root.y} L ${outerTop.x},${outerTop.y}`);
    lines.push(`M ${root.x},${root.y} L ${outerBottom.x},${outerBottom.y}`);
  }

  return { lines, circles };
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
  const dragPreviewOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const [dragPreviewOffset, setDragPreviewOffset] = useState<{ x: number; y: number } | null>(null);

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
  const persistedControlOffset =
    relationship.controlOffset ??
    (relationship.controlPoint
      ? {
          x: relationship.controlPoint.x - midpoint.x,
          y: relationship.controlPoint.y - midpoint.y
        }
      : fallbackControlOffset);
  const controlOffset = dragPreviewOffset ?? persistedControlOffset;
  const orthogonalRoute = buildOrthogonalRoute(source, target, midpoint, controlOffset);
  const edgePath = orthogonalRoute.path;
  const [sourceCardinality = '1', targetCardinality = 'N'] = relationship.cardinality.split(':') as ['1' | 'N', '1' | 'N'];
  const sourceDirection = normalizeDirection(source, orthogonalRoute.sourceSegment[1]);
  const targetDirection = normalizeDirection(target, orthogonalRoute.targetSegment[0]);
  const sourceNotation = buildIeNotation(source, sourceDirection, sourceCardinality, false);
  const targetNotation = buildIeNotation(target, targetDirection, targetCardinality, !relationship.required);

  function handleControlDragStart(event: ReactPointerEvent<SVGPathElement>) {
    event.preventDefault();
    event.stopPropagation();
    didDragRef.current = false;

    const dragStart = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY
    });
    const initialControlOffset = persistedControlOffset;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextPoint = screenToFlowPosition({
        x: moveEvent.clientX,
        y: moveEvent.clientY
      });

      if (Math.abs(moveEvent.clientX - event.clientX) > 3 || Math.abs(moveEvent.clientY - event.clientY) > 3) {
        didDragRef.current = true;
      }

      const nextOffset = {
        x: initialControlOffset.x + (nextPoint.x - dragStart.x),
        y: initialControlOffset.y + (nextPoint.y - dragStart.y)
      };
      dragPreviewOffsetRef.current = nextOffset;
      setDragPreviewOffset(nextOffset);
    };

    const handlePointerUp = () => {
      if (didDragRef.current && dragPreviewOffsetRef.current) {
        moveRelationshipControlPoint(relationship.id, dragPreviewOffsetRef.current);
      }
      if (didDragRef.current) {
        notifyRelationshipDragFinished(relationship.id);
      }
      dragPreviewOffsetRef.current = null;
      setDragPreviewOffset(null);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  }

  function handleDragClick(event: React.MouseEvent<SVGPathElement>) {
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
        <svg
          className={`relationship-end-symbol ${selected ? 'selected' : ''}`}
          width="1"
          height="1"
          style={{ left: 0, top: 0 }}
        >
          {sourceNotation.lines.map((line) => (
            <path key={line} d={line} />
          ))}
          {sourceNotation.circles.map((circle, index) => (
            <circle key={`source-circle-${index}`} cx={circle.cx} cy={circle.cy} r={circle.r} />
          ))}
        </svg>
        <svg
          className={`relationship-end-symbol ${selected ? 'selected' : ''}`}
          width="1"
          height="1"
          style={{ left: 0, top: 0 }}
        >
          {targetNotation.lines.map((line) => (
            <path key={line} d={line} />
          ))}
          {targetNotation.circles.map((circle, index) => (
            <circle key={`target-circle-${index}`} cx={circle.cx} cy={circle.cy} r={circle.r} />
          ))}
        </svg>
      </EdgeLabelRenderer>
    </>
  );
}
