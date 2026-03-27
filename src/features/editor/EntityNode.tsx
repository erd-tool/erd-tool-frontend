import { Handle, Position, type NodeProps } from '@xyflow/react';
import { KeyRound } from 'lucide-react';
import { useAppStore } from '../../state/app-store';
import type { EntityDefinition } from '../../lib/types';

interface NodeData {
  entity: EntityDefinition;
}

export function EntityNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as NodeData;
  const setSelectedEntityId = useAppStore((state) => state.setSelectedEntityId);
  const updateEntity = useAppStore((state) => state.updateEntity);

  return (
    <div className={`entity-node ${selected ? 'selected' : ''}`} onClick={() => setSelectedEntityId(nodeData.entity.id)}>
      <Handle type="target" position={Position.Top} />
      <header className="entity-node-head">
        <input
          className="entity-title-input"
          value={nodeData.entity.name}
          onChange={(event) => updateEntity(nodeData.entity.id, { name: event.target.value })}
        />
        <span className="entity-node-count">{nodeData.entity.fields.length} fields</span>
      </header>

      <div className="entity-fields">
        {nodeData.entity.fields.map((field) => (
          <div key={field.id} className={`entity-field ${field.primaryKey ? 'primary' : ''}`}>
            <div className="entity-field-name">
              {field.primaryKey && <KeyRound size={12} />}
              <span>{field.name}</span>
            </div>
            <small>
              {field.type}
              {field.length ? `(${field.length})` : ''}
            </small>
          </div>
        ))}
      </div>

      {nodeData.entity.memo && <p className="entity-node-memo">{nodeData.entity.memo}</p>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
