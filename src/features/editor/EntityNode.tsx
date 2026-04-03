import { Handle, Position, type NodeProps } from '@xyflow/react';
import { KeyRound } from 'lucide-react';
import type { EntityDefinition, EntityViewMode, FieldDefinition } from '../../lib/types';

interface NodeData {
  entity: EntityDefinition;
  viewMode?: EntityViewMode;
}

function getEntityPrimaryTitle(entity: EntityDefinition, viewMode: EntityViewMode) {
  if (viewMode === 'logical') return entity.logicalName ?? entity.name;
  return entity.name;
}

function getEntitySecondaryTitle(entity: EntityDefinition, viewMode: EntityViewMode) {
  if (viewMode !== 'both') return '';
  return entity.logicalName ?? '';
}

function getFieldTitle(field: FieldDefinition, viewMode: EntityViewMode) {
  if (viewMode === 'logical') return field.logicalName ?? field.name;
  return field.name;
}

function getFieldSubtitle(field: FieldDefinition, viewMode: EntityViewMode) {
  if (viewMode === 'logical') return field.memo ?? '';
  if (viewMode === 'physical') {
    const defaultToken = field.defaultValue ? ` = ${field.defaultValue}` : '';
    return `${field.type}${field.length ? `(${field.length})` : ''}${defaultToken}`;
  }
  const detail = `${field.type}${field.length ? `(${field.length})` : ''}`;
  return [field.logicalName ?? field.name, detail, field.defaultValue ? `기본값 ${field.defaultValue}` : '']
    .filter(Boolean)
    .join(' · ');
}

function withAlpha(hex: string, alpha: string) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  return `#${normalized}${alpha}`;
}

export function EntityNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as NodeData;
  const viewMode = nodeData.viewMode ?? 'physical';
  const accent = nodeData.entity.color ?? '#93c5fd';

  return (
    <div
      className={`entity-node ${viewMode === 'both' ? 'dual-mode' : ''} ${selected ? 'selected' : ''}`}
      style={{
        ['--entity-fill' as string]: accent,
        ['--entity-border' as string]: withAlpha(accent, 'f2'),
        ['--entity-field-background' as string]: withAlpha(accent, '66')
      }}
    >
      <Handle id="target-top" type="target" position={Position.Top} className="entity-handle" />
      <Handle id="target-right" type="target" position={Position.Right} className="entity-handle" />
      <Handle id="target-bottom" type="target" position={Position.Bottom} className="entity-handle" />
      <Handle id="target-left" type="target" position={Position.Left} className="entity-handle" />
      <header className="entity-node-head">
        <div className="entity-title-stack">
          <div className="entity-title-text">{getEntityPrimaryTitle(nodeData.entity, viewMode)}</div>
          {viewMode === 'both' ? (
            <div className="entity-title-subtext">{getEntitySecondaryTitle(nodeData.entity, viewMode)}</div>
          ) : null}
        </div>
        <span className="entity-node-count">{nodeData.entity.fields.length} fields</span>
      </header>

      <div className={`entity-fields ${viewMode === 'both' ? 'dual-mode' : ''}`}>
        {nodeData.entity.fields.map((field) => (
          <div key={field.id} className={`entity-field ${field.primaryKey ? 'primary' : ''}`}>
            <div className="entity-field-body">
              <div className="entity-field-name">
                {field.primaryKey && <KeyRound size={12} />}
                <span>{getFieldTitle(field, viewMode)}</span>
              </div>
              {getFieldSubtitle(field, viewMode) ? <small>{getFieldSubtitle(field, viewMode)}</small> : null}
            </div>
          </div>
        ))}
      </div>

      {nodeData.entity.memo && <p className="entity-node-memo">{nodeData.entity.memo}</p>}
      <Handle id="source-top" type="source" position={Position.Top} className="entity-handle" />
      <Handle id="source-right" type="source" position={Position.Right} className="entity-handle" />
      <Handle id="source-bottom" type="source" position={Position.Bottom} className="entity-handle" />
      <Handle id="source-left" type="source" position={Position.Left} className="entity-handle" />
    </div>
  );
}
