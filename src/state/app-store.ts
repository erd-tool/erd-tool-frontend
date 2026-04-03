import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createSampleWorkspace,
  createSeedErds,
  createSeedTeams
} from '../lib/dummy-data';
import { createId, nowIso, storageKeys } from '../lib/storage';
import type {
  Cardinality,
  DocumentWorkspace,
  ErdDocument,
  ErdSummary,
  EntityDefinition,
  FieldDefinition,
  NoteDefinition,
  RelationshipDefinition,
  TeamSummary,
  UserSession
} from '../lib/types';

interface AppState {
  session: UserSession | null;
  teams: TeamSummary[];
  erds: ErdSummary[];
  documents: Record<string, DocumentWorkspace>;
  activeErdId: string | null;
  selectedEntityId: string | null;
  selectedRelationshipId: string | null;
  selectedNoteId: string | null;
  collaboratorStatus: string;
  collaboratorPeers: number;
  setSession: (session: UserSession | null) => void;
  setTeams: (teams: TeamSummary[]) => void;
  setErds: (erds: ErdSummary[]) => void;
  putDocument: (document: ErdDocument) => void;
  ensureSeedData: () => void;
  logout: () => void;
  setActiveErd: (id: string) => void;
  createTeamLocal: (name: string) => TeamSummary;
  createErdLocal: (title: string, teamId?: string | null) => ErdSummary;
  deleteTeamLocal: (teamId: string) => void;
  deleteErdLocal: (erdId: string) => void;
  replaceDocument: (document: ErdDocument, options?: { pushHistory?: boolean }) => void;
  setDocumentTitle: (title: string) => void;
  setDocumentDescription: (description: string) => void;
  setDocumentVisibility: (visibility: ErdDocument['visibility']) => void;
  setSelectedEntityId: (id: string | null) => void;
  setSelectedRelationshipId: (id: string | null) => void;
  setSelectedNoteId: (id: string | null) => void;
  addEntity: () => void;
  updateEntity: (entityId: string, patch: Partial<EntityDefinition>) => void;
  removeEntity: (entityId: string) => void;
  addField: (entityId: string) => void;
  updateField: (entityId: string, fieldId: string, patch: Partial<FieldDefinition>) => void;
  removeField: (entityId: string, fieldId: string) => void;
  addRelationship: (config?: {
    sourceEntityId?: string;
    targetEntityId?: string;
    identifying?: boolean;
    cardinality?: Cardinality;
    required?: boolean;
    memo?: string;
  }) => string | void;
  updateRelationship: (relationshipId: string, patch: Partial<RelationshipDefinition>) => void;
  removeRelationship: (relationshipId: string) => void;
  moveRelationshipControlPoint: (relationshipId: string, controlPoint: { x: number; y: number }) => void;
  addNote: () => void;
  updateNote: (noteId: string, patch: Partial<NoteDefinition>) => void;
  removeNote: (noteId: string) => void;
  undo: () => void;
  redo: () => void;
  moveEntity: (entityId: string, position: { x: number; y: number }) => void;
  moveNote: (noteId: string, position: { x: number; y: number }) => void;
  setCollaborationState: (status: string, peers: number) => void;
}

function findActiveWorkspace(state: AppState) {
  const activeId = state.activeErdId ?? state.erds[0]?.id ?? null;
  if (!activeId) return null;
  return { id: activeId, workspace: state.documents[activeId] };
}

function pushHistory(workspace: DocumentWorkspace) {
  return {
    document: workspace.document,
    undoStack: [...workspace.undoStack, structuredClone(workspace.document)].slice(-50),
    redoStack: []
  };
}

function createBlankEntity(): EntityDefinition {
  return {
    id: createId('entity'),
    name: 'new_table',
    logicalName: '새 엔티티',
    color: '#fde68a',
    memo: '',
    position: { x: 160, y: 160 },
    fields: [
      {
        id: createId('field'),
        name: 'id',
        logicalName: '식별자',
        type: 'bigint',
        nullable: false,
        primaryKey: true
      }
    ]
  };
}

