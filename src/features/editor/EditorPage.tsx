import { useEffect, useRef, useState, type CSSProperties, type ComponentType, type PointerEvent as ReactPointerEvent } from 'react';
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
  ArrowLeft,
  Check,
  Download,
  FileCode2,
  Link2,
  Maximize2,
  PencilLine,
  Plus,
  Redo2,
  Save,
  Settings2,
  Undo2,
  Users,
  X
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { AppButton, AppCard, AppInput, AppLabel, AppTextarea, StatusPill } from '../../components/ui';
import { fetchErd, fetchPublicErd, saveErd } from '../../lib/api';
import { generateDdl } from '../../lib/ddl';
import { isServerErdId } from '../../lib/erd-id';
import { downloadText, formatDate, nowIso } from '../../lib/storage';
import { useYjsCollaboration } from '../../lib/yjs';
import { useAppStore } from '../../state/app-store';
import type {
  Cardinality,
  Dialect,
  EntityDefinition,
  EntityViewMode,
  ErdDocument,
  ErdVisibility,
  FieldDefinition,
  RelationshipDefinition
} from '../../lib/types';
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

interface OverlayPosition {
  x: number;
  y: number;
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

const ENTITY_VIEW_OPTIONS: Array<{ mode: EntityViewMode; label: string }> = [
  { mode: 'logical', label: '논리' },
  { mode: 'physical', label: '물리' },
  { mode: 'both', label: '논리/물리' }
];

const ENTITY_COLOR_OPTIONS = [
  '#f9a8d4',
  '#fda4af',
  '#fdba74',
  '#fcd34d',
  '#bef264',
  '#86efac',
  '#67e8f9',
  '#93c5fd',
  '#a5b4fc',
  '#fca5a5'
];

const MOBILE_EDITOR_BREAKPOINT = 860;

function getAutoSaveSignature(document: ErdDocument) {
  const { updatedAt: _updatedAt, ...rest } = document;
  return JSON.stringify(rest);
}

function getEntityLabel(entity: EntityDefinition, viewMode: EntityViewMode) {
  if (viewMode === 'logical') return entity.logicalName ?? entity.name;
  if (viewMode === 'both') return `${entity.logicalName ?? entity.name} / ${entity.name}`;
  return entity.name;
}

function getFieldLogicalName(field: FieldDefinition) {
  return field.logicalName ?? field.name;
}

function getEstimatedEntityHeight(entity: EntityDefinition, viewMode: EntityViewMode) {
  const headerHeight = viewMode === 'both' ? 86 : 62;
  const rowHeight = viewMode === 'both' ? 54 : 42;
  const memoHeight = entity.memo ? 48 : 0;
  return headerHeight + entity.fields.length * rowHeight + memoHeight + 28;
}

function getEstimatedEntityWidth(viewMode: EntityViewMode) {
  return viewMode === 'both' ? 320 : 280;
}

function getFieldHeaderLabels(viewMode: EntityViewMode) {
  if (viewMode === 'logical') return ['속성명', '코멘트', 'Nullable', 'PK', '삭제'];
  if (viewMode === 'physical') return ['컬럼명', '자료형', '길이', '기본값', '코멘트', 'Nullable', 'PK', '삭제'];
  return ['속성명', '컬럼명', '자료형', '길이', '기본값', '코멘트', 'Nullable', 'PK', '삭제'];
}

function withAlpha(hex: string, alpha: string) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  return `#${normalized}${alpha}`;
}

function getEntityOverlayStyle(entity: ErdDocument['entities'][number] | null): CSSProperties | undefined {
  if (!entity) return undefined;
  const accent = entity.color ?? '#93c5fd';

  return {
    ['--entity-overlay-accent' as string]: accent,
    ['--entity-overlay-border' as string]: withAlpha(accent, '78'),
    ['--entity-overlay-surface-start' as string]: withAlpha(accent, '26'),
    ['--entity-overlay-surface-end' as string]: withAlpha(accent, '16'),
    ['--entity-overlay-header-background' as string]: withAlpha(accent, '24'),
    ['--entity-overlay-field-background' as string]: withAlpha(accent, '20'),
    ['--entity-overlay-field-border' as string]: withAlpha(accent, '4c'),
    ['--entity-overlay-input-background' as string]: withAlpha(accent, '18'),
    ['--entity-overlay-input-border' as string]: withAlpha(accent, '42'),
    ['--entity-overlay-focus-ring' as string]: withAlpha(accent, '34'),
    ['--entity-overlay-shadow' as string]: withAlpha(accent, '2f')
  };
}

function getRelationshipHandles(sourceEntity: EntityDefinition, targetEntity: EntityDefinition) {
  const deltaX = targetEntity.position.x - sourceEntity.position.x;
  const deltaY = targetEntity.position.y - sourceEntity.position.y;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0
      ? { sourceHandle: 'source-right', targetHandle: 'target-left' }
      : { sourceHandle: 'source-left', targetHandle: 'target-right' };
  }

  return deltaY >= 0
    ? { sourceHandle: 'source-bottom', targetHandle: 'target-top' }
    : { sourceHandle: 'source-top', targetHandle: 'target-bottom' };
}

