import { generateDdl } from './ddl';
import { nowIso } from './storage';
import type { Dialect, ErdDocument, ErdSummary, ErdVisibility, TeamInvitationSummary, TeamSummary, UserSession } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';

const STATUS_FALLBACK_MESSAGES: Record<number, string> = {
  400: '요청 내용을 다시 확인해 주세요.',
  401: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  403: '이 작업을 수행할 권한이 없습니다.',
  404: '요청한 데이터를 찾을 수 없습니다.',
  409: '이미 처리된 요청이거나 중복된 정보입니다.',
  410: '요청이 만료되었습니다. 다시 시도해 주세요.',
  422: '입력값을 다시 확인해 주세요.',
  500: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  502: '서비스 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요.',
  503: '서비스가 잠시 응답하지 않습니다. 잠시 후 다시 시도해 주세요.',
  504: '응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'
};

const FIELD_LABELS: Record<string, string> = {
  loginId: '아이디',
  email: '이메일',
  password: '비밀번호',
  displayName: '이름',
  name: '이름',
  title: 'ERD 이름',
  description: '설명',
  contentJson: 'ERD 내용'
};

function resolveToken(token?: string) {
  if (token) return token;
  try {
    const raw = localStorage.getItem('erd-tool.documents');
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { state?: { session?: { token?: string } } };
    return parsed.state?.session?.token;
  } catch {
    return undefined;
  }
}

function fallbackErrorMessage(status?: number) {
  if (status && STATUS_FALLBACK_MESSAGES[status]) {
    return STATUS_FALLBACK_MESSAGES[status];
  }
  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

function extractErrorMessage(body: string) {
  const trimmed = body.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as { message?: unknown; error?: unknown };
      if (typeof parsed.message === 'string' && parsed.message.trim()) {
        return parsed.message.trim();
      }
      if (typeof parsed.error === 'string' && parsed.error.trim()) {
        return parsed.error.trim();
      }
    } catch {
      return trimmed;
    }
  }
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return null;
  }
  return trimmed;
}

function translateValidationMessage(message: string) {
  const trimmed = message.trim();
  const fieldMessage = trimmed.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.+)$/);
  if (!fieldMessage) return trimmed;

  const [, field, rule] = fieldMessage;
  const label = FIELD_LABELS[field] ?? field;
  const normalizedRule = rule.trim();

  if (/must not be blank/i.test(normalizedRule)) {
    return `${label} 항목을 입력해 주세요.`;
  }

  if (/must be a well-formed email address/i.test(normalizedRule)) {
    return '올바른 이메일 주소를 입력해 주세요.';
  }

  const sizeMatch = normalizedRule.match(/size must be between (\d+) and (\d+)/i);
  if (sizeMatch) {
    const [, min, max] = sizeMatch;
    if (min === '0') {
      return `${label}은 ${max}자 이하로 입력해 주세요.`;
    }
    return `${label}은 ${min}자 이상 ${max}자 이하로 입력해 주세요.`;
  }

  return trimmed;
}

function normalizeErrorMessage(message: string | null | undefined, status?: number) {
  const trimmed = message?.trim();
  if (!trimmed) {
    return fallbackErrorMessage(status);
  }

  if (/^(bad request|unauthorized|forbidden|not found|conflict|gone|unprocessable entity|internal server error|bad gateway|service unavailable|gateway timeout)$/i.test(trimmed)) {
    return fallbackErrorMessage(status);
  }

  if (/failed to fetch|networkerror|load failed/i.test(trimmed)) {
    return '서버에 연결하지 못했습니다. 백엔드가 실행 중인지 확인해 주세요.';
  }

  if (/validation failed/i.test(trimmed)) {
    return '입력값을 다시 확인해 주세요.';
  }

  if (/request failed:\s*\d+/i.test(trimmed)) {
    return fallbackErrorMessage(status);
  }

  return translateValidationMessage(trimmed);
}

async function request<T>(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {})
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    throw new Error(normalizeErrorMessage(message));
  }
  if (!response.ok) {
    const message = extractErrorMessage(await response.text());
    throw new Error(normalizeErrorMessage(message, response.status));
  }
  return response;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await request<T>(path, init);
  return response.json() as Promise<T>;
}

async function requestMaybeJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    return await requestJson<T>(path, init);
  } catch {
    return null;
  }
}

function unwrapHalResource<T>(payload: T | { _embedded?: Record<string, unknown>; _links?: unknown }) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload as T;
  }
  if ('_embedded' in payload) {
    const embedded = payload._embedded;
    if (embedded && typeof embedded === 'object') {
      const firstEmbedded = Object.values(embedded)[0];
      if (firstEmbedded && !Array.isArray(firstEmbedded)) {
        return firstEmbedded as T;
      }
    }
  }
  return payload as T;
}

function unwrapHalCollection<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (payload && typeof payload === 'object' && '_embedded' in payload) {
    const embedded = (payload as { _embedded?: Record<string, unknown> })._embedded;
    if (embedded && typeof embedded === 'object') {
      const firstEmbedded = Object.values(embedded)[0];
      if (Array.isArray(firstEmbedded)) {
        return firstEmbedded as T[];
      }
    }
  }
  return [];
}

