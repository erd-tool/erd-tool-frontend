import { Handle, Position } from '@xyflow/react';
import { useAppStore } from '../../state/app-store';
import type { EntityDefinition } from '../../lib/types';

interface EntityNodeProps {
  data: { entity: EntityDefinition };
  selected?: boolean;
}

export function EntityNode({ data, selected }: EntityNodeProps) {
  const setSelectedEntityId = useAppStore((state) => state.setSelectedEntityId);
  const updateEntity = useAppStore((state) => state.updateEntity);

  return (
    <div className={`entity-node ${selected ? 'selected' : ''}`} onClick={() => setSelectedEntityId(data.entity.id)}>
      <Handle type="target" position={Position.Top} />
      <header className="entity-node-head">
        <input
          className="entity-title-input"
          value={data.entity.name}
          onChange={(event) => updateEntity(data.entity.id, { name: event.target.value })}
        />
      </header>
      <div className="entity-fields">
        {data.entity.fields.map((field) => (
          <div key={field.id} className={`entity-field ${field.primaryKey ? 'primary' : ''}`}>
            <span>{field.name}</span>
            <small>
              {field.type}
              {field.length ? `(${field.length})` : ''}
            </small>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

