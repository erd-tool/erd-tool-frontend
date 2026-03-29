import { useEffect, useRef, useState, type ComponentType, type MouseEvent as ReactMouseEvent } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  getViewportForBounds,
  type Edge,
  type Node,
  type ReactFlowInstance
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Check,
  Download,
  FileCode2,
  Link2,
  Maximize2,
  MessageSquarePlus,
  PencilLine,
  Plus,
  Redo2,
  Save,
  Settings2,
  Undo2,
  Users
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { AppButton, AppCard, AppInput, AppLabel, AppTextarea, StatusPill } from '../../components/ui';
import { fetchErd, saveErd } from '../../lib/api';
import { generateDdl } from '../../lib/ddl';
import { downloadText, formatDate, nowIso } from '../../lib/storage';
import { useYjsCollaboration } from '../../lib/yjs';
import { useAppStore } from '../../state/app-store';
import type { Cardinality, Dialect, ErdDocument, ErdVisibility, RelationshipDefinition } from '../../lib/types';
import { EntityNode } from './EntityNode';
import { RelationshipEdge } from './RelationshipEdge';

const nodeTypes = { entityNode: EntityNode as unknown as ComponentType<any> };
const edgeTypes = { relationshipEdge: RelationshipEdge as unknown as ComponentType<any> };

interface RelationshipDraft {
  active: boolean;
  sourceEntityId: string | null;
  targetEntityId: string | null;
  identifying: boolean;
  cardinality: Cardinality;
  required: boolean;
  popupPosition: { x: number; y: number } | null;
}

const INITIAL_RELATIONSHIP_DRAFT: RelationshipDraft = {
  active: false,
  sourceEntityId: null,
  targetEntityId: null,
  identifying: false,
  cardinality: '1:N',
  required: true,
  popupPosition: null
};

