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
        logicalName: '사용자',
        color: '#dbeafe',
        memo: '회원 정보를 저장한다.',
        position: { x: 120, y: 130 },
        fields: [
          {
            id: userPk,
            name: 'id',
            logicalName: '사용자 ID',
            type: 'bigint',
            nullable: false,
            primaryKey: true,
            memo: 'PK'
          },
          {
            id: createId('field'),
            name: 'login_id',
            logicalName: '로그인 아이디',
            type: 'varchar',
            length: '50',
            nullable: false,
            primaryKey: false
          },
          {
            id: createId('field'),
            name: 'email',
            logicalName: '이메일',
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
        logicalName: '게시글',
        color: '#fde68a',
        memo: '게시글 정보를 저장한다.',
        position: { x: 520, y: 230 },
        fields: [
          {
            id: postPk,
            name: 'id',
            logicalName: '게시글 ID',
            type: 'bigint',
            nullable: false,
            primaryKey: true
          },
          {
            id: postUserId,
            name: 'user_id',
            logicalName: '작성자 ID',
            type: 'bigint',
            nullable: false,
            primaryKey: false,
            foreignKey: `${userId}.id`
          },
          {
            id: createId('field'),
            name: 'title',
            logicalName: '제목',
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
    notes: [],
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
