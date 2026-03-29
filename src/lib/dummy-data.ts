import { createId, nowIso } from './storage';
import type { DocumentWorkspace, ErdDocument, ErdSummary, TeamSummary, UserSession } from './types';

export function createSampleSession(): UserSession {
  return {
    id: 'user_demo',
    loginId: 'demo',
    email: 'demo@erd.local',
    displayName: 'Demo User',
    token: 'local-demo-token'
  };
}

export function createSampleTeam(): TeamSummary {
  return {
    id: createId('team'),
    name: 'Bootcamp Squad',
    memberCount: 4,
    invitationCount: 1,
    updatedAt: nowIso()
  };
}

export function createSampleDocument(id = createId('erd')): ErdDocument {
  const userId = createId('entity');
  const postId = createId('entity');
  const userPk = createId('field');
  const postPk = createId('field');
  const postUserId = createId('field');

  return {
    id,
    title: 'Students and Posts',
    description: '개인 연습용 ERD 샘플입니다.',
    visibility: 'private',
    entities: [
      {
        id: userId,
        name: 'users',
        memo: '회원 정보를 저장한다.',
        position: { x: 120, y: 130 },
        fields: [
          {
            id: userPk,
            name: 'id',
            type: 'bigint',
            nullable: false,
            primaryKey: true,
            memo: 'PK'
          },
          {
            id: createId('field'),
            name: 'login_id',
            type: 'varchar',
            length: '50',
            nullable: false,
            primaryKey: false
          },
          {
            id: createId('field'),
            name: 'email',
            type: 'varchar',
            length: '120',
            nullable: false,
            primaryKey: false
          }
        ]
      },
      {
        id: postId,
        name: 'posts',
        memo: '게시글 정보를 저장한다.',
        position: { x: 520, y: 230 },
        fields: [
          {
            id: postPk,
            name: 'id',
            type: 'bigint',
            nullable: false,
            primaryKey: true
          },
          {
            id: postUserId,
            name: 'user_id',
            type: 'bigint',
            nullable: false,
            primaryKey: false,
            foreignKey: `${userId}.id`
          },
          {
            id: createId('field'),
            name: 'title',
            type: 'varchar',
            length: '120',
            nullable: false,
            primaryKey: false
          }
        ]
      }
    ],
    relationships: [
      {
        id: createId('rel'),
        sourceEntityId: userId,
        targetEntityId: postId,
        sourceFieldId: userPk,
        targetFieldId: postUserId,
        cardinality: '1:N',
        memo: '한 명의 사용자는 여러 게시글을 가질 수 있다.'
      }
    ],
    notes: [
      {
        id: createId('note'),
        content: '카디널리티와 FK 라벨을 함께 확인할 수 있다.',
        position: { x: 280, y: 70 }
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: nowIso(),
    version: 1
  };
}

export function createSampleWorkspace(id = createId('erd')): DocumentWorkspace {
  return {
    document: createSampleDocument(id),
    undoStack: [],
    redoStack: []
  };
}

export function createSeedTeams(): TeamSummary[] {
  return [createSampleTeam()];
}

export function createSeedErds(teamId?: string | null): ErdSummary[] {
  return [
    {
      id: 'erd_sample',
      title: 'Students and Posts',
      visibility: 'private',
      teamId: teamId ?? null,
      ownerName: 'Demo User',
      updatedAt: nowIso(),
      collaboratorCount: 2
    }
  ];
}