function CanvasSelectionCard({
  selectedEntity,
  selectedRelationship,
  selectedNote,
  updateEntity,
  removeEntity,
  addField,
  updateField,
  removeField,
  updateRelationship,
  removeRelationship,
  updateNote,
  removeNote
}: {
  selectedEntity: ErdDocument['entities'][number] | null;
  selectedRelationship: RelationshipDefinition | null;
  selectedNote: ErdDocument['notes'][number] | null;
  updateEntity: ReturnType<typeof useAppStore.getState>['updateEntity'];
  removeEntity: ReturnType<typeof useAppStore.getState>['removeEntity'];
  addField: ReturnType<typeof useAppStore.getState>['addField'];
  updateField: ReturnType<typeof useAppStore.getState>['updateField'];
  removeField: ReturnType<typeof useAppStore.getState>['removeField'];
  updateRelationship: ReturnType<typeof useAppStore.getState>['updateRelationship'];
  removeRelationship: ReturnType<typeof useAppStore.getState>['removeRelationship'];
  updateNote: ReturnType<typeof useAppStore.getState>['updateNote'];
  removeNote: ReturnType<typeof useAppStore.getState>['removeNote'];
}) {
  if (!selectedEntity && !selectedRelationship && !selectedNote) return null;

  return (
    <div className="canvas-inspector">
      {selectedEntity ? (
        <AppCard className="canvas-overlay-card">
          <div className="canvas-overlay-head">
            <div>
              <strong>엔티티 편집</strong>
              <p>{selectedEntity.name}</p>
            </div>
            <StatusPill tone="info">{selectedEntity.fields.length} fields</StatusPill>
          </div>
          <div className="stack">
            <AppInput value={selectedEntity.name} onChange={(event) => updateEntity(selectedEntity.id, { name: event.target.value })} />
            <AppTextarea value={selectedEntity.memo} onChange={(event) => updateEntity(selectedEntity.id, { memo: event.target.value })} />
            <div className="inline-actions">
              <AppButton variant="secondary" onClick={() => addField(selectedEntity.id)}>필드 추가</AppButton>
              <AppButton variant="ghost" onClick={() => removeEntity(selectedEntity.id)}>엔티티 삭제</AppButton>
            </div>
            <div className="field-editor-list compact">
              {selectedEntity.fields.map((field) => (
                <div key={field.id} className="field-editor compact">
                  <AppInput value={field.name} onChange={(event) => updateField(selectedEntity.id, field.id, { name: event.target.value })} />
                  <AppInput value={field.type} onChange={(event) => updateField(selectedEntity.id, field.id, { type: event.target.value })} />
                  <AppInput value={field.length ?? ''} onChange={(event) => updateField(selectedEntity.id, field.id, { length: event.target.value })} />
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={field.nullable}
                      onChange={(event) => updateField(selectedEntity.id, field.id, { nullable: event.target.checked })}
                    />
                    nullable
                  </label>
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={field.primaryKey}
                      onChange={(event) => updateField(selectedEntity.id, field.id, { primaryKey: event.target.checked })}
                    />
                    PK
                  </label>
                  <AppButton variant="ghost" onClick={() => removeField(selectedEntity.id, field.id)}>삭제</AppButton>
                </div>
              ))}
            </div>
          </div>
        </AppCard>
      ) : null}

      {selectedRelationship ? (
        <AppCard className="canvas-overlay-card">
          <div className="canvas-overlay-head">
            <div>
              <strong>관계 편집</strong>
              <p>{selectedRelationship.identifying ? '식별' : '비식별'} 관계</p>
            </div>
          </div>
          <div className="stack">
            <select
              className="app-input"
              value={selectedRelationship.identifying ? 'identifying' : 'non-identifying'}
              onChange={(event) => updateRelationship(selectedRelationship.id, { identifying: event.target.value === 'identifying' })}
            >
              <option value="identifying">식별</option>
              <option value="non-identifying">비식별</option>
            </select>
            <select
              className="app-input"
              value={selectedRelationship.cardinality}
              onChange={(event) =>
                updateRelationship(selectedRelationship.id, { cardinality: event.target.value as RelationshipDefinition['cardinality'] })
              }
            >
              <option value="1:1">1:1</option>
              <option value="1:N">1:N</option>
              <option value="N:1">N:1</option>
              <option value="N:M">N:M</option>
            </select>
            <select
              className="app-input"
              value={selectedRelationship.required ? 'required' : 'optional'}
              onChange={(event) => updateRelationship(selectedRelationship.id, { required: event.target.value === 'required' })}
            >
              <option value="required">필수</option>
              <option value="optional">선택</option>
            </select>
            <AppTextarea value={selectedRelationship.memo} onChange={(event) => updateRelationship(selectedRelationship.id, { memo: event.target.value })} />
            <AppButton variant="ghost" onClick={() => removeRelationship(selectedRelationship.id)}>관계 삭제</AppButton>
          </div>
        </AppCard>
      ) : null}

      {selectedNote ? (
        <AppCard className="canvas-overlay-card">
          <div className="canvas-overlay-head">
            <div>
              <strong>메모 편집</strong>
              <p>캔버스 메모</p>
            </div>
          </div>
          <div className="stack">
            <AppTextarea value={selectedNote.content} onChange={(event) => updateNote(selectedNote.id, { content: event.target.value })} />
            <AppButton variant="ghost" onClick={() => removeNote(selectedNote.id)}>메모 삭제</AppButton>
          </div>
        </AppCard>
      ) : null}
    </div>
  );
}