function mapTeamSummary(payload: {
  id: number;
  name: string;
  description?: string;
  role?: string;
  memberCount?: number;
  invitationCount?: number;
  updatedAt?: string;
}): TeamSummary {
  return {
    id: String(payload.id),
    name: payload.name,
    description: payload.description ?? '',
    role: payload.role,
    memberCount: payload.memberCount ?? 1,
    invitationCount: payload.invitationCount ?? 0,
    updatedAt: payload.updatedAt ?? nowIso()
  };
}

function mapInvitationSummary(payload: {
  id: number;
  teamId: number;
  teamName: string;
  inviteeLoginId: string;
  inviteeDisplayName: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
}): TeamInvitationSummary {
  return {
    id: String(payload.id),
    teamId: String(payload.teamId),
    teamName: payload.teamName,
    inviteeLoginId: payload.inviteeLoginId,
    inviteeDisplayName: payload.inviteeDisplayName,
    status: payload.status,
    expiresAt: payload.expiresAt,
    createdAt: payload.createdAt
  };
}

function mapErdSummary(payload: {
  id: number;
  title: string;
  description?: string;
  visibility?: ErdVisibility;
  teamId?: number | null;
  teamName?: string | null;
  updatedAt: string;
}): ErdSummary {
  return {
    id: String(payload.id),
    title: payload.title,
    description: payload.description ?? '',
    visibility: payload.visibility ?? 'private',
    teamId: payload.teamId != null ? String(payload.teamId) : null,
    teamName: payload.teamName ?? null,
    ownerName: payload.teamName ?? (payload.teamId != null ? '팀' : '개인'),
    updatedAt: payload.updatedAt,
    collaboratorCount: 1
  };
}

function mapDocument(payload: {
  id: number;
  title: string;
  description?: string;
  visibility?: ErdVisibility;
  contentJson: string;
}) {
  const parsed = JSON.parse(payload.contentJson) as Partial<ErdDocument>;
  return {
    id: String(payload.id),
    title: payload.title,
    description: payload.description ?? '',
    visibility: payload.visibility ?? parsed.visibility ?? 'private',
    entities: parsed.entities ?? [],
    relationships: parsed.relationships ?? [],
    notes: parsed.notes ?? [],
    viewport: parsed.viewport ?? { x: 0, y: 0, zoom: 1 },
    updatedAt: parsed.updatedAt ?? nowIso(),
    version: parsed.version ?? 1
  } satisfies ErdDocument;
}

export async function loginRequest(payload: { loginId: string; password: string }) {
  const auth = await requestJson<{
    accessToken: string;
    userId: number;
    loginId: string;
    displayName: string;
  }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return {
    id: auth.userId,
    loginId: auth.loginId,
    displayName: auth.displayName,
    token: auth.accessToken
  } satisfies UserSession;
}

export async function signupRequest(payload: { loginId: string; email: string; password: string; displayName: string }) {
  const auth = await requestJson<{
    accessToken: string;
    userId: number;
    loginId: string;
    displayName: string;
  }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return {
    id: auth.userId,
    loginId: auth.loginId,
    email: payload.email,
    displayName: auth.displayName,
    token: auth.accessToken
  } satisfies UserSession;
}

export async function fetchTeams(token?: string) {
  const resolvedToken = resolveToken(token);
  const response = await requestMaybeJson<
    Array<{
      id: number;
      name: string;
      description?: string;
      role?: string;
      memberCount?: number;
      invitationCount?: number;
      updatedAt?: string;
    }> | {
      _embedded?: Record<string, unknown>;
    }
  >('/api/teams', {
    headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}
  });
  return unwrapHalCollection<{
    id: number;
    name: string;
    description?: string;
    role?: string;
    memberCount?: number;
    invitationCount?: number;
    updatedAt?: string;
  }>(response)?.map(mapTeamSummary) ?? null;
}

export async function fetchTeamInvitations(token?: string) {
  const resolvedToken = resolveToken(token);
  const response = await requestMaybeJson<
    Array<{
      id: number;
      teamId: number;
      teamName: string;
      inviteeLoginId: string;
      inviteeDisplayName: string;
      status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
      expiresAt: string;
      createdAt: string;
    }> | {
      _embedded?: Record<string, unknown>;
    }
  >('/api/teams/invitations', {
    headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}
  });
  return unwrapHalCollection<{
    id: number;
    teamId: number;
    teamName: string;
    inviteeLoginId: string;
    inviteeDisplayName: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
    expiresAt: string;
    createdAt: string;
  }>(response)?.map(mapInvitationSummary) ?? null;
}

