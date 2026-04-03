import type { NodeProps } from '@xyflow/react';
import { StickyNote } from 'lucide-react';
import { useAppStore } from '../../state/app-store';

interface NoteData {
  note: {
    id: string;
    content: string;
  };
}

export function NoteNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as NoteData;
  const setSelectedNoteId = useAppStore((state) => state.setSelectedNoteId);

  return (
    <button
      type="button"
      className={`note-node ${selected ? 'selected' : ''}`}
      onClick={() => setSelectedNoteId(nodeData.note.id)}
    >
      <div className="note-node-head">
        <StickyNote size={14} />
        <strong>메모</strong>
      </div>
      <p>{nodeData.note.content || '새 메모'}</p>
    </button>
  );
}