export function EditorPage() {
  const params = useParams();
  const erdId = params.erdId;
  const session = useAppStore((state) => state.session);
  const workspace = useAppStore((state) => (erdId ? state.documents[erdId] : undefined));
  const setActiveErd = useAppStore((state) => state.setActiveErd);
  const putDocument = useAppStore((state) => state.putDocument);
  const replaceDocument = useAppStore((state) => state.replaceDocument);
  const updateEntity = useAppStore((state) => state.updateEntity);
  const removeEntity = useAppStore((state) => state.removeEntity);
  const addEntity = useAppStore((state) => state.addEntity);
  const addField = useAppStore((state) => state.addField);
  const updateField = useAppStore((state) => state.updateField);
  const removeField = useAppStore((state) => state.removeField);
  const addRelationship = useAppStore((state) => state.addRelationship);
  const updateRelationship = useAppStore((state) => state.updateRelationship);
  const removeRelationship = useAppStore((state) => state.removeRelationship);
  const addNote = useAppStore((state) => state.addNote);
  const updateNote = useAppStore((state) => state.updateNote);
  const removeNote = useAppStore((state) => state.removeNote);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const setDocumentTitle = useAppStore((state) => state.setDocumentTitle);
  const setDocumentDescription = useAppStore((state) => state.setDocumentDescription);
  const setDocumentVisibility = useAppStore((state) => state.setDocumentVisibility);
  const selectedEntityId = useAppStore((state) => state.selectedEntityId);
  const selectedRelationshipId = useAppStore((state) => state.selectedRelationshipId);
  const selectedNoteId = useAppStore((state) => state.selectedNoteId);
  const setSelectedEntityId = useAppStore((state) => state.setSelectedEntityId);
  const setSelectedRelationshipId = useAppStore((state) => state.setSelectedRelationshipId);
  const setSelectedNoteId = useAppStore((state) => state.setSelectedNoteId);
  const collaboratorStatus = useAppStore((state) => state.collaboratorStatus);
  const setCollaborationState = useAppStore((state) => state.setCollaborationState);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<{ title: string; description: string; visibility: ErdVisibility }>({
    title: '',
    description: '',
    visibility: 'private'
  });
  const [sqlModalOpen, setSqlModalOpen] = useState(false);
  const [dialect, setDialect] = useState<Dialect>('mysql');
  const [localError, setLocalError] = useState('');
  const [relationshipDraft, setRelationshipDraft] = useState<RelationshipDraft>(INITIAL_RELATIONSHIP_DRAFT);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const lastAutoSaveSignature = useRef('');

  useEffect(() => {
    if (!erdId) return;
    setActiveErd(erdId);
  }, [erdId, setActiveErd]);

  useEffect(() => {
    if (!erdId || !session?.token || workspace?.document) return;
    let cancelled = false;
    void fetchErd(session.token, erdId).then((remote) => {
      if (cancelled || !remote) return;
      putDocument(remote);
    });
    return () => {
      cancelled = true;
    };
  }, [erdId, putDocument, session?.token, workspace?.document]);

  useEffect(() => {
    if (!workspace?.document || !session || !erdId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSaving(true);
      const next = { ...workspace.document, updatedAt: nowIso() } as ErdDocument;
      const signature = JSON.stringify(next);
      if (signature === lastAutoSaveSignature.current) {
        setSaving(false);
        return;
      }
      try {
        const remote = await saveErd(session.token, next);
        if (cancelled) return;
        setLastSavedAt(next.updatedAt);
        if (remote) {
          lastAutoSaveSignature.current = JSON.stringify(remote);
          replaceDocument(remote, { pushHistory: false });
        } else {
          lastAutoSaveSignature.current = signature;
          replaceDocument(next, { pushHistory: false });
        }
      } catch {
        if (cancelled) return;
        setLastSavedAt(next.updatedAt);
        lastAutoSaveSignature.current = signature;
        replaceDocument(next, { pushHistory: false });
      } finally {
        if (!cancelled) setSaving(false);
      }
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [erdId, replaceDocument, session, workspace?.document]);

  const collaboration = useYjsCollaboration(erdId, workspace?.document, session, (next) => {
    replaceDocument(next, { pushHistory: false });
  });

  useEffect(() => {
    setCollaborationState(collaboration.status, collaboration.peers);
  }, [collaboration.peers, collaboration.status, setCollaborationState]);

  useEffect(() => {
    if (!workspace?.document) return;
    if (!titleEditing) {
      setTitleDraft(workspace.document.title);
    }
    if (!settingsOpen) {
      setSettingsDraft({
        title: workspace.document.title,
        description: workspace.document.description,
        visibility: workspace.document.visibility
      });
    }
  }, [settingsOpen, titleEditing, workspace?.document]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      if (isTypingTarget) return;

      const key = event.key.toLowerCase();
      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        redo();
        return;
      }
      if (key === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (key === 'z') {
        event.preventDefault();
        undo();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [redo, undo]);

  if (!erdId || !workspace) {
    return (
      <AppCard>
        <h2>ERD를 찾을 수 없습니다.</h2>
        <p>대시보드에서 다시 열어주세요.</p>
      </AppCard>
    );
  }

  const document = workspace.document;
  const selectedEntity = document.entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const selectedRelationship = document.relationships.find((relationship) => relationship.id === selectedRelationshipId) ?? null;
  const selectedNote = document.notes.find((note) => note.id === selectedNoteId) ?? null;
  const sqlPreview = generateDdl(document, dialect);

  const nodes: Node[] = document.entities.map((entity) => ({
    id: entity.id,
    type: 'entityNode',
    position: entity.position,
    data: { entity },
    className:
      relationshipDraft.sourceEntityId === entity.id
        ? 'is-relationship-source'
        : relationshipDraft.targetEntityId === entity.id
          ? 'is-relationship-target'
          : ''
  }));

  const edges: Edge[] = document.relationships.map((relationship) => ({
    id: relationship.id,
    type: 'relationshipEdge',
    source: relationship.sourceEntityId,
    target: relationship.targetEntityId,
    selected: relationship.id === selectedRelationshipId,
    data: { relationship }
  }));

  function resetRelationshipDraft() {
    setRelationshipDraft(INITIAL_RELATIONSHIP_DRAFT);
    setLocalError('');
  }

  function openSettingsModal() {
    setSettingsDraft({
      title: document.title,
      description: document.description,
      visibility: document.visibility
    });
    setSettingsOpen(true);
  }

  function saveInlineTitle() {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== document.title) {
      setDocumentTitle(trimmed);
    } else {
      setTitleDraft(document.title);
    }
    setTitleEditing(false);
  }

  function saveSettings() {
    const nextTitle = settingsDraft.title.trim() || document.title;
    if (nextTitle !== document.title) setDocumentTitle(nextTitle);
    if (settingsDraft.description !== document.description) setDocumentDescription(settingsDraft.description);
    if (settingsDraft.visibility !== document.visibility) setDocumentVisibility(settingsDraft.visibility);
    setSettingsOpen(false);
  }

  function handleStartRelationshipMode() {
    setSelectedEntityId(null);
    setSelectedRelationshipId(null);
    setSelectedNoteId(null);
    setRelationshipDraft((current) => (current.active ? INITIAL_RELATIONSHIP_DRAFT : { ...INITIAL_RELATIONSHIP_DRAFT, active: true }));
    setLocalError('');
  }

  function resolvePopupPosition(event?: MouseEvent | ReactMouseEvent) {
    if (!event || !canvasRef.current) return { x: 240, y: 180 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.max(32, Math.min(event.clientX - rect.left, rect.width - 320)),
      y: Math.max(32, Math.min(event.clientY - rect.top, rect.height - 260))
    };
  }

  function handleNodeSelection(nodeId: string, event?: MouseEvent | ReactMouseEvent) {
    if (!relationshipDraft.active) {
      setSelectedEntityId(nodeId);
      return;
    }

    if (!relationshipDraft.sourceEntityId) {
      setRelationshipDraft((current) => ({ ...current, sourceEntityId: nodeId }));
      setLocalError('');
      return;
    }

    if (relationshipDraft.sourceEntityId === nodeId) {
      setLocalError('부모 엔티티와 자식 엔티티는 서로 달라야 합니다.');
      return;
    }

    if (!relationshipDraft.targetEntityId) {
      setRelationshipDraft((current) => ({
        ...current,
        targetEntityId: nodeId,
        popupPosition: resolvePopupPosition(event)
      }));
      setLocalError('');
      return;
    }

    setSelectedEntityId(nodeId);
  }

  function handleConfirmRelationship() {
    if (!relationshipDraft.sourceEntityId || !relationshipDraft.targetEntityId) {
      setLocalError('부모 엔티티와 자식 엔티티를 먼저 선택하세요.');
      return;
    }

    const relationshipId = addRelationship({
      sourceEntityId: relationshipDraft.sourceEntityId,
      targetEntityId: relationshipDraft.targetEntityId,
      identifying: relationshipDraft.identifying,
      cardinality: relationshipDraft.cardinality,
      required: relationshipDraft.required
    });
    if (!relationshipId) {
      setLocalError('관계를 생성하지 못했습니다. 엔티티가 2개 이상인지 확인하세요.');
      return;
    }
    setSelectedRelationshipId(relationshipId);
    resetRelationshipDraft();
  }

  async function handleExportPng() {
    const viewport = window.document.querySelector('.react-flow__viewport') as HTMLElement | null;
    if (!viewport || !document.entities.length) return;
    const exportNodes = document.entities.map((entity) => ({
      id: entity.id,
      position: entity.position,
      width: 300,
      height: entity.memo ? 220 : 180,
      data: {}
    }));
    const bounds = getNodesBounds(exportNodes);
    const imageWidth = Math.max(1600, Math.round(bounds.width + 320));
    const imageHeight = Math.max(900, Math.round(bounds.height + 320));
    const nextViewport = getViewportForBounds(bounds, imageWidth, imageHeight, 0.2, 1.5, 0.14);
    const dataUrl = await toPng(viewport, {
      cacheBust: true,
      backgroundColor: '#f7f9fc',
      width: imageWidth,
      height: imageHeight,
      style: {
        width: `${imageWidth}px`,
        height: `${imageHeight}px`,
        transform: `translate(${nextViewport.x}px, ${nextViewport.y}px) scale(${nextViewport.zoom})`
      }
    });
    const link = window.document.createElement('a');
    link.href = dataUrl;
    link.download = `${document.title || 'erd'}.png`;
    link.click();
  }

  return (
    <div className="editor-screen">
      <header className="editor-header">
        <div className="editor-header-left">
          <div className="editor-title-stack">
            <div className="editor-title-row">
              {titleEditing ? (
                <input
                  className="editor-title-input-inline"
                  autoFocus
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={saveInlineTitle}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') saveInlineTitle();
                    if (event.key === 'Escape') {
                      setTitleDraft(document.title);
                      setTitleEditing(false);
                    }
                  }}
                />
              ) : (
                <button className="editor-title-button" onClick={() => setTitleEditing(true)}>
                  <span>{document.title}</span>
                  <PencilLine size={14} />
                </button>
              )}
              <AppButton variant="secondary" className="compact-button" onClick={openSettingsModal}>
                <Settings2 size={14} /> ERD 설정
              </AppButton>
            </div>
            <div className="editor-inline-actions">
              <AppButton variant="ghost" className="compact-button" onClick={undo}>
                <Undo2 size={14} /> 실행취소
              </AppButton>
              <AppButton variant="ghost" className="compact-button" onClick={redo}>
                <Redo2 size={14} /> 복구
              </AppButton>
              {relationshipDraft.active ? <StatusPill tone="warning">관계 설정 모드</StatusPill> : null}
              <StatusPill tone="info">{document.visibility === 'public' ? '공개 ERD' : '비공개 ERD'}</StatusPill>
            </div>
          </div>
        </div>

        <div className="editor-header-right">
          <div className="editor-header-metrics">
            <div className="presence-chip">
              <Users size={14} />
              <span>{collaboration.peers}명 접속</span>
              <div className="presence-tooltip">
                <strong>현재 접속 인원</strong>
                {collaboration.peerNames.map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </div>
            </div>
            <StatusPill tone={saving ? 'warning' : 'success'}>
              {saving ? '저장 중' : lastSavedAt ? `저장 ${formatDate(lastSavedAt)}` : '자동 저장'}
            </StatusPill>
            <StatusPill tone={collaboration.isConnected ? 'success' : 'warning'}>{collaboratorStatus}</StatusPill>
          </div>
          <div className="editor-header-exports">
            <AppButton variant="secondary" className="compact-button" onClick={handleExportPng}>
              <Download size={14} /> PNG
            </AppButton>
            <AppButton variant="secondary" className="compact-button" onClick={() => setSqlModalOpen(true)}>
              <FileCode2 size={14} /> SQL
            </AppButton>
          </div>
        </div>
      </header>

      <div className="editor-layout-shell">
        <aside className="editor-left-sidebar">
          <AppCard className="editor-sidebar-card compact">
            <div className="sidebar-action-stack">
              <AppButton className="sidebar-action-button" onClick={addEntity}>
                <Plus size={16} /> 엔티티 생성
              </AppButton>
              <AppButton variant="secondary" className="sidebar-action-button" onClick={addNote}>
                <MessageSquarePlus size={16} /> 메모 생성
              </AppButton>
              <AppButton variant="secondary" className="sidebar-action-button" onClick={handleStartRelationshipMode}>
                <Link2 size={16} /> {relationshipDraft.active ? '관계 설정 종료' : '관계 설정'}
              </AppButton>
            </div>

            <div className="sidebar-guide">
              <strong>관계 설정 안내</strong>
              <p>부모 엔티티를 클릭한 뒤 자식 엔티티를 클릭하면 옵션 팝업이 열립니다.</p>
            </div>
          </AppCard>
        </aside>

        <section className="editor-canvas-region" ref={canvasRef}>
          <ReactFlowProvider>
            <div className="editor-canvas-frame">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                onInit={setFlowInstance}
                onNodesChange={(changes) => {
                  changes.forEach((change) => {
                    if (change.type === 'position' && change.position && change.id) {
                      useAppStore.getState().moveEntity(change.id, change.position);
                    }
                    if (change.type === 'remove' && change.id) {
                      removeEntity(change.id);
                    }
                  });
                }}
                onEdgesChange={(changes) => {
                  changes.forEach((change) => {
                    if (change.type === 'remove' && change.id) {
                      removeRelationship(change.id);
                    }
                  });
                }}
                onNodeClick={(event, node) => handleNodeSelection(node.id, event)}
                onEdgeClick={(_, edge) => setSelectedRelationshipId(edge.id)}
                onPaneClick={() => {
                  if (!relationshipDraft.active) {
                    setSelectedEntityId(null);
                    setSelectedRelationshipId(null);
                    setSelectedNoteId(null);
                  }
                }}
              >
                <Background gap={24} size={1} color="#dce4ee" />
                <Panel position="bottom-right">
                  <div className="canvas-dock">
                    <MiniMap pannable zoomable />
                    <div className="canvas-dock-actions">
                      <AppButton variant="secondary" className="compact-button" onClick={() => flowInstance?.fitView({ padding: 0.18 })}>
                        <Maximize2 size={14} /> 맞춤
                      </AppButton>
                      <Controls position="bottom-right" showInteractive={false} />
                    </div>
                  </div>
                </Panel>
              </ReactFlow>

              {localError ? <div className="canvas-toast error">{localError}</div> : null}

              {relationshipDraft.popupPosition ? (
                <div
                  className="relationship-popup"
                  style={{
                    left: relationshipDraft.popupPosition.x,
                    top: relationshipDraft.popupPosition.y
                  }}
                >
                  <div className="relationship-popup-head">
                    <strong>관계 옵션</strong>
                    <span>부모 {document.entities.find((entity) => entity.id === relationshipDraft.sourceEntityId)?.name ?? '-'}</span>
                    <span>자식 {document.entities.find((entity) => entity.id === relationshipDraft.targetEntityId)?.name ?? '-'}</span>
                  </div>
                  <div className="stack">
                    <div className="field-grid compact-grid">
                      <div>
                        <AppLabel>식별 여부</AppLabel>
                        <select
                          className="app-input"
                          value={relationshipDraft.identifying ? 'identifying' : 'non-identifying'}
                          onChange={(event) =>
                            setRelationshipDraft((current) => ({
                              ...current,
                              identifying: event.target.value === 'identifying'
                            }))
                          }
                        >
                          <option value="identifying">식별</option>
                          <option value="non-identifying">비식별</option>
                        </select>
                      </div>
                      <div>
                        <AppLabel>카디널리티</AppLabel>
                        <select
                          className="app-input"
                          value={relationshipDraft.cardinality}
                          onChange={(event) =>
                            setRelationshipDraft((current) => ({
                              ...current,
                              cardinality: event.target.value as Cardinality
                            }))
                          }
                        >
                          <option value="1:1">1:1</option>
                          <option value="1:N">1:N</option>
                          <option value="N:1">N:1</option>
                          <option value="N:M">N:M</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <AppLabel>자식 참여성</AppLabel>
                      <select
                        className="app-input"
                        value={relationshipDraft.required ? 'required' : 'optional'}
                        onChange={(event) =>
                          setRelationshipDraft((current) => ({
                            ...current,
                            required: event.target.value === 'required'
                          }))
                        }
                      >
                        <option value="required">필수</option>
                        <option value="optional">선택</option>
                      </select>
                    </div>
                    <div className="modal-actions">
                      <AppButton variant="ghost" onClick={resetRelationshipDraft}>취소</AppButton>
                      <AppButton onClick={handleConfirmRelationship}>
                        <Check size={14} /> 완료
                      </AppButton>
                    </div>
                  </div>
                </div>
              ) : null}

              <CanvasSelectionCard
                selectedEntity={selectedEntity}
                selectedRelationship={selectedRelationship}
                selectedNote={selectedNote}
                updateEntity={updateEntity}
                removeEntity={removeEntity}
                addField={addField}
                updateField={updateField}
                removeField={removeField}
                updateRelationship={updateRelationship}
                removeRelationship={removeRelationship}
                updateNote={updateNote}
                removeNote={removeNote}
              />
            </div>
          </ReactFlowProvider>
        </section>
      </div>

      {settingsOpen ? (
        <div className="editor-modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="editor-modal-head">
              <div>
                <strong>ERD 설정</strong>
                <p>문서 메타데이터와 공개 여부를 변경합니다.</p>
              </div>
            </div>
            <div className="stack">
              <div>
                <AppLabel>ERD 제목</AppLabel>
                <AppInput value={settingsDraft.title} onChange={(event) => setSettingsDraft((current) => ({ ...current, title: event.target.value }))} />
              </div>
              <div>
                <AppLabel>설명</AppLabel>
                <AppTextarea value={settingsDraft.description} onChange={(event) => setSettingsDraft((current) => ({ ...current, description: event.target.value }))} />
              </div>
              <div>
                <AppLabel>공개 여부</AppLabel>
                <select
                  className="app-input"
                  value={settingsDraft.visibility}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, visibility: event.target.value as ErdVisibility }))}
                >
                  <option value="private">비공개</option>
                  <option value="public">공개</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <AppButton variant="ghost" onClick={() => setSettingsOpen(false)}>취소</AppButton>
              <AppButton onClick={saveSettings}>
                <Save size={14} /> 저장
              </AppButton>
            </div>
          </div>
        </div>
      ) : null}

      {sqlModalOpen ? (
        <div className="editor-modal-backdrop" onClick={() => setSqlModalOpen(false)}>
          <div className="editor-modal sql-modal" onClick={(event) => event.stopPropagation()}>
            <div className="editor-modal-head">
              <div>
                <strong>SQL 내보내기</strong>
                <p>CREATE TABLE 후 ALTER CONSTRAINT 순서로 DDL을 생성합니다.</p>
              </div>
            </div>
            <div className="inline-actions">
              <select className="app-input sql-dialect-select" value={dialect} onChange={(event) => setDialect(event.target.value as Dialect)}>
                <option value="mysql">MySQL</option>
                <option value="mariadb">MariaDB</option>
                <option value="oracle">Oracle</option>
                <option value="postgresql">PostgreSQL</option>
              </select>
            </div>
            <pre className="sql-preview light-sql-preview tall">{sqlPreview}</pre>
            <div className="modal-actions">
              <AppButton variant="ghost" onClick={() => setSqlModalOpen(false)}>닫기</AppButton>
              <AppButton onClick={() => downloadText(`${document.title || 'erd'}-${dialect}.sql`, sqlPreview)}>
                <Download size={14} /> 다운로드
              </AppButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