function EntitySelectionPanel({
  selectedEntity,
  viewMode,
  mobileLayout,
  onDragStart,
  onClose,
  updateEntity,
  removeEntity,
  addField,
  updateField,
  removeField
}: {
  selectedEntity: ErdDocument['entities'][number];
  viewMode: EntityViewMode;
  mobileLayout: boolean;
  onDragStart: (target: 'inspector' | 'relationship') => (event: ReactPointerEvent<HTMLElement>) => void;
  onClose: () => void;
  updateEntity: ReturnType<typeof useAppStore.getState>['updateEntity'];
  removeEntity: ReturnType<typeof useAppStore.getState>['removeEntity'];
  addField: ReturnType<typeof useAppStore.getState>['addField'];
  updateField: ReturnType<typeof useAppStore.getState>['updateField'];
  removeField: ReturnType<typeof useAppStore.getState>['removeField'];
}) {
  return (
    <AppCard
      className={`canvas-overlay-card entity-overlay-card ${mobileLayout ? 'mobile-bottom-sheet' : ''}`}
      style={getEntityOverlayStyle(selectedEntity)}
    >
      <div
        className={`canvas-overlay-head entity-overlay-head ${mobileLayout ? 'sheet-head' : 'draggable-overlay-handle'}`}
        onPointerDown={mobileLayout ? undefined : onDragStart('inspector')}
      >
        <div className="canvas-overlay-title-group">
          <strong>엔티티 편집</strong>
          <p>{getEntityLabel(selectedEntity, viewMode)}</p>
        </div>
        <div className="entity-overlay-head-meta" onPointerDown={(event) => event.stopPropagation()}>
          <StatusPill tone="info">{selectedEntity.fields.length} fields</StatusPill>
          {mobileLayout ? (
            <AppButton variant="ghost" className="compact-button entity-sheet-close" onClick={onClose}>
              <X size={14} /> 닫기
            </AppButton>
          ) : null}
        </div>
      </div>
      <div className={`stack entity-overlay-body ${mobileLayout ? 'mobile-scroll' : ''}`}>
        <div className="entity-editor-head-tools">
          <div className="entity-editor-head-actions" onPointerDown={(event) => event.stopPropagation()}>
            <AppButton variant="secondary" className="compact-button entity-head-button" onClick={() => addField(selectedEntity.id)}>
              필드 추가
            </AppButton>
            <AppButton variant="ghost" className="compact-button entity-head-button" onClick={() => removeEntity(selectedEntity.id)}>
              엔티티 삭제
            </AppButton>
          </div>
          <div className="entity-color-picker" onPointerDown={(event) => event.stopPropagation()}>
            {ENTITY_COLOR_OPTIONS.map((color) => (
              <button
                key={color}
                type="button"
                className={`entity-color-swatch ${selectedEntity.color === color ? 'active' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => updateEntity(selectedEntity.id, { color })}
                aria-label={`엔티티 색상 ${color}`}
              />
            ))}
          </div>
        </div>
        {(viewMode === 'logical' || viewMode === 'both') ? (
          <div>
            <AppLabel>엔티티 논리명</AppLabel>
            <AppInput
              value={selectedEntity.logicalName ?? ''}
              onChange={(event) => updateEntity(selectedEntity.id, { logicalName: event.target.value })}
            />
          </div>
        ) : null}
        {(viewMode === 'physical' || viewMode === 'both') ? (
          <div>
            <AppLabel>엔티티 물리명</AppLabel>
            <AppInput value={selectedEntity.name} onChange={(event) => updateEntity(selectedEntity.id, { name: event.target.value })} />
          </div>
        ) : null}
        <div>
          <AppLabel>엔티티 코멘트</AppLabel>
          <AppTextarea
            className="entity-comment-input"
            rows={2}
            value={selectedEntity.memo}
            onChange={(event) => updateEntity(selectedEntity.id, { memo: event.target.value })}
          />
        </div>
        <div className={`field-editor-list compact mode-${viewMode}`}>
          <div className={`field-editor-head mode-${viewMode}`}>
            {getFieldHeaderLabels(viewMode).map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          {selectedEntity.fields.map((field) => (
            <div key={field.id} className={`field-editor compact mode-${viewMode}`}>
              {(viewMode === 'logical' || viewMode === 'both') ? (
                <AppInput
                  className="field-editor-logical"
                  placeholder="속성명"
                  value={getFieldLogicalName(field)}
                  onChange={(event) => updateField(selectedEntity.id, field.id, { logicalName: event.target.value })}
                />
              ) : null}
              {(viewMode === 'physical' || viewMode === 'both') ? (
                <AppInput
                  className="field-editor-name"
                  placeholder="컬럼명"
                  value={field.name}
                  onChange={(event) => updateField(selectedEntity.id, field.id, { name: event.target.value })}
                />
              ) : null}
              {(viewMode === 'physical' || viewMode === 'both') ? (
                <AppInput
                  className="field-editor-type"
                  placeholder="자료형"
                  value={field.type}
                  onChange={(event) => updateField(selectedEntity.id, field.id, { type: event.target.value })}
                />
              ) : null}
              {(viewMode === 'physical' || viewMode === 'both') ? (
                <AppInput
                  className="field-editor-length"
                  placeholder="길이"
                  value={field.length ?? ''}
                  onChange={(event) => updateField(selectedEntity.id, field.id, { length: event.target.value })}
                />
              ) : null}
              {(viewMode === 'physical' || viewMode === 'both') ? (
                <AppInput
                  className="field-editor-default"
                  placeholder="기본값"
                  value={field.defaultValue ?? ''}
                  onChange={(event) => updateField(selectedEntity.id, field.id, { defaultValue: event.target.value })}
                />
              ) : null}
              <AppInput
                className="field-editor-comment"
                placeholder="코멘트"
                value={field.memo ?? ''}
                onChange={(event) => updateField(selectedEntity.id, field.id, { memo: event.target.value })}
              />
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
  );
}

function CanvasSelectionCard({
  selectedEntity,
  selectedRelationship,
  viewMode,
  mobileLayout,
  position,
  onDragStart,
  onCloseEntity,
  updateEntity,
  removeEntity,
  addField,
  updateField,
  removeField,
  updateRelationship,
  removeRelationship
}: {
  selectedEntity: ErdDocument['entities'][number] | null;
  selectedRelationship: RelationshipDefinition | null;
  viewMode: EntityViewMode;
  mobileLayout: boolean;
  position: OverlayPosition;
  onDragStart: (target: 'inspector' | 'relationship') => (event: ReactPointerEvent<HTMLElement>) => void;
  onCloseEntity: () => void;
  updateEntity: ReturnType<typeof useAppStore.getState>['updateEntity'];
  removeEntity: ReturnType<typeof useAppStore.getState>['removeEntity'];
  addField: ReturnType<typeof useAppStore.getState>['addField'];
  updateField: ReturnType<typeof useAppStore.getState>['updateField'];
  removeField: ReturnType<typeof useAppStore.getState>['removeField'];
  updateRelationship: ReturnType<typeof useAppStore.getState>['updateRelationship'];
  removeRelationship: ReturnType<typeof useAppStore.getState>['removeRelationship'];
}) {
  if (!selectedEntity && !selectedRelationship) return null;

  const entityEditor = selectedEntity ? (
    <EntitySelectionPanel
      selectedEntity={selectedEntity}
      viewMode={viewMode}
      mobileLayout={mobileLayout}
      onDragStart={onDragStart}
      onClose={onCloseEntity}
      updateEntity={updateEntity}
      removeEntity={removeEntity}
      addField={addField}
      updateField={updateField}
      removeField={removeField}
    />
  ) : null;

  return (
    <>
      {selectedEntity && mobileLayout ? <div className="canvas-mobile-sheet">{entityEditor}</div> : null}

      {selectedRelationship || (selectedEntity && !mobileLayout) ? (
        <div className="canvas-inspector" style={{ left: position.x, top: position.y, right: 'auto' }}>
          {selectedEntity && !mobileLayout ? entityEditor : null}

          {selectedRelationship ? (
            <AppCard className="canvas-overlay-card relationship-overlay-card">
              <div className="canvas-overlay-head draggable-overlay-handle" onPointerDown={onDragStart('inspector')}>
                <div className="canvas-overlay-title-group">
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
                </select>
                <select
                  className="app-input"
                  value={selectedRelationship.required ? 'required' : 'optional'}
                  onChange={(event) => updateRelationship(selectedRelationship.id, { required: event.target.value === 'required' })}
                >
                  <option value="required">필수</option>
                  <option value="optional">선택</option>
                </select>
                <AppTextarea rows={2} value={selectedRelationship.memo} onChange={(event) => updateRelationship(selectedRelationship.id, { memo: event.target.value })} />
                <AppButton variant="ghost" onClick={() => removeRelationship(selectedRelationship.id)}>관계 삭제</AppButton>
              </div>
            </AppCard>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function EditorPage() {
  const params = useParams();
  const erdId = params.erdId;
  const isServerDocument = isServerErdId(erdId);
  const navigate = useNavigate();
  const session = useAppStore((state) => state.session);
  const workspace = useAppStore((state) => (erdId ? state.documents[erdId] : undefined));
  const setActiveErd = useAppStore((state) => state.setActiveErd);
  const putDocument = useAppStore((state) => state.putDocument);
  const markDocumentSaved = useAppStore((state) => state.markDocumentSaved);
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
  const [entityViewMode, setEntityViewMode] = useState<EntityViewMode>('physical');
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${MOBILE_EDITOR_BREAKPOINT}px)`).matches : false
  );
  const [localError, setLocalError] = useState('');
  const [loadingDocument, setLoadingDocument] = useState(isServerDocument);
  const [documentMissing, setDocumentMissing] = useState(false);
  const [readOnlyView, setReadOnlyView] = useState(false);
  const [relationshipDraft, setRelationshipDraft] = useState<RelationshipDraft>(INITIAL_RELATIONSHIP_DRAFT);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [inspectorPosition, setInspectorPosition] = useState<OverlayPosition>({ x: 18, y: 18 });
  const [relationshipPopupPosition, setRelationshipPopupPosition] = useState<OverlayPosition>({ x: 18, y: 18 });
  const canvasFrameRef = useRef<HTMLDivElement | null>(null);
  const suppressRelationshipSelectionUntilRef = useRef(0);
  const suppressPaneClearUntilRef = useRef(0);
  const dragStateRef = useRef<{
    target: 'inspector' | 'relationship' | null;
    offsetX: number;
    offsetY: number;
  }>({ target: null, offsetX: 0, offsetY: 0 });
  const lastAutoSaveSignature = useRef('');
  const dashboardLabel = session ? '대시보드' : '로그인';

  function clearCanvasSelection() {
    setSelectedEntityId(null);
  }

  useEffect(() => {
    if (!erdId) return;
    setActiveErd(erdId);
  }, [erdId, setActiveErd]);

  useEffect(() => {
    if (!erdId) return;
    if (!isServerDocument) {
      setLoadingDocument(false);
      setDocumentMissing(false);
      setReadOnlyView(false);
      return;
    }

    let cancelled = false;
    setLoadingDocument(true);
    setDocumentMissing(false);

    void (async () => {
      let remote = null;
      let nextReadOnly = true;

      if (session?.token) {
        remote = await fetchErd(session.token, erdId);
        nextReadOnly = !remote;
      }

      if (!remote) {
        remote = await fetchPublicErd(erdId);
        nextReadOnly = true;
      }

      if (cancelled) return;

      if (!remote) {
        setDocumentMissing(true);
        setLoadingDocument(false);
        return;
      }

      lastAutoSaveSignature.current = getAutoSaveSignature(remote);
      setLastSavedAt(remote.updatedAt);
      setReadOnlyView(nextReadOnly);
      setLoadingDocument(false);
      putDocument(remote);
    })();

    return () => {
      cancelled = true;
    };
  }, [erdId, isServerDocument, putDocument, session?.token]);

  useEffect(() => {
    if (!isServerDocument || readOnlyView || !workspace?.document || !workspace.isDirty || !session || !erdId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const signature = getAutoSaveSignature(workspace.document);
      if (signature === lastAutoSaveSignature.current) {
        return;
      }
      setSaving(true);
      const next = { ...workspace.document, updatedAt: nowIso() } as ErdDocument;
      try {
        const remote = await saveErd(session.token, next);
        if (cancelled) return;
        setLastSavedAt(next.updatedAt);
        if (remote && getAutoSaveSignature(remote) !== signature) {
          lastAutoSaveSignature.current = getAutoSaveSignature(remote);
          replaceDocument(remote, { pushHistory: false, markDirty: false });
        } else {
          lastAutoSaveSignature.current = signature;
          markDocumentSaved(next.updatedAt);
        }
      } catch {
        if (cancelled) return;
        setLastSavedAt('');
      } finally {
        if (!cancelled) setSaving(false);
      }
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [erdId, isServerDocument, readOnlyView, markDocumentSaved, replaceDocument, session, workspace?.document, workspace?.isDirty]);

  const collaboration = useYjsCollaboration(erdId, workspace?.document, readOnlyView ? null : session, (next) => {
    replaceDocument(next, { pushHistory: false, markDirty: false });
  });

  useEffect(() => {
    if (readOnlyView) {
      setCollaborationState('읽기 전용', 1);
      return;
    }
    if (!isServerDocument || session?.token === 'local-demo-token') {
      setCollaborationState('local', 1);
      return;
    }
    setCollaborationState(collaboration.status, collaboration.peers);
  }, [collaboration.peers, collaboration.status, isServerDocument, readOnlyView, session?.token, setCollaborationState]);

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
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_EDITOR_BREAKPOINT}px)`);
    const syncLayoutMode = (event?: MediaQueryListEvent) => setIsMobileLayout(event?.matches ?? mediaQuery.matches);

    syncLayoutMode();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncLayoutMode);
      return () => mediaQuery.removeEventListener('change', syncLayoutMode);
    }

    mediaQuery.addListener(syncLayoutMode);
    return () => mediaQuery.removeListener(syncLayoutMode);
  }, []);

  useEffect(() => {
    const handleRelationshipDragFinished = () => {
      suppressRelationshipSelectionUntilRef.current = window.performance.now() + 250;
    };

    window.addEventListener('relationship-edge-drag-finished', handleRelationshipDragFinished);
    return () => window.removeEventListener('relationship-edge-drag-finished', handleRelationshipDragFinished);
  }, []);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const key = event.key.toLowerCase();

      if (key === 'escape') {
        event.preventDefault();
        if (titleEditing) {
          setTitleDraft(workspace?.document?.title ?? '');
          setTitleEditing(false);
          return;
        }
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (sqlModalOpen) {
          setSqlModalOpen(false);
          return;
        }
        if (relationshipDraft.active || relationshipDraft.popupPosition) {
          resetRelationshipDraft();
          return;
        }
        if (selectedEntityId || selectedRelationshipId || selectedNoteId) {
          clearCanvasSelection();
        }
        return;
      }

      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;
      if (readOnlyView) return;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      if (isTypingTarget) return;

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
  }, [
    redo,
    relationshipDraft.active,
    relationshipDraft.popupPosition,
    selectedEntityId,
    selectedNoteId,
    selectedRelationshipId,
    settingsOpen,
    sqlModalOpen,
    titleEditing,
    undo,
    workspace?.document?.title,
    readOnlyView,
    setSelectedEntityId,
    setSelectedNoteId,
    setSelectedRelationshipId
  ]);

  function clampOverlayPosition(nextX: number, nextY: number) {
    const frameRect = canvasFrameRef.current?.getBoundingClientRect();
    if (!frameRect) return { x: nextX, y: nextY };
    return {
      x: Math.max(12, Math.min(nextX, frameRect.width - 160)),
      y: Math.max(12, Math.min(nextY, frameRect.height - 72))
    };
  }

  function handleOverlayDragStart(target: 'inspector' | 'relationship') {
    return (event: ReactPointerEvent<HTMLElement>) => {
      const frameRect = canvasFrameRef.current?.getBoundingClientRect();
      if (!frameRect) return;
      const currentPosition = target === 'relationship' ? relationshipPopupPosition : inspectorPosition;
      dragStateRef.current = {
        target,
        offsetX: event.clientX - frameRect.left - currentPosition.x,
        offsetY: event.clientY - frameRect.top - currentPosition.y
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextPosition = clampOverlayPosition(
          moveEvent.clientX - frameRect.left - dragStateRef.current.offsetX,
          moveEvent.clientY - frameRect.top - dragStateRef.current.offsetY
        );
        if (dragStateRef.current.target === 'relationship') {
          setRelationshipPopupPosition(nextPosition);
        } else {
          setInspectorPosition(nextPosition);
        }
      };

      const handlePointerUp = () => {
        dragStateRef.current = { target: null, offsetX: 0, offsetY: 0 };
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp, { once: true });
    };
  }

  if (!erdId) {
    return (
      <AppCard>
        <h2>ERD를 찾을 수 없습니다.</h2>
        <p>대시보드에서 다시 열어주세요.</p>
      </AppCard>
    );
  }

  if (loadingDocument && !workspace) {
    return (
      <AppCard>
        <h2>ERD를 불러오는 중입니다.</h2>
        <p>잠시만 기다려주세요.</p>
      </AppCard>
    );
  }

  if (documentMissing || !workspace) {
    return (
      <AppCard>
        <h2>ERD를 찾을 수 없습니다.</h2>
        <p>문서가 공개 상태가 아니거나 접근 가능한 ERD가 아닙니다.</p>
      </AppCard>
    );
  }

  const document = workspace.document;
  const selectedEntity = document.entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const selectedRelationship = document.relationships.find((relationship) => relationship.id === selectedRelationshipId) ?? null;
  let sqlPreview = `-- ${document.title} | ${dialect.toUpperCase()}`;
  try {
    sqlPreview = generateDdl(document, dialect);
  } catch (error) {
    console.error('SQL preview generation failed.', error);
  }
  const relationshipGroups = new Map<string, string[]>();

  document.relationships.forEach((relationship) => {
    const pairKey = [relationship.sourceEntityId, relationship.targetEntityId].sort().join('::');
    const siblings = relationshipGroups.get(pairKey) ?? [];
    siblings.push(relationship.id);
    relationshipGroups.set(pairKey, siblings);
  });

  const nodes: Node[] = document.entities.map((entity) => ({
    id: entity.id,
    type: 'entityNode',
    position: entity.position,
    initialWidth: getEstimatedEntityWidth(entityViewMode),
    initialHeight: getEstimatedEntityHeight(entity, entityViewMode),
    data: { entity, viewMode: entityViewMode },
    className:
      relationshipDraft.sourceEntityId === entity.id
        ? 'is-relationship-source'
        : relationshipDraft.targetEntityId === entity.id
          ? 'is-relationship-target'
          : ''
  }));

  const edges: Edge[] = document.relationships.map((relationship) => {
    const sourceEntity = document.entities.find((entity) => entity.id === relationship.sourceEntityId);
    const targetEntity = document.entities.find((entity) => entity.id === relationship.targetEntityId);
    const siblingIds = relationshipGroups.get([relationship.sourceEntityId, relationship.targetEntityId].sort().join('::')) ?? [
      relationship.id
    ];
    const laneIndex = siblingIds.indexOf(relationship.id);
    const laneOffset = (laneIndex - (siblingIds.length - 1) / 2) * 24;
    const handleSelection =
      sourceEntity && targetEntity
        ? getRelationshipHandles(sourceEntity, targetEntity)
        : { sourceHandle: 'source-bottom', targetHandle: 'target-top' };

    return {
      id: relationship.id,
      type: 'relationshipEdge',
      source: relationship.sourceEntityId,
      target: relationship.targetEntityId,
      sourceHandle: handleSelection.sourceHandle,
      targetHandle: handleSelection.targetHandle,
      selected: relationship.id === selectedRelationshipId,
      data: { relationship, laneOffset }
    };
  });

  function resetRelationshipDraft() {
    setRelationshipDraft(INITIAL_RELATIONSHIP_DRAFT);
    setLocalError('');
  }

  function openSettingsModal() {
    if (readOnlyView) return;
    setSettingsDraft({
      title: document.title,
      description: document.description,
      visibility: document.visibility
    });
    setSettingsOpen(true);
  }

  function saveInlineTitle() {
    if (readOnlyView) {
      setTitleEditing(false);
      return;
    }
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== document.title) {
      setDocumentTitle(trimmed);
    } else {
      setTitleDraft(document.title);
    }
    setTitleEditing(false);
  }

  function saveSettings() {
    if (readOnlyView) {
      setSettingsOpen(false);
      return;
    }
    const nextTitle = settingsDraft.title.trim() || document.title;
    if (nextTitle !== document.title) setDocumentTitle(nextTitle);
    if (settingsDraft.description !== document.description) setDocumentDescription(settingsDraft.description);
    if (settingsDraft.visibility !== document.visibility) setDocumentVisibility(settingsDraft.visibility);
    setSettingsOpen(false);
  }

  function handleStartRelationshipMode() {
    if (readOnlyView) return;
    clearCanvasSelection();
    setRelationshipDraft((current) => (current.active ? INITIAL_RELATIONSHIP_DRAFT : { ...INITIAL_RELATIONSHIP_DRAFT, active: true }));
    setLocalError('');
  }

  function handleNodeSelection(nodeId: string) {
    if (readOnlyView) return;
    suppressPaneClearUntilRef.current = window.performance.now() + 180;
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
        popupPosition: { x: 0, y: 0 }
      }));
      setLocalError('');
      return;
    }
  }

  function handleConfirmRelationship() {
    if (readOnlyView) return;
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
    resetRelationshipDraft();
  }

  async function handleExportPng() {
    const flowRoot = window.document.querySelector('.editor-canvas-frame .react-flow') as HTMLElement | null;
    const viewport = flowRoot?.querySelector('.react-flow__viewport') as HTMLElement | null;
    if (!flowRoot || !viewport || !document.entities.length) return;
    const exportNodes = document.entities.map((entity) => ({
      id: entity.id,
      position: entity.position,
      width: getEstimatedEntityWidth(entityViewMode),
      height: getEstimatedEntityHeight(entity, entityViewMode),
      data: {}
    }));
    const bounds = getNodesBounds(exportNodes);
    const imageWidth = Math.max(1600, Math.round(bounds.width + 320));
    const imageHeight = Math.max(900, Math.round(bounds.height + 320));
    const nextViewport = getViewportForBounds(bounds, imageWidth, imageHeight, 0.2, 1.5, 0.14);
    const previousViewportTransform = viewport.style.transform;
    const previousRootWidth = flowRoot.style.width;
    const previousRootHeight = flowRoot.style.height;

    viewport.style.transform = `translate(${nextViewport.x}px, ${nextViewport.y}px) scale(${nextViewport.zoom})`;
    flowRoot.style.width = `${imageWidth}px`;
    flowRoot.style.height = `${imageHeight}px`;

    const dataUrl = await toPng(flowRoot, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#f7f9fc',
      width: imageWidth,
      height: imageHeight,
      filter: (node) => {
        const element = node as Element | null;
        if (!element?.closest) return true;
        if (element.closest('.react-flow__minimap')) return false;
        if (element.closest('.react-flow__controls')) return false;
        if (element.closest('.canvas-inspector')) return false;
        if (element.closest('.relationship-popup')) return false;
        if (element.closest('.canvas-toast')) return false;
        return true;
      }
    }).finally(() => {
      viewport.style.transform = previousViewportTransform;
      flowRoot.style.width = previousRootWidth;
      flowRoot.style.height = previousRootHeight;
    });
    const link = window.document.createElement('a');
    link.href = dataUrl;
    link.download = `${document.title || 'erd'}.png`;
    link.click();
  }

  return (
    <div className="editor-screen">
      <header className="editor-header">
        <div className="editor-title-stack">
          <div className="editor-title-row">
            <div className="editor-title-main">
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
                <button className="editor-title-button" onClick={() => setTitleEditing(true)} disabled={readOnlyView}>
                  <span>{document.title}</span>
                  {!readOnlyView ? <PencilLine size={14} /> : null}
                </button>
              )}
            </div>
            <div className="editor-title-actions">
              {!readOnlyView ? (
                <>
                  <AppButton
                    variant="ghost"
                    className={`compact-button ${isMobileLayout ? 'icon-only-button history-icon-button' : ''}`}
                    onClick={undo}
                    aria-label="실행취소"
                    title="실행취소"
                  >
                    <Undo2 size={14} />
                    {!isMobileLayout ? '실행취소' : null}
                  </AppButton>
                  <AppButton
                    variant="ghost"
                    className={`compact-button ${isMobileLayout ? 'icon-only-button history-icon-button' : ''}`}
                    onClick={redo}
                    aria-label="복구"
                    title="복구"
                  >
                    <Redo2 size={14} />
                    {!isMobileLayout ? '복구' : null}
                  </AppButton>
                </>
              ) : null}
              <AppButton
                variant="ghost"
                className={`compact-button ${isMobileLayout ? 'mobile-dashboard-button' : ''}`}
                onClick={() => navigate(session ? '/app' : '/login')}
              >
                <ArrowLeft size={14} /> {dashboardLabel}
              </AppButton>
              {!readOnlyView ? (
                <AppButton
                  variant="secondary"
                  className={`compact-button ${isMobileLayout ? 'icon-only-button settings-icon-button' : ''}`}
                  onClick={openSettingsModal}
                  aria-label="ERD 설정"
                  title="ERD 설정"
                >
                  <Settings2 size={14} />
                  {!isMobileLayout ? 'ERD 설정' : null}
                </AppButton>
              ) : (
                <StatusPill tone="info">읽기 전용</StatusPill>
              )}
            </div>
          </div>
          <div className="editor-secondary-row">
            <div className="presence-chip">
              <Users size={14} />
              <span>{readOnlyView ? '공개 보기' : `${collaboration.peers}명 접속`}</span>
              <div className="presence-tooltip">
                <strong>{readOnlyView ? '현재 상태' : '현재 접속 인원'}</strong>
                {(readOnlyView ? ['읽기 전용 공개 보기'] : collaboration.peerNames).map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </div>
            </div>
            <AppButton variant="secondary" className="compact-button" onClick={handleExportPng}>
              <Download size={14} /> PNG
            </AppButton>
            <AppButton variant="secondary" className="compact-button" onClick={() => setSqlModalOpen(true)}>
              <FileCode2 size={14} /> SQL
            </AppButton>
            {relationshipDraft.active ? <StatusPill tone="warning">관계 설정 모드</StatusPill> : null}
            <StatusPill tone="info">{document.visibility === 'public' ? '공개 ERD' : '비공개 ERD'}</StatusPill>
          </div>
        </div>
      </header>

      <div className="editor-layout-shell">
        <aside className="editor-left-sidebar">
          <AppCard className="editor-sidebar-card compact">
            <div className="sidebar-action-stack">
              <AppButton
                className={`sidebar-action-button ${isMobileLayout ? 'icon-only-button mobile-sidebar-icon-button' : ''}`}
                onClick={addEntity}
                disabled={readOnlyView}
                aria-label="엔티티 생성"
                title="엔티티 생성"
              >
                <Plus size={16} />
                {!isMobileLayout ? '엔티티 생성' : null}
              </AppButton>
              <AppButton
                variant="secondary"
                className={`sidebar-action-button ${isMobileLayout ? 'icon-only-button mobile-sidebar-icon-button' : ''}`}
                onClick={handleStartRelationshipMode}
                disabled={readOnlyView}
                aria-label={relationshipDraft.active ? '관계 설정 종료' : '관계 설정'}
                title={relationshipDraft.active ? '관계 설정 종료' : '관계 설정'}
              >
                <Link2 size={16} />
                {!isMobileLayout ? (relationshipDraft.active ? '관계 설정 종료' : '관계 설정') : null}
              </AppButton>
              <div className="sidebar-action-divider" />
              <div className="sidebar-mode-switch">
                {ENTITY_VIEW_OPTIONS.map((option) => (
                  <AppButton
                    key={option.mode}
                    variant={entityViewMode === option.mode ? 'primary' : 'secondary'}
                    className="sidebar-action-button"
                    onClick={() => setEntityViewMode(option.mode)}
                  >
                    {option.label}
                  </AppButton>
                ))}
              </div>
            </div>

            <div className="sidebar-guide">
              <strong>{readOnlyView ? '공개 보기 안내' : '관계 설정 안내'}</strong>
              <p>
                {readOnlyView
                  ? '공개 문서는 로그인 없이 열 수 있지만 수정과 협업 연결은 할 수 없습니다.'
                  : '부모 엔티티를 클릭한 뒤 자식 엔티티를 클릭하면 옵션 팝업이 열립니다.'}
              </p>
            </div>
          </AppCard>
        </aside>

        <section className="editor-canvas-region">
          <ReactFlowProvider>
            <div className="editor-canvas-frame" ref={canvasFrameRef}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                onInit={setFlowInstance}
                nodesDraggable={!readOnlyView}
                nodesConnectable={!readOnlyView}
                elementsSelectable={!readOnlyView}
                onNodesChange={readOnlyView ? undefined : (changes) => {
                  changes.forEach((change) => {
                    if (change.type === 'position' && change.position && change.id) {
                      useAppStore.getState().moveEntity(change.id, change.position);
                    }
                    if (change.type === 'remove' && change.id) {
                      removeEntity(change.id);
                    }
                  });
                }}
                onEdgesChange={readOnlyView ? undefined : (changes) => {
                  changes.forEach((change) => {
                    if (change.type === 'remove' && change.id) {
                      removeRelationship(change.id);
                    }
                  });
                }}
                onNodeClick={(_, node) => handleNodeSelection(node.id)}
                onEdgeClick={(_, edge) => {
                  if (readOnlyView) {
                    return;
                  }
                  if (window.performance.now() < suppressRelationshipSelectionUntilRef.current) {
                    return;
                  }
                  suppressPaneClearUntilRef.current = window.performance.now() + 180;
                  setSelectedRelationshipId(edge.id);
                }}
                onPaneClick={(event) => {
                  const target = event.target as HTMLElement | null;
                  if (window.performance.now() < suppressPaneClearUntilRef.current) {
                    return;
                  }
                  if (target?.closest('.react-flow__node') || target?.closest('.react-flow__edge') || target?.closest('.react-flow__handle')) {
                    return;
                  }
                  if (!relationshipDraft.active) {
                    clearCanvasSelection();
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

              {relationshipDraft.popupPosition && !readOnlyView ? (
                <div className="relationship-popup" style={{ left: relationshipPopupPosition.x, top: relationshipPopupPosition.y }}>
                  <div className="relationship-popup-head draggable-overlay-handle" onPointerDown={handleOverlayDragStart('relationship')}>
                    <strong>관계 옵션</strong>
                    <span>부모 {document.entities.find((entity) => entity.id === relationshipDraft.sourceEntityId)?.name ?? '-'}</span>
                    <span>자식 {document.entities.find((entity) => entity.id === relationshipDraft.targetEntityId)?.name ?? '-'}</span>
                  </div>
                  <div className="stack">
                    <div className="relationship-option-section">
                      <div>
                        <AppLabel>식별 여부</AppLabel>
                        <div className="relationship-radio-group">
                          <label className={`relationship-radio ${relationshipDraft.identifying ? 'active' : ''}`}>
                            <input
                              type="radio"
                              name="relationship-identifying"
                              checked={relationshipDraft.identifying}
                              onChange={() =>
                                setRelationshipDraft((current) => ({
                                  ...current,
                                  identifying: true
                                }))
                              }
                            />
                            <span>식별</span>
                          </label>
                          <label className={`relationship-radio ${!relationshipDraft.identifying ? 'active' : ''}`}>
                            <input
                              type="radio"
                              name="relationship-identifying"
                              checked={!relationshipDraft.identifying}
                              onChange={() =>
                                setRelationshipDraft((current) => ({
                                  ...current,
                                  identifying: false
                                }))
                              }
                            />
                            <span>비식별</span>
                          </label>
                        </div>
                      </div>
                      <div>
                        <AppLabel>카디널리티</AppLabel>
                        <div className="relationship-radio-grid">
                          {(['1:1', '1:N'] as Cardinality[]).map((option) => (
                            <label
                              key={option}
                              className={`relationship-radio ${relationshipDraft.cardinality === option ? 'active' : ''}`}
                            >
                              <input
                                type="radio"
                                name="relationship-cardinality"
                                checked={relationshipDraft.cardinality === option}
                                onChange={() =>
                                  setRelationshipDraft((current) => ({
                                    ...current,
                                    cardinality: option
                                  }))
                                }
                              />
                              <span>{option}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <AppLabel>자식 참여성</AppLabel>
                      <div className="relationship-radio-group">
                        <label className={`relationship-radio ${relationshipDraft.required ? 'active' : ''}`}>
                          <input
                            type="radio"
                            name="relationship-required"
                            checked={relationshipDraft.required}
                            onChange={() =>
                              setRelationshipDraft((current) => ({
                                ...current,
                                required: true
                              }))
                            }
                          />
                          <span>필수</span>
                        </label>
                        <label className={`relationship-radio ${!relationshipDraft.required ? 'active' : ''}`}>
                          <input
                            type="radio"
                            name="relationship-required"
                            checked={!relationshipDraft.required}
                            onChange={() =>
                              setRelationshipDraft((current) => ({
                                ...current,
                                required: false
                              }))
                            }
                          />
                          <span>선택</span>
                        </label>
                      </div>
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

              {!readOnlyView ? (
                <CanvasSelectionCard
                  selectedEntity={selectedEntity}
                  selectedRelationship={selectedRelationship}
                  viewMode={entityViewMode}
                  mobileLayout={isMobileLayout}
                  position={inspectorPosition}
                  onDragStart={handleOverlayDragStart}
                  onCloseEntity={clearCanvasSelection}
                  updateEntity={updateEntity}
                  removeEntity={removeEntity}
                  addField={addField}
                  updateField={updateField}
                  removeField={removeField}
                  updateRelationship={updateRelationship}
                  removeRelationship={removeRelationship}
                />
              ) : null}
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
