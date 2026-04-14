export const storageKeys = {
  session: 'erd-tool.session',
  teams: 'erd-tool.teams',
  erds: 'erd-tool.erds',
  documents: 'erd-tool.documents',
  activeErdId: 'erd-tool.active-erd-id'
} as const;

export function loadJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createRandomToken(length: number) {
  const secureCrypto = globalThis.crypto;
  if (typeof secureCrypto?.randomUUID === 'function') {
    return secureCrypto.randomUUID().replaceAll('-', '').slice(0, length);
  }

  if (typeof secureCrypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    secureCrypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
  }

  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.slice(0, length);
}

export function createId(prefix: string) {
  return `${prefix}_${createRandomToken(10)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