function buildForeignKeyName(sourceEntityName: string, sourceFieldName: string, existingNames: string[]) {
  const singularSourceName = sourceEntityName.endsWith('s') ? sourceEntityName.slice(0, -1) : sourceEntityName;
  const candidates = [
    sourceFieldName,
    `${singularSourceName}_${sourceFieldName}`
  ];

  for (const candidate of candidates) {
    if (!existingNames.includes(candidate)) {
      return candidate;
    }
  }

  let suffix = 2;
  while (existingNames.includes(`${singularSourceName}_${sourceFieldName}_${suffix}`)) {
    suffix += 1;
  }
  return `${singularSourceName}_${sourceFieldName}_${suffix}`;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      session: null,
      teams: [],
      erds: [],
      documents: {},
      activeErdId: null,
      selectedEntityId: null,
      selectedRelationshipId: null,
      selectedNoteId: null,
      collaboratorStatus: 'idle',
      collaboratorPeers: 1,
      setSession: (session) => set({ session }),
      setTeams: (teams) => set({ teams }),
      setErds: (erds) => set({ erds }),
      putDocument: (document) =>
        set((state) => ({
          documents: {
            ...state.documents,
            [document.id]: state.documents[document.id]
              ? {
                  ...state.documents[document.id],
                  document: structuredClone(document)
                }
              : {
                  document: structuredClone(document),
                  undoStack: [],
                  redoStack: []
                }
          }
        })),
      ensureSeedData: () => {
        const state = get();
        if (state.teams.length > 0 && state.erds.length > 0) return;
        const team = createSeedTeams()[0];
        const erd = createSeedErds(team.id)[0];
        set({
          teams: state.teams.length ? state.teams : [team],
          erds: state.erds.length ? state.erds : [erd],
          documents: {
            ...state.documents,
            [erd.id]: createSampleWorkspace(erd.id)
          },
          activeErdId: state.activeErdId ?? erd.id
        });
      },
      logout: () =>
        set({
          session: null,
          teams: [],
          erds: [],
          documents: {},
          activeErdId: null,
          selectedEntityId: null,
          selectedRelationshipId: null,
          selectedNoteId: null,
          collaboratorStatus: 'idle',
          collaboratorPeers: 1
        }),
      setActiveErd: (id) => set({ activeErdId: id, selectedEntityId: null, selectedRelationshipId: null, selectedNoteId: null }),
      createTeamLocal: (name) => {
        const team: TeamSummary = {
          id: createId('team'),
          name,
          memberCount: 1,
          invitationCount: 0,
          updatedAt: nowIso()
        };
        set((state) => ({ teams: [team, ...state.teams] }));
        return team;
      },
      createErdLocal: (title, teamId) => {
        const erd: ErdSummary = {
          id: createId('erd'),
          title,
          visibility: 'private',
          teamId: teamId ?? null,
          ownerName: get().session?.displayName ?? 'Demo User',
          updatedAt: nowIso(),
          collaboratorCount: 1
        };
        set((state) => ({
          erds: [erd, ...state.erds],
          documents: {
            ...state.documents,
            [erd.id]: createSampleWorkspace(erd.id)
          },
          activeErdId: erd.id
        }));
        return erd;
      },
      deleteTeamLocal: (teamId) =>
        set((state) => {
          const removedErdIds = state.erds.filter((erd) => erd.teamId === teamId).map((erd) => erd.id);
          const nextDocuments = { ...state.documents };
          removedErdIds.forEach((erdId) => {
            delete nextDocuments[erdId];
          });
          return {
            teams: state.teams.filter((team) => team.id !== teamId),
            erds: state.erds.filter((erd) => erd.teamId !== teamId),
            documents: nextDocuments,
            activeErdId:
              state.activeErdId && removedErdIds.includes(state.activeErdId) ? null : state.activeErdId
          };
        }),
      deleteErdLocal: (erdId) =>
        set((state) => {
          const nextDocuments = { ...state.documents };
          delete nextDocuments[erdId];
          return {
            erds: state.erds.filter((erd) => erd.id !== erdId),
            documents: nextDocuments,
            activeErdId: state.activeErdId === erdId ? null : state.activeErdId
          };
        }),
      replaceDocument: (document, options) => {
        const active = findActiveWorkspace(get());
        if (!active) return;
        set((state) => {
          const current = state.documents[active.id];
          if (!current) {
            return {
              documents: {
                ...state.documents,
                [document.id]: {
                  document: structuredClone(document),
                  undoStack: [],
                  redoStack: []
                }
              }
            };
          }
          const nextWorkspace: DocumentWorkspace = {
            document: structuredClone(document),
            undoStack:
              options?.pushHistory === false
                ? current.undoStack
                : [...current.undoStack, structuredClone(current.document)].slice(-50),
            redoStack: options?.pushHistory === false ? current.redoStack : []
          };
          return {
            documents: {
              ...state.documents,
              [active.id]: nextWorkspace
            },
            erds: state.erds.map((erd) =>
              erd.id === active.id ? { ...erd, title: document.title, updatedAt: document.updatedAt } : erd
            )
          };
        });
      },
      setDocumentTitle: (title) => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const next = structuredClone(active.workspace.document);
        next.title = title;
        next.updatedAt = nowIso();
        next.version += 1;
        set((state) => ({
          documents: {
            ...state.documents,
            [active.id]: pushHistory(active.workspace)
          },
          erds: state.erds.map((erd) => (erd.id === active.id ? { ...erd, title, updatedAt: next.updatedAt } : erd))
        }));
        get().replaceDocument(next, { pushHistory: false });
      },
      setDocumentDescription: (description) => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const next = structuredClone(active.workspace.document);
        next.description = description;
        next.updatedAt = nowIso();
        next.version += 1;
        set((state) => ({
          documents: {
            ...state.documents,
            [active.id]: pushHistory(active.workspace)
          }
        }));
        get().replaceDocument(next, { pushHistory: false });
      },
      setDocumentVisibility: (visibility) => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const next = structuredClone(active.workspace.document);
        next.visibility = visibility;
        next.updatedAt = nowIso();
        next.version += 1;
        set((state) => ({
          documents: {
            ...state.documents,
            [active.id]: pushHistory(active.workspace)
          }
        }));
        get().replaceDocument(next, { pushHistory: false });
      },
      setSelectedEntityId: (id) => set({ selectedEntityId: id, selectedRelationshipId: null, selectedNoteId: null }),
      setSelectedRelationshipId: (id) => set({ selectedRelationshipId: id, selectedEntityId: null, selectedNoteId: null }),
      setSelectedNoteId: (id) => set({ selectedNoteId: id, selectedEntityId: null, selectedRelationshipId: null }),
      addEntity: () => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const next = structuredClone(active.workspace.document);
        next.entities.push(createBlankEntity());
        next.updatedAt = nowIso();
        next.version += 1;
        set((state) => ({
          documents: {
            ...state.documents,
            [active.id]: pushHistory(active.workspace)
          }
        }));
        get().replaceDocument(next, { pushHistory: false });
      },
      updateEntity: (entityId, patch) => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const next = structuredClone(active.workspace.document);
        next.entities = next.entities.map((entity) => (entity.id === entityId ? { ...entity, ...patch } : entity));
        next.updatedAt = nowIso();
        next.version += 1;
        get().replaceDocument(next);
      },
      removeEntity: (entityId) => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const next = structuredClone(active.workspace.document);
        next.entities = next.entities.filter((entity) => entity.id !== entityId);
        next.relationships = next.relationships.filter(
          (relationship) => relationship.sourceEntityId !== entityId && relationship.targetEntityId !== entityId
        );
        next.updatedAt = nowIso();
        next.version += 1;
        get().replaceDocument(next);
        set({ selectedEntityId: null });
      },
      addField: (entityId) => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const next = structuredClone(active.workspace.document);
        const entity = next.entities.find((item) => item.id === entityId);
        if (!entity) return;
        entity.fields.push({
          id: createId('field'),
          name: 'new_field',
          logicalName: '새 속성',
          type: 'varchar',
          length: '100',
          defaultValue: '',
          memo: '',
          nullable: true,
          primaryKey: false
        });
        next.updatedAt = nowIso();
        next.version += 1;
        get().replaceDocument(next);
      },
      updateField: (entityId, fieldId, patch) => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const next = structuredClone(active.workspace.document);
        const entity = next.entities.find((item) => item.id === entityId);
        const field = entity?.fields.find((item) => item.id === fieldId);
        if (!field) return;
        Object.assign(field, patch);
        if (patch.primaryKey !== undefined && entity) {
          if (patch.primaryKey) {
            field.nullable = false;
            entity.fields = [
              ...entity.fields.filter((item) => item.id !== field.id && item.primaryKey),
              field,
              ...entity.fields.filter((item) => item.id !== field.id && !item.primaryKey)
            ];
          } else {
            entity.fields = [
              ...entity.fields.filter((item) => item.id !== field.id && item.primaryKey),
              ...entity.fields.filter((item) => item.id !== field.id && !item.primaryKey),
              field
            ];
          }
        }
        next.updatedAt = nowIso();
        next.version += 1;
        get().replaceDocument(next);
      },
      removeField: (entityId, fieldId) => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const next = structuredClone(active.workspace.document);
        const entity = next.entities.find((item) => item.id === entityId);
        if (!entity) return;
        entity.fields = entity.fields.filter((item) => item.id !== fieldId);
        next.relationships = next.relationships.filter(
          (relationship) => relationship.sourceFieldId !== fieldId && relationship.targetFieldId !== fieldId
        );
        next.updatedAt = nowIso();
        next.version += 1;
        get().replaceDocument(next);
      },
      addRelationship: (config) => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const entities = active.workspace.document.entities;
        if (entities.length < 2) return;
        const source = entities.find((item) => item.id === config?.sourceEntityId) ?? entities[0];
        const target = entities.find((item) => item.id === config?.targetEntityId && item.id !== source.id) ?? entities[1];
        if (!source || !target || source.id === target.id) return;

        const next = structuredClone(active.workspace.document);
        const relationId = createId('rel');
        const sourceEntity = next.entities.find((item) => item.id === source.id);
        const targetEntity = next.entities.find((item) => item.id === target.id);
        const sourceField =
          sourceEntity?.fields.find((field) => field.primaryKey) ??
          sourceEntity?.fields[0];
        const sourceFieldName = sourceField?.name ?? 'id';
        const sourceFieldLogicalName = sourceField?.logicalName ?? sourceFieldName;
        const foreignKeyReference = `${source.name}.${sourceFieldName}`;
        let targetField =
          targetEntity?.fields.find((field) => field.foreignKey === foreignKeyReference);

        if (!targetField && targetEntity) {
          const nextFieldName = buildForeignKeyName(
            source.name,
            sourceFieldName,
            targetEntity.fields.map((field) => field.name)
          );
          targetField = {
            id: createId('field'),
            name: nextFieldName,
            logicalName: sourceFieldLogicalName,
            type: sourceField?.type ?? 'bigint',
            length: sourceField?.length,
            defaultValue: sourceField?.defaultValue,
            memo: sourceField?.memo,
            nullable: !(config?.required ?? true),
            primaryKey: false,
            foreignKey: foreignKeyReference
          };
          targetEntity.fields.splice(1, 0, targetField);
        }

        if (targetField) {
          if (!targetField.logicalName) {
            targetField.logicalName = sourceFieldLogicalName;
          }
          targetField.type = sourceField?.type ?? targetField.type;
          targetField.length = sourceField?.length;
          targetField.nullable = !(config?.required ?? true);
          targetField.foreignKey = foreignKeyReference;
        }
        next.relationships.push({
          id: relationId,
          sourceEntityId: source.id,
          targetEntityId: target.id,
          sourceFieldId: sourceField?.id,
          targetFieldId: targetField?.id,
          cardinality: config?.cardinality ?? '1:N',
          curveOffset: 0,
          identifying: config?.identifying ?? false,
          required: config?.required ?? true,
          memo: config?.memo ?? ''
        });
        next.updatedAt = nowIso();
        next.version += 1;
        get().replaceDocument(next);
        return relationId;
      },
      updateRelationship: (relationshipId, patch) => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const next = structuredClone(active.workspace.document);
        const relationship = next.relationships.find((item) => item.id === relationshipId);
        if (!relationship) return;
        Object.assign(relationship, patch);
        if (patch.required !== undefined && relationship.targetEntityId && relationship.targetFieldId) {
          const targetEntity = next.entities.find((item) => item.id === relationship.targetEntityId);
          const targetField = targetEntity?.fields.find((field) => field.id === relationship.targetFieldId);
          if (targetField && !targetField.primaryKey) {
            targetField.nullable = !patch.required;
          }
        }
        next.updatedAt = nowIso();
        next.version += 1;
        get().replaceDocument(next);
      },
      removeRelationship: (relationshipId) => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const next = structuredClone(active.workspace.document);
        const relationship = next.relationships.find((item) => item.id === relationshipId);
        if (relationship?.targetEntityId && relationship.targetFieldId) {
          const targetEntity = next.entities.find((item) => item.id === relationship.targetEntityId);
          const targetField = targetEntity?.fields.find((field) => field.id === relationship.targetFieldId);
          const isSharedTargetField = next.relationships.some(
            (item) =>
              item.id !== relationshipId &&
              item.targetEntityId === relationship.targetEntityId &&
              item.targetFieldId === relationship.targetFieldId
          );
          if (targetEntity && targetField && !targetField.primaryKey) {
            if (!isSharedTargetField) {
              targetEntity.fields = targetEntity.fields.filter((field) => field.id !== relationship.targetFieldId);
            }
          }
        }
        next.relationships = next.relationships.filter((item) => item.id !== relationshipId);
        next.updatedAt = nowIso();
        next.version += 1;
        get().replaceDocument(next);
      },
      moveRelationshipControlPoint: (relationshipId, controlPoint) => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const next = structuredClone(active.workspace.document);
        const relationship = next.relationships.find((item) => item.id === relationshipId);
        if (!relationship) return;
        relationship.controlOffset = controlPoint;
        delete relationship.controlPoint;
        relationship.curveOffset = 0;
        next.updatedAt = nowIso();
        next.version += 1;
        get().replaceDocument(next, { pushHistory: false });
      },
      addNote: () => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const next = structuredClone(active.workspace.document);
        next.notes.push({
          id: createId('note'),
          content: '새 메모',
          position: { x: 240, y: 140 }
        });
        next.updatedAt = nowIso();
        next.version += 1;
        get().replaceDocument(next);
      },
      updateNote: (noteId, patch) => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const next = structuredClone(active.workspace.document);
        const note = next.notes.find((item) => item.id === noteId);
        if (!note) return;
        Object.assign(note, patch);
        next.updatedAt = nowIso();
        next.version += 1;
        get().replaceDocument(next);
      },
      removeNote: (noteId) => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const next = structuredClone(active.workspace.document);
        next.notes = next.notes.filter((item) => item.id !== noteId);
        next.updatedAt = nowIso();
        next.version += 1;
        get().replaceDocument(next);
      },
      undo: () => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace || active.workspace.undoStack.length === 0) return;
        const previous = active.workspace.undoStack[active.workspace.undoStack.length - 1];
        const remaining = active.workspace.undoStack.slice(0, -1);
        set((state) => ({
          documents: {
            ...state.documents,
            [active.id]: {
              document: structuredClone(previous),
              undoStack: remaining,
              redoStack: [...active.workspace.redoStack, structuredClone(active.workspace.document)].slice(-50)
            }
          }
        }));
      },
      redo: () => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace || active.workspace.redoStack.length === 0) return;
        const nextDocument = active.workspace.redoStack[active.workspace.redoStack.length - 1];
        const remaining = active.workspace.redoStack.slice(0, -1);
        set((state) => ({
          documents: {
            ...state.documents,
            [active.id]: {
              document: structuredClone(nextDocument),
              undoStack: [...active.workspace.undoStack, structuredClone(active.workspace.document)].slice(-50),
              redoStack: remaining
            }
          }
        }));
      },
      moveEntity: (entityId, position) => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const next = structuredClone(active.workspace.document);
        const entity = next.entities.find((item) => item.id === entityId);
        if (!entity) return;
        entity.position = position;
        next.updatedAt = nowIso();
        next.version += 1;
        get().replaceDocument(next, { pushHistory: false });
      },
      moveNote: (noteId, position) => {
        const active = findActiveWorkspace(get());
        if (!active?.workspace) return;
        const next = structuredClone(active.workspace.document);
        const note = next.notes.find((item) => item.id === noteId);
        if (!note) return;
        note.position = position;
        next.updatedAt = nowIso();
        next.version += 1;
        get().replaceDocument(next, { pushHistory: false });
      },
      setCollaborationState: (status, peers) => set({ collaboratorStatus: status, collaboratorPeers: peers })
    }),
    {
      name: storageKeys.documents,
      partialize: (state) => ({
        session: state.session,
        teams: state.teams,
        erds: state.erds,
        documents: state.documents,
        activeErdId: state.activeErdId
      })
    }
  )
);
