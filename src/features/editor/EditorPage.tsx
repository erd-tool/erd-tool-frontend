import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useParams } from 'react-router-dom';
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AppButton, AppCard, AppInput, AppLabel, AppTextarea, StatusPill } from '../../components/ui';
import { exportSql, fetchErd, saveErd } from '../../lib/api';
import { downloadText, formatDate, nowIso } from '../../lib/storage';
import { generateDdl } from '../../lib/ddl';
import { useYjsCollaboration } from '../../lib/yjs';
import { useAppStore } from '../../state/app-store';
import { EntityNode } from './EntityNode';
import { toPng } from 'html-to-image';
import type { Dialect, ErdDocument, RelationshipDefinition } from '../../lib/types';

const nodeTypes = { entityNode: EntityNode as unknown as ComponentType<any> };

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

  const nodes: Node[] = document.entities.map((entity) => ({
    id: entity.id,
    type: 'entityNode',
    position: entity.position,
    data: { entity }
  }));

  const edges: Edge[] = document.relationships.map((relationship) => ({
    id: relationship.id,
    source: relationship.sourceEntityId,
    target: relationship.targetEntityId,
    label: relationship.cardinality,
    animated: relationship.id === selectedRelationshipId,
    style: { strokeWidth: 2, stroke: relationship.id === selectedRelationshipId ? '#ffb86b' : '#88a0ff' }
  }));

  async function handleExportPng() {
    const container = window.document.querySelector('.react-flow') as HTMLElement | null;
    if (!container) return;
    const dataUrl = await toPng(container, { cacheBust: true, pixelRatio: 2 });
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
    <div className="editor-layout">
      <aside className="editor-sidebar">
        <AppCard className="sidebar-card">
          <div className="section-head compact">
            <div>
              <StatusPill tone={collaboration.isConnected ? 'success' : 'warning'}>
                {collaboratorStatus}
              </StatusPill>
              <h3>{document.title}</h3>
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
            <div className="status-grid compact">
              <div>
                <span>저장</span>
                <strong>{saving ? '저장 중' : lastSavedAt ? formatDate(lastSavedAt) : '대기 중'}</strong>
              </div>
              <div>
                <span>연결</span>
                <strong>{collaboratorPeers}명</strong>
              </div>
            </div>
          </div>
        </AppCard>

        <AppCard className="sidebar-card">
          <div className="section-head compact">
            <div>
              <h3>구성 요소</h3>
              <p>엔티티, 관계, 메모를 편집합니다.</p>
            </div>
          </div>
          <div className="stack">
            <AppButton onClick={addEntity}>엔티티 추가</AppButton>
            <AppButton variant="secondary" onClick={() => addRelationship(selectedEntity?.id)}>
              관계 추가
            </AppButton>
            <AppButton variant="secondary" onClick={addNote}>
              메모 추가
            </AppButton>
            <div className="inline-actions">
              <AppButton variant="ghost" onClick={undo}>
                실행취소
              </AppButton>
              <AppButton variant="ghost" onClick={redo}>
                복구
              </AppButton>
            </div>
          </div>
        </AppCard>

        <AppCard className="sidebar-card">
          <div className="section-head compact">
            <div>
              <h3>엔티티 목록</h3>
            </div>
          </div>
          <div className="list">
            {document.entities.map((entity) => (
              <button key={entity.id} className={`list-item ${selectedEntityId === entity.id ? 'active' : ''}`} onClick={() => setSelectedEntityId(entity.id)}>
                <div>
                  <strong>{entity.name}</strong>
                  <span>{entity.fields.length} fields</span>
                </div>
                <small>{entity.memo || '메모 없음'}</small>
              </button>
            ))}
          </div>
        </AppCard>

        <AppCard className="sidebar-card">
          <div className="section-head compact">
            <div>
              <h3>메모 목록</h3>
            </div>
          </div>
          <div className="list">
            {document.notes.map((note) => (
              <button key={note.id} className={`list-item ${selectedNoteId === note.id ? 'active' : ''}`} onClick={() => setSelectedNoteId(note.id)}>
                <div>
                  <strong>메모</strong>
                  <span>{note.content.slice(0, 36) || '내용 없음'}</span>
                </div>
              </button>
            ))}
          </div>
        </AppCard>
      </aside>

      <section className="editor-main">
        <div className="editor-toolbar">
          <div className="toolbar-left">
            <StatusPill tone="info">{erds.find((item) => item.id === erdId)?.title ?? document.title}</StatusPill>
            <small>{formatDate(document.updatedAt)}</small>
          </div>
          <div className="toolbar-actions">
            <select className="app-input" value={dialect} onChange={(event) => setDialect(event.target.value as Dialect)}>
              <option value="mysql">MySQL</option>
              <option value="mariadb">MariaDB</option>
              <option value="oracle">Oracle</option>
              <option value="postgresql">PostgreSQL</option>
            </select>
            <AppButton variant="secondary" onClick={handlePreviewSql}>
              SQL 미리보기
            </AppButton>
            <AppButton variant="secondary" onClick={handleExportSql}>
              SQL 다운로드
            </AppButton>
            <AppButton variant="secondary" onClick={handleExportPng}>
              PNG 다운로드
            </AppButton>
          </div>
        </div>

        <div className="editor-canvas">
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
              onConnect={(connection) => {
                if (!connection.source || !connection.target) return;
                addRelationship(connection.source, connection.target);
              }}
              onNodeClick={(_, node) => setSelectedEntityId(node.id)}
              onEdgeClick={(_, edge) => setSelectedRelationshipId(edge.id)}
              onPaneClick={() => {
                setSelectedEntityId(null);
                setSelectedRelationshipId(null);
                setSelectedNoteId(null);
              }}
            >
              <Background gap={20} size={1} />
              <Controls />
              <MiniMap zoomable pannable />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        <div className="editor-bottom">
          <AppCard className="detail-card">
            <div className="section-head compact">
              <div>
                <h3>선택한 엔티티</h3>
              </div>
            </div>
            {selectedEntity ? (
              <div className="stack">
                <AppInput value={selectedEntity.name} onChange={(event) => updateEntity(selectedEntity.id, { name: event.target.value })} />
                <AppTextarea value={selectedEntity.memo} onChange={(event) => updateEntity(selectedEntity.id, { memo: event.target.value })} />
                <AppButton variant="secondary" onClick={() => addField(selectedEntity.id)}>
                  필드 추가
                </AppButton>
                <AppButton variant="ghost" onClick={() => removeEntity(selectedEntity.id)}>
                  엔티티 삭제
                </AppButton>
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
                      <AppButton variant="ghost" onClick={() => removeField(selectedEntity.id, field.id)}>
                        삭제
                      </AppButton>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p>엔티티를 선택하거나 추가하세요.</p>
            )}
          </AppCard>

          <AppCard className="detail-card">
            <div className="section-head compact">
              <div>
                <h3>관계 / 메모</h3>
              </div>
            </div>
            {selectedRelationship ? (
              <div className="stack">
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
                <AppTextarea value={selectedRelationship.memo} onChange={(event) => updateRelationship(selectedRelationship.id, { memo: event.target.value })} />
                <AppButton variant="ghost" onClick={() => removeRelationship(selectedRelationship.id)}>
                  관계 삭제
                </AppButton>
              </div>
            ) : selectedNote ? (
              <div className="stack">
                <AppTextarea value={selectedNote.content} onChange={(event) => updateNote(selectedNote.id, { content: event.target.value })} />
                <AppButton variant="ghost" onClick={() => removeNote(selectedNote.id)}>
                  메모 삭제
                </AppButton>
              </div>
            ) : (
              <p>관계나 메모를 선택하세요.</p>
            )}
            <p className="helper-text">대시보드에서 문서를 열고, 노드를 드래그하면 위치가 자동 저장됩니다.</p>
          </AppCard>

          <AppCard className="detail-card">
            <div className="section-head compact">
              <div>
                <h3>SQL 미리보기</h3>
              </div>
            </div>
            <pre className="sql-preview">{sqlPreview || generateDdl(document, dialect)}</pre>
          </AppCard>
        </div>
      </section>
    </div>
  );
}
