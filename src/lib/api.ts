import { generateDdl } from './ddl';
import { nowIso } from './storage';
import type { Dialect, ErdDocument, ErdSummary, ErdVisibility, TeamSummary, UserSession } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

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

async function request<T>(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
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

function mapTeamSummary(payload: {
  id: number;
  name: string;
  description?: string;
  role?: string;
}): TeamSummary {
  return {
    id: String(payload.id),
    name: payload.name,
    description: payload.description ?? '',
    role: payload.role,
    memberCount: 1,
    invitationCount: 0,
    updatedAt: nowIso()
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
    ownerName: payload.teamName ?? '개인',
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
  const response = await requestMaybeJson<Array<{
    id: number;
    name: string;
    description?: string;
    role?: string;
  }>>('/api/teams', {
    headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}
  });
  return response?.map(mapTeamSummary) ?? null;
}

export async function fetchErds(token?: string) {
  const resolvedToken = resolveToken(token);
  const response = await requestMaybeJson<Array<{
    id: number;
    title: string;
    description?: string;
    visibility?: ErdVisibility;
    teamId?: number | null;
    teamName?: string | null;
    updatedAt: string;
  }>>('/api/erds', {
    headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}
  });
  return response?.map(mapErdSummary) ?? null;
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
  return response ? mapDocument(response) : null;
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
  return response ? mapDocument(response) : null;
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
  return mapErdSummary(response);
}

export async function createTeam(token: string | undefined, name: string) {
  const resolvedToken = resolveToken(token);
  const response = await requestJson<{
    id: number;
    name: string;
    description?: string;
    role?: string;
  }>('/api/teams', {
    method: 'POST',
    headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {},
    body: JSON.stringify({ name })
  });
  return mapTeamSummary(response);
}

export async function inviteTeamMember(token: string | undefined, teamId: string, email: string) {
  const resolvedToken = resolveToken(token);
  return requestJson<{ id: number; email: string; token: string; teamName: string }>(`/api/teams/${teamId}/invitations`, {
    method: 'POST',
    headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {},
    body: JSON.stringify({ email })
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
