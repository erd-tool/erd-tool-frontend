import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useParams } from 'react-router-dom';
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Link2, MousePointerClick, Redo2, Save, Undo2 } from 'lucide-react';
import { AppButton, AppCard, AppInput, AppLabel, AppTextarea, StatusPill } from '../../components/ui';
import { exportSql, fetchErd, saveErd } from '../../lib/api';
import { downloadText, formatDate, nowIso } from '../../lib/storage';
import { generateDdl } from '../../lib/ddl';
import { useYjsCollaboration } from '../../lib/yjs';
import { useAppStore } from '../../state/app-store';
import { EntityNode } from './EntityNode';
import { toPng } from 'html-to-image';
import type { Cardinality, Dialect, ErdDocument, RelationshipDefinition } from '../../lib/types';

const nodeTypes = { entityNode: EntityNode as unknown as ComponentType<any> };

interface RelationshipDraft {
  active: boolean;
  sourceEntityId: string | null;
  targetEntityId: string | null;
  identifying: boolean;
  typeConfirmed: boolean;
  cardinality: Cardinality;
  cardinalityConfirmed: boolean;
  required: boolean;
  requiredConfirmed: boolean;
}

const INITIAL_RELATIONSHIP_DRAFT: RelationshipDraft = {
  active: false,
  sourceEntityId: null,
  targetEntityId: null,
  identifying: false,
  typeConfirmed: false,
  cardinality: '1:N',
  cardinalityConfirmed: false,
  required: true,
  requiredConfirmed: false
};