export async function fetchErds(token?: string) {
  const resolvedToken = resolveToken(token);
  const response = await requestMaybeJson<
    Array<{
      id: number;
      title: string;
      description?: string;
      visibility?: ErdVisibility;
      teamId?: number | null;
      teamName?: string | null;
      updatedAt: string;
    }> | {
      _embedded?: Record<string, unknown>;
    }
  >('/api/erds', {
    headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}
  });
  return unwrapHalCollection<{
    id: number;
    title: string;
    description?: string;
    visibility?: ErdVisibility;
    teamId?: number | null;
    teamName?: string | null;
    updatedAt: string;
  }>(response)?.map(mapErdSummary) ?? null;
}

export async function fetchErd(token: string | undefined, id: string) {
  const resolvedToken = resolveToken(token);
  const response = await requestMaybeJson<{
    id: number;
    title: string;
    description?: string;
    visibility?: ErdVisibility;
    contentJson: string;
  }>(`/api/erds/${id}`, {
    headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}
  });
  return response ? mapDocument(unwrapHalResource(response)) : null;
}

export async function fetchPublicErd(id: string) {
  const response = await requestMaybeJson<{
    id: number;
    title: string;
    description?: string;
    visibility?: ErdVisibility;
    contentJson: string;
  }>(`/api/public/erds/${id}`);
  return response ? mapDocument(unwrapHalResource(response)) : null;
}

export async function saveErd(token: string | undefined, document: ErdDocument) {
  const resolvedToken = resolveToken(token);
  const response = await requestMaybeJson<{
    id: number;
    title: string;
    description?: string;
    visibility?: ErdVisibility;
    contentJson: string;
  }>(`/api/erds/${document.id}`, {
    method: 'PATCH',
    headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {},
    body: JSON.stringify({
      title: document.title,
      description: document.description,
      visibility: document.visibility,
      contentJson: JSON.stringify({
        visibility: document.visibility,
        entities: document.entities,
        relationships: document.relationships,
        notes: document.notes,
        viewport: document.viewport,
        updatedAt: document.updatedAt,
        version: document.version
      })
    })
  });
  return response ? mapDocument(unwrapHalResource(response)) : null;
}

export async function createErd(token: string | undefined, title: string, teamId?: string) {
  const resolvedToken = resolveToken(token);
  const response = await requestJson<{
    id: number;
    title: string;
    description?: string;
    visibility?: ErdVisibility;
    teamId?: number | null;
    teamName?: string | null;
    updatedAt: string;
  }>('/api/erds', {
    method: 'POST',
    headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {},
    body: JSON.stringify({ title, visibility: 'private', teamId: teamId ? Number(teamId) : null })
  });
  return mapErdSummary(unwrapHalResource(response));
}

export async function createTeam(token: string | undefined, name: string) {
  const resolvedToken = resolveToken(token);
  const response = await requestJson<{
    id: number;
    name: string;
    description?: string;
    role?: string;
    memberCount?: number;
    invitationCount?: number;
    updatedAt?: string;
  }>('/api/teams', {
    method: 'POST',
    headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {},
    body: JSON.stringify({ name })
  });
  return mapTeamSummary(unwrapHalResource(response));
}

export async function deleteErdRequest(token: string | undefined, erdId: string) {
  const resolvedToken = resolveToken(token);
  await request<void>(`/api/erds/${erdId}`, {
    method: 'DELETE',
    headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}
  });
}

export async function deleteTeamRequest(token: string | undefined, teamId: string) {
  const resolvedToken = resolveToken(token);
  await request<void>(`/api/teams/${teamId}`, {
    method: 'DELETE',
    headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}
  });
}

export async function inviteTeamMember(token: string | undefined, teamId: string, loginId: string) {
  const resolvedToken = resolveToken(token);
  const response = await requestJson<{
    id: number;
    teamId: number;
    teamName: string;
    inviteeLoginId: string;
    inviteeDisplayName: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
    expiresAt: string;
    createdAt: string;
  }>(`/api/teams/${teamId}/invitations`, {
    method: 'POST',
    headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {},
    body: JSON.stringify({ loginId })
  });
  return mapInvitationSummary(unwrapHalResource(response));
}

export async function acceptTeamInvitation(token: string | undefined, invitationId: string) {
  const resolvedToken = resolveToken(token);
  const response = await requestJson<{
    id: number;
    name: string;
    description?: string;
    role?: string;
    memberCount?: number;
    invitationCount?: number;
    updatedAt?: string;
  }>(`/api/teams/invitations/${invitationId}/accept`, {
    method: 'POST',
    headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}
  });
  return mapTeamSummary(unwrapHalResource(response));
}

export async function rejectTeamInvitation(token: string | undefined, invitationId: string) {
  const resolvedToken = resolveToken(token);
  await request<void>(`/api/teams/invitations/${invitationId}/reject`, {
    method: 'POST',
    headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}
  });
}

export async function exportSql(
  token: string | undefined,
  document: ErdDocument,
  dialect: Dialect
) {
  const resolvedToken = resolveToken(token);
  try {
    const response = await request<string>(`/api/erds/${document.id}/export/sql?dialect=${dialect}`, {
      headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const parsed = (await response.json()) as { sql: string };
      return parsed.sql;
    }
    return await response.text();
  } catch {
    return generateDdl(document, dialect);
  }
}
