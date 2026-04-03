export type Dialect = 'mysql' | 'mariadb' | 'oracle' | 'postgresql';

export type Cardinality = '1:1' | '1:N' | 'N:1' | 'N:M';

export type ErdVisibility = 'private' | 'public';
export type EntityViewMode = 'logical' | 'physical' | 'both';

export interface UserSession {
  id: string | number;
  loginId: string;
  email?: string;
  displayName: string;
  token: string;
}

export interface TeamSummary {
  id: string;
  name: string;
  description?: string;
  role?: string;
  memberCount: number;
  invitationCount: number;
  updatedAt: string;
}

export interface TeamInvitationSummary {
  id: string;
  teamId: string;
  teamName: string;
  inviteeLoginId: string;
  inviteeDisplayName: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
}

export interface ErdSummary {
  id: string;
  title: string;
  description?: string;
  visibility: ErdVisibility;
  teamId?: string | null;
  teamName?: string | null;
  ownerName: string;
  updatedAt: string;
  collaboratorCount: number;
}

export interface FieldDefinition {
  id: string;
  name: string;
  logicalName?: string;
  type: string;
  length?: string;
  nullable: boolean;
  primaryKey: boolean;
  foreignKey?: string;
  defaultValue?: string;
  memo?: string;
}

export interface EntityDefinition {
  id: string;
  name: string;
  logicalName?: string;
  color?: string;
  memo: string;
  position: { x: number; y: number };
  fields: FieldDefinition[];
}

export interface RelationshipDefinition {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  sourceFieldId?: string;
  targetFieldId?: string;
  cardinality: Cardinality;
  controlOffset?: {
    x: number;
    y: number;
  };
  curveOffset?: number;
  controlPoint?: {
    x: number;
    y: number;
  };
  identifying?: boolean;
  required?: boolean;
  memo: string;
}

export interface NoteDefinition {
  id: string;
  content: string;
  position: { x: number; y: number };
}

export interface ErdDocument {
  id: string;
  title: string;
  description: string;
  visibility: ErdVisibility;
  entities: EntityDefinition[];
  relationships: RelationshipDefinition[];
  notes: NoteDefinition[];
  viewport: { x: number; y: number; zoom: number };
  updatedAt: string;
  version: number;
}

export interface DocumentWorkspace {
  document: ErdDocument;
  undoStack: ErdDocument[];
  redoStack: ErdDocument[];
  lastSavedAt?: string;
}