export function EditorPage() {
  const params = useParams();
  const erdId = params.erdId;
  const session = useAppStore((state) => state.session);
  const erds = useAppStore((state) => state.erds);
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
  const selectedEntityId = useAppStore((state) => state.selectedEntityId);
  const selectedRelationshipId = useAppStore((state) => state.selectedRelationshipId);
  const selectedNoteId = useAppStore((state) => state.selectedNoteId);
  const setSelectedEntityId = useAppStore((state) => state.setSelectedEntityId);
  const setSelectedRelationshipId = useAppStore((state) => state.setSelectedRelationshipId);
  const setSelectedNoteId = useAppStore((state) => state.setSelectedNoteId);
  const setCollaborationState = useAppStore((state) => state.setCollaborationState);
  const collaboratorStatus = useAppStore((state) => state.collaboratorStatus);
  const collaboratorPeers = useAppStore((state) => state.collaboratorPeers);
  const [dialect, setDialect] = useState<Dialect>('mysql');
  const [sqlPreview, setSqlPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [localError, setLocalError] = useState('');
  const [relationshipDraft, setRelationshipDraft] = useState<RelationshipDraft>(INITIAL_RELATIONSHIP_DRAFT);
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
      const next = {
        ...workspace.document,
        updatedAt: nowIso()
      } as ErdDocument;
      const signature = JSON.stringify(next);
      if (signature === lastAutoSaveSignature.current) {
        setSaving(false);
        return;
      }
      try {
        const remote = await saveErd(session.token, next);
        if (!cancelled) {
          setLastSavedAt(next.updatedAt);
          if (remote) {
            lastAutoSaveSignature.current = JSON.stringify(remote);
            replaceDocument(remote, { pushHistory: false });
          } else {
            lastAutoSaveSignature.current = signature;
            replaceDocument(next, { pushHistory: false });
          }
        }
      } catch {
        if (!cancelled) {
          setLastSavedAt(next.updatedAt);
          lastAutoSaveSignature.current = signature;
          replaceDocument(next, { pushHistory: false });
        }
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
    setSqlPreview(generateDdl(workspace.document, dialect));
  }, [dialect, workspace?.document]);

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
  const selectedEntity = document.entities.find((entity) => entity.id === selectedEntityId) ?? document.entities[0] ?? null;
  const selectedRelationship = document.relationships.find((relationship) => relationship.id === selectedRelationshipId) ?? null;
  const selectedNote = document.notes.find((note) => note.id === selectedNoteId) ?? null;
  const relationshipSource = document.entities.find((entity) => entity.id === relationshipDraft.sourceEntityId) ?? null;
  const relationshipTarget = document.entities.find((entity) => entity.id === relationshipDraft.targetEntityId) ?? null;

  const nodes: Node[] = document.entities.map((entity) => ({
    id: entity.id,
    type: 'entityNode',
    position: entity.position,
    data: { entity },
    className: relationshipDraft.sourceEntityId === entity.id ? 'is-relationship-source' : relationshipDraft.targetEntityId === entity.id ? 'is-relationship-target' : ''
  }));

  const edges: Edge[] = document.relationships.map((relationship) => ({
    id: relationship.id,
    source: relationship.sourceEntityId,
    target: relationship.targetEntityId,
    label: `${relationship.identifying ? '식별' : '비식별'} · ${relationship.cardinality} · ${relationship.required ? '필수' : '선택'}`,
    animated: relationship.id === selectedRelationshipId,
    style: {
      strokeWidth: relationship.identifying ? 2.8 : 2.1,
      stroke: relationship.id === selectedRelationshipId ? '#f59e0b' : relationship.identifying ? '#2563eb' : '#94a3b8',
      strokeDasharray: relationship.identifying ? undefined : '7 5'
    },
    labelStyle: {
      fill: '#334155',
      fontSize: 12,
      fontWeight: 700
    }
  }));

  const canvasHint = (() => {
    if (!relationshipDraft.active) {
      return '엔티티를 자유롭게 배치하면서 구조를 잡으세요.';
    }
    if (!relationshipDraft.sourceEntityId) {
      return '1단계: 시작 엔티티를 클릭하세요.';
    }
    if (!relationshipDraft.targetEntityId) {
      return '2단계: 연결할 대상 엔티티를 클릭하세요.';
    }
    return '3단계: 우측 패널에서 식별/카디널리티/필수 여부를 정하고 관계를 확정하세요.';
  })();

  function resetRelationshipDraft() {
    setRelationshipDraft(INITIAL_RELATIONSHIP_DRAFT);
    setLocalError('');
  }

  function handleStartRelationshipMode() {
    setSelectedEntityId(null);
    setSelectedRelationshipId(null);
    setSelectedNoteId(null);
    setRelationshipDraft((current) => (current.active ? INITIAL_RELATIONSHIP_DRAFT : { ...INITIAL_RELATIONSHIP_DRAFT, active: true }));
    setLocalError('');
  }

  function handleNodeSelection(nodeId: string) {
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
      setLocalError('서로 다른 두 엔티티를 선택해야 합니다.');
      return;
    }

    if (!relationshipDraft.targetEntityId) {
      setRelationshipDraft((current) => ({
        ...current,
        targetEntityId: nodeId,
        typeConfirmed: false,
        cardinalityConfirmed: false,
        requiredConfirmed: false
      }));
      setLocalError('');
      return;
    }

    setSelectedEntityId(nodeId);
  }

  function handleConfirmRelationship() {
    if (!relationshipDraft.sourceEntityId || !relationshipDraft.targetEntityId) {
      setLocalError('관계를 확정하려면 두 엔티티를 모두 선택해야 합니다.');
      return;
    }
    if (!relationshipDraft.typeConfirmed || !relationshipDraft.cardinalityConfirmed || !relationshipDraft.requiredConfirmed) {
      setLocalError('식별 여부, 카디널리티, 필수/선택 단계를 순서대로 완료하세요.');
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
    const container = window.document.querySelector('.react-flow') as HTMLElement | null;
    if (!container) return;
    const dataUrl = await toPng(container, { cacheBust: true, pixelRatio: 2, backgroundColor: '#f8fafc' });
    const link = window.document.createElement('a');
    link.href = dataUrl;
    link.download = `${document.title || 'erd'}.png`;
    link.click();
  }

  async function handleExportSql() {
    const sql = await exportSql(session?.token, document, dialect);
    downloadText(`${document.title || 'erd'}-${dialect}.sql`, sql);
  }

  async function handlePreviewSql() {
    setSqlPreview(await exportSql(session?.token, document, dialect));
  }

  return (
    <div className="editor-workbench reveal">
      <section className="editor-workbench-topbar">
        <div className="editor-title-group">
          <div>
            <h2>{document.title}</h2>
            <p>{erds.find((item) => item.id === erdId)?.teamName ?? '개인 워크스페이스'} · {formatDate(document.updatedAt)}</p>
          </div>
          <div className="editor-status-row">
            <StatusPill tone={collaboration.isConnected ? 'success' : 'warning'}>{collaboratorStatus}</StatusPill>
            <StatusPill tone="info">{collaboratorPeers}명 접속</StatusPill>
            <StatusPill tone={saving ? 'warning' : 'neutral'}>{saving ? '저장 중' : lastSavedAt ? `저장 ${formatDate(lastSavedAt)}` : '자동 저장'}</StatusPill>
          </div>
        </div>

        <div className="editor-quick-actions">
          <AppButton variant="ghost" onClick={undo}>
            <Undo2 size={16} /> 실행취소
          </AppButton>
          <AppButton variant="ghost" onClick={redo}>
            <Redo2 size={16} /> 복구
          </AppButton>
          <AppButton variant="secondary" onClick={handleStartRelationshipMode}>
            <Link2 size={16} /> {relationshipDraft.active ? '관계 모드 종료' : '관계 설정 모드'}
          </AppButton>
          <AppButton variant="secondary" onClick={handleExportPng}>PNG</AppButton>
          <AppButton variant="secondary" onClick={handleExportSql}>SQL</AppButton>
        </div>
      </section>

      <div className="editor-workbench-body">
        <aside className="editor-panel editor-panel-left">
          <AppCard className="sidebar-card soft-card">
            <div className="section-head compact">
              <div>
                <h3>캔버스 도구</h3>
                <p>구조를 빠르게 배치하고 연결하세요.</p>
              </div>
            </div>
            <div className="stack">
              <AppButton onClick={addEntity}>엔티티 추가</AppButton>
              <AppButton variant="secondary" onClick={handleStartRelationshipMode}>
                <MousePointerClick size={16} /> 두 엔티티 클릭으로 관계 생성
              </AppButton>
              <AppButton variant="secondary" onClick={addNote}>메모 추가</AppButton>
              <p className="helper-text">단축키: Ctrl/Cmd + Z 실행취소, Ctrl/Cmd + Shift + Z 또는 Ctrl/Cmd + Y 복구</p>
            </div>
          </AppCard>

          <AppCard className="sidebar-card soft-card">
            <div className="section-head compact">
              <div>
                <h3>구조 목록</h3>
                <p>선택 후 우측에서 상세 수정</p>
              </div>
            </div>
            <div className="entity-list">
              {document.entities.map((entity) => (
                <button
                  key={entity.id}
                  className={`entity-list-item ${
                    selectedEntityId === entity.id ||
                    relationshipDraft.sourceEntityId === entity.id ||
                    relationshipDraft.targetEntityId === entity.id
                      ? 'active'
                      : ''
                  }`}
                  onClick={() => handleNodeSelection(entity.id)}
                >
                  <strong>{entity.name}</strong>
                  <span>{entity.fields.length} fields</span>
                </button>
              ))}
            </div>
            <div className="note-list">
              {document.notes.map((note) => (
                <button
                  key={note.id}
                  className={`note-list-item ${selectedNoteId === note.id ? 'active' : ''}`}
                  onClick={() => setSelectedNoteId(note.id)}
                >
                  {note.content.slice(0, 48) || '새 메모'}
                </button>
              ))}
            </div>
          </AppCard>
        </aside>

        <section className="editor-canvas-shell">
          <div className={`editor-canvas-toolbar ${relationshipDraft.active ? 'is-relationship-active' : ''}`}>
            <div>
              <strong>Canvas</strong>
              <p>{canvasHint}</p>
            </div>
            {relationshipDraft.active && (
              <div className="relationship-progress">
                <span className={relationshipDraft.sourceEntityId ? 'done' : ''}>시작 엔티티</span>
                <span className={relationshipDraft.targetEntityId ? 'done' : ''}>대상 엔티티</span>
                <span className={relationshipDraft.typeConfirmed ? 'done' : ''}>식별/비식별</span>
                <span className={relationshipDraft.cardinalityConfirmed ? 'done' : ''}>카디널리티</span>
                <span className={relationshipDraft.requiredConfirmed ? 'done' : ''}>필수/선택</span>
              </div>
            )}
          </div>

          <div className="editor-canvas light-canvas">
            <ReactFlowProvider>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
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
                onNodeClick={(_, node) => handleNodeSelection(node.id)}
                onEdgeClick={(_, edge) => setSelectedRelationshipId(edge.id)}
                onPaneClick={() => {
                  if (!relationshipDraft.active) {
                    setSelectedEntityId(null);
                    setSelectedRelationshipId(null);
                    setSelectedNoteId(null);
                  }
                }}
              >
                <Background gap={24} size={1} color="#d7e0ea" />
                <MiniMap zoomable pannable />
                <Controls />
              </ReactFlow>
            </ReactFlowProvider>
          </div>
        </section>

        <aside className="editor-panel editor-panel-right">
          <AppCard className="sidebar-card inspector-card">
            <div className="section-head compact">
              <div>
                <h3>문서 설정</h3>
                <p>제목과 문서 설명</p>
              </div>
            </div>
            <div className="stack">
              <div>
                <AppLabel>ERD 제목</AppLabel>
                <AppInput value={document.title} onChange={(event) => setDocumentTitle(event.target.value)} />
              </div>
              <div>
                <AppLabel>설명</AppLabel>
                <AppTextarea value={document.description} onChange={(event) => setDocumentDescription(event.target.value)} />
              </div>
            </div>
          </AppCard>

          <AppCard className="sidebar-card inspector-card">
            <div className="section-head compact">
              <div>
                <h3>관계 생성기</h3>
                <p>두 엔티티를 고른 뒤 옵션을 확정</p>
              </div>
            </div>

            <div className="relationship-builder">
              <div className="relationship-builder-row">
                <span>시작</span>
                <strong>{relationshipSource?.name ?? '미선택'}</strong>
              </div>
              <div className="relationship-builder-row">
                <span>대상</span>
                <strong>{relationshipTarget?.name ?? '미선택'}</strong>
              </div>

              <div className="field-grid">
                <div>
                  <AppLabel>1. 관계 유형</AppLabel>
                  <div className="relationship-choice-grid">
                    <button
                      type="button"
                      className={`relationship-choice ${relationshipDraft.identifying ? 'active' : ''}`}
                      disabled={!relationshipDraft.targetEntityId}
                      onClick={() =>
                        setRelationshipDraft((current) => ({
                          ...current,
                          identifying: true,
                          typeConfirmed: true,
                          cardinalityConfirmed: false,
                          requiredConfirmed: false
                        }))
                      }
                    >
                      식별
                    </button>
                    <button
                      type="button"
                      className={`relationship-choice ${!relationshipDraft.identifying ? 'active' : ''}`}
                      disabled={!relationshipDraft.targetEntityId}
                      onClick={() =>
                        setRelationshipDraft((current) => ({
                          ...current,
                          identifying: false,
                          typeConfirmed: true,
                          cardinalityConfirmed: false,
                          requiredConfirmed: false
                        }))
                      }
                    >
                      비식별
                    </button>
                  </div>
                </div>
                <div>
                  <AppLabel>2. 카디널리티</AppLabel>
                  <select
                    className="app-input"
                    disabled={!relationshipDraft.typeConfirmed}
                    value={relationshipDraft.cardinality}
                    onChange={(event) =>
                      setRelationshipDraft((current) => ({
                        ...current,
                        cardinality: event.target.value as Cardinality,
                        cardinalityConfirmed: true,
                        requiredConfirmed: false
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
                <AppLabel>3. 참여성</AppLabel>
                <select
                  className="app-input"
                  disabled={!relationshipDraft.cardinalityConfirmed}
                  value={relationshipDraft.required ? 'required' : 'optional'}
                  onChange={(event) =>
                    setRelationshipDraft((current) => ({
                      ...current,
                      required: event.target.value === 'required',
                      requiredConfirmed: true
                    }))
                  }
                >
                  <option value="required">필수</option>
                  <option value="optional">선택</option>
                </select>
              </div>

              <p className="helper-text">
                순서: 관계 설정 모드 시작 {'->'} 시작 엔티티 클릭 {'->'} 대상 엔티티 클릭 {'->'} 식별/비식별 {'->'} 카디널리티 {'->'} 필수/선택
              </p>

              {localError && <p className="error-text">{localError}</p>}

              <div className="inline-actions">
                <AppButton
                  onClick={handleConfirmRelationship}
                  disabled={!relationshipDraft.requiredConfirmed}
                >
                  관계 확정
                </AppButton>
                <AppButton variant="ghost" onClick={resetRelationshipDraft}>초기화</AppButton>
              </div>
            </div>
          </AppCard>

          <AppCard className="sidebar-card inspector-card">
            <div className="section-head compact">
              <div>
                <h3>선택 편집기</h3>
                <p>엔티티, 관계, 메모 상세 수정</p>
              </div>
            </div>
            {selectedEntity ? (
              <div className="stack">
                <AppInput value={selectedEntity.name} onChange={(event) => updateEntity(selectedEntity.id, { name: event.target.value })} />
                <AppTextarea value={selectedEntity.memo} onChange={(event) => updateEntity(selectedEntity.id, { memo: event.target.value })} />
                <div className="inline-actions">
                  <AppButton variant="secondary" onClick={() => addField(selectedEntity.id)}>필드 추가</AppButton>
                  <AppButton variant="ghost" onClick={() => removeEntity(selectedEntity.id)}>엔티티 삭제</AppButton>
                </div>
                <div className="field-editor-list">
                  {selectedEntity.fields.map((field) => (
                    <div key={field.id} className="field-editor">
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
            ) : selectedRelationship ? (
              <div className="stack">
                <select
                  className="app-input"
                  value={selectedRelationship.identifying ? 'identifying' : 'non-identifying'}
                  onChange={(event) =>
                    updateRelationship(selectedRelationship.id, {
                      identifying: event.target.value === 'identifying'
                    })
                  }
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
                  onChange={(event) =>
                    updateRelationship(selectedRelationship.id, { required: event.target.value === 'required' })
                  }
                >
                  <option value="required">필수</option>
                  <option value="optional">선택</option>
                </select>
                <AppTextarea value={selectedRelationship.memo} onChange={(event) => updateRelationship(selectedRelationship.id, { memo: event.target.value })} />
                <AppButton variant="ghost" onClick={() => removeRelationship(selectedRelationship.id)}>관계 삭제</AppButton>
              </div>
            ) : selectedNote ? (
              <div className="stack">
                <AppTextarea value={selectedNote.content} onChange={(event) => updateNote(selectedNote.id, { content: event.target.value })} />
                <AppButton variant="ghost" onClick={() => removeNote(selectedNote.id)}>메모 삭제</AppButton>
              </div>
            ) : (
              <p className="helper-text">좌측 목록 또는 캔버스에서 엔티티/관계/메모를 선택하세요.</p>
            )}
          </AppCard>

          <AppCard className="sidebar-card inspector-card">
            <div className="section-head compact">
              <div>
                <h3>DDL 미리보기</h3>
                <p>현재 구조 기준 export</p>
              </div>
            </div>
            <div className="inline-actions">
              <select className="app-input" value={dialect} onChange={(event) => setDialect(event.target.value as Dialect)}>
                <option value="mysql">MySQL</option>
                <option value="mariadb">MariaDB</option>
                <option value="oracle">Oracle</option>
                <option value="postgresql">PostgreSQL</option>
              </select>
              <AppButton variant="secondary" onClick={handlePreviewSql}>
                <Save size={16} /> 새로고침
              </AppButton>
            </div>
            <pre className="sql-preview light-sql-preview">{sqlPreview || generateDdl(document, dialect)}</pre>
            <p className="helper-text">단축키: Ctrl/Cmd + Z 실행취소, Ctrl/Cmd + Shift + Z 또는 Ctrl + Y 복구</p>
          </AppCard>
        </aside>
      </div>
    </div>
  );
}
