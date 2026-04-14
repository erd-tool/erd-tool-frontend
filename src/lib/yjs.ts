import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { isServerErdId } from './erd-id';
import type { ErdDocument, UserSession } from './types';

type CollaborationStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
type JsonObject = Record<string, unknown>;

const COLLAB_URL = resolveCollaborationUrl();
const TEXT_KEYS = new Set([
  'title',
  'description',
  'name',
  'logicalName',
  'memo',
  'content',
  'defaultValue',
  'type',
  'length'
]);

export function useYjsCollaboration(
  erdId: string | undefined,
  document: ErdDocument | undefined,
  session: UserSession | null,
  onRemoteChange: (next: ErdDocument) => void
) {
  const [status, setStatus] = useState<CollaborationStatus>('idle');
  const [peers, setPeers] = useState(1);
  const [peerNames, setPeerNames] = useState<string[]>([]);
  const onRemoteChangeRef = useRef(onRemoteChange);
  const providerRef = useRef<{
    doc: Y.Doc;
    provider: WebsocketProvider;
    root: Y.Map<unknown>;
  } | null>(null);
  const lastSerializedRef = useRef('');
  const lastAppliedDocumentRef = useRef<ErdDocument | null>(null);

  useEffect(() => {
    onRemoteChangeRef.current = onRemoteChange;
  }, [onRemoteChange]);

  useEffect(() => {
    if (!session || !isServerErdId(erdId) || session.token === 'local-demo-token') {
      setStatus('idle');
      setPeers(1);
      setPeerNames(session ? [session.displayName] : []);
      lastAppliedDocumentRef.current = null;
      return undefined;
    }

    const doc = new Y.Doc();
    const provider = new WebsocketProvider(COLLAB_URL, erdId, doc, {
      connect: true,
      params: {
        access_token: session.token
      }
    });
    const root = doc.getMap('document');
    providerRef.current = { doc, provider, root };
    setStatus('connecting');
    provider.awareness.setLocalStateField('user', {
      id: session.id,
      name: session.displayName
    });

    const handleStatus = (event: { status: string }) => {
      setStatus(event.status === 'connected' ? 'connected' : 'disconnected');
    };

    const handleAwareness = () => {
      const nextNames = Array.from(provider.awareness.getStates().values())
        .map((state) => {
          const user = (state as { user?: { name?: string } }).user;
          return user?.name?.trim() || '이름 없음';
        })
        .filter((name, index, array) => array.indexOf(name) === index);
      setPeers(Math.max(1, provider.awareness.getStates().size));
      setPeerNames(nextNames.length ? nextNames : [session.displayName]);
    };

    const handleDocumentChange = () => {
      const nextDocument = deserializeDocument(root);
      if (!nextDocument) return;
      const serialized = JSON.stringify(nextDocument);
      if (serialized === lastSerializedRef.current) {
        return;
      }
      lastSerializedRef.current = serialized;
      lastAppliedDocumentRef.current = structuredClone(nextDocument);
      onRemoteChangeRef.current(nextDocument);
    };

    provider.on('status', handleStatus);
    provider.awareness.on('change', handleAwareness);
    root.observeDeep(handleDocumentChange);
    handleAwareness();

    return () => {
      root.unobserveDeep(handleDocumentChange);
      provider.awareness.off('change', handleAwareness);
      provider.off('status', handleStatus);
      provider.destroy();
      doc.destroy();
      providerRef.current = null;
    };
  }, [erdId, session]);

  useEffect(() => {
    const current = providerRef.current;
    if (!current || !document) return;
    const serialized = JSON.stringify(document);
    if (serialized === lastSerializedRef.current) return;

    lastSerializedRef.current = serialized;
    current.doc.transact(() => {
      syncObjectMap(
        current.root,
        document as unknown as JsonObject,
        lastAppliedDocumentRef.current as unknown as JsonObject | undefined
      );
    }, 'local-document-sync');
    lastAppliedDocumentRef.current = structuredClone(document);
  }, [document]);

  return {
    status,
    peers,
    peerNames,
    isConnected: status === 'connected'
  };
}

function syncObjectMap(target: Y.Map<unknown>, source: JsonObject, previous?: JsonObject) {
  const sourceKeys = new Set(Object.keys(source));
  Array.from(target.keys()).forEach((key) => {
    if (!sourceKeys.has(key)) {
      target.delete(key);
    }
  });

  Object.entries(source).forEach(([key, value]) => {
    syncValue(target, key, value, previous?.[key]);
  });
}

function syncValue(target: Y.Map<unknown>, key: string, value: unknown, previous?: unknown) {
  if (typeof value === 'string' && shouldUseTextNode(key)) {
    const current = target.get(key);
    const nextText = current instanceof Y.Text ? current : new Y.Text();
    if (!(current instanceof Y.Text)) {
      target.set(key, nextText);
    }
    syncText(nextText, typeof previous === 'string' ? previous : '', value);
    return;
  }

  if (Array.isArray(value)) {
    const current = target.get(key);
    const nextArray = current instanceof Y.Array ? current : new Y.Array<unknown>();
    if (!(current instanceof Y.Array)) {
      target.set(key, nextArray);
    }
    syncArray(nextArray, value, Array.isArray(previous) ? previous : undefined);
    return;
  }

  if (isPlainObject(value)) {
    const current = target.get(key);
    const nextMap = current instanceof Y.Map ? current : new Y.Map<unknown>();
    if (!(current instanceof Y.Map)) {
      target.set(key, nextMap);
    }
    syncObjectMap(nextMap, value, isPlainObject(previous) ? previous : undefined);
    return;
  }

  if (value === undefined) {
    target.delete(key);
    return;
  }

  if (target.get(key) !== value) {
    target.set(key, value);
  }
}

function syncArray(target: Y.Array<unknown>, source: unknown[], previous?: unknown[]) {
  if (source.every(isIdentifiedObject)) {
    syncObjectArray(
      target,
      source,
      previous?.filter(isIdentifiedObject) as Array<JsonObject & { id: string }> | undefined
    );
    return;
  }

  const current = target.toArray();
  if (JSON.stringify(current) === JSON.stringify(source)) {
    return;
  }
  target.delete(0, target.length);
  target.insert(0, source);
}

function syncObjectArray(
  target: Y.Array<unknown>,
  source: Array<JsonObject & { id: string }>,
  previous?: Array<JsonObject & { id: string }>
) {
  const currentIds = target
    .toArray()
    .map((item) => (item instanceof Y.Map ? item.get('id') : null));
  const expectedOrder = source.map((item) => item.id);

  if (
    currentIds.length !== expectedOrder.length ||
    currentIds.some((currentId, index) => currentId !== expectedOrder[index])
  ) {
    rebuildObjectArray(target, source);
    return;
  }

  const expectedIdSet = new Set(source.map((item) => item.id));

  for (let index = target.length - 1; index >= 0; index -= 1) {
    const current = target.get(index);
    const currentId = current instanceof Y.Map ? current.get('id') : undefined;
    if (typeof currentId !== 'string' || !expectedIdSet.has(currentId)) {
      target.delete(index, 1);
    }
  }

  source.forEach((item, targetIndex) => {
    let currentIndex = findArrayItemIndex(target, item.id);
    let entry = currentIndex >= 0 ? target.get(currentIndex) : undefined;

    if (!(entry instanceof Y.Map)) {
      entry = createSharedMap(item);
      target.insert(targetIndex, [entry]);
      currentIndex = targetIndex;
    }

    const previousItem = previous?.find((candidate) => candidate.id === item.id);
    syncObjectMap(entry as Y.Map<unknown>, item, previousItem);
  });
}

function rebuildObjectArray(target: Y.Array<unknown>, source: Array<JsonObject & { id: string }>) {
  if (target.length > 0) {
    target.delete(0, target.length);
  }

  if (source.length > 0) {
    target.insert(0, source.map((item) => createSharedMap(item)));
  }
}

function createSharedMap(source: JsonObject) {
  const nextMap = new Y.Map<unknown>();
  Object.entries(source).forEach(([key, value]) => {
    const nextValue = createSharedValue(key, value);
    if (nextValue !== undefined) {
      nextMap.set(key, nextValue);
    }
  });
  return nextMap;
}

function createSharedArray(source: unknown[]) {
  const nextArray = new Y.Array<unknown>();
  if (source.length > 0) {
    nextArray.insert(
      0,
      source
        .map((item) => createSharedValue(undefined, item))
        .filter((item) => item !== undefined)
    );
  }
  return nextArray;
}

function createSharedText(value: string) {
  const nextText = new Y.Text();
  if (value.length > 0) {
    nextText.insert(0, value);
  }
  return nextText;
}

function createSharedValue(key: string | undefined, value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'string' && key && shouldUseTextNode(key)) {
    return createSharedText(value);
  }

  if (Array.isArray(value)) {
    return createSharedArray(value);
  }

  if (isPlainObject(value)) {
    return createSharedMap(value);
  }

  return value;
}

function syncText(target: Y.Text, previous: string, next: string) {
  const current = target.toString();
  if (current === next) {
    return;
  }

  const { start, previousSlice, nextSlice } = getStringPatch(previous, next);
  if (!previousSlice && !nextSlice) {
    return;
  }

  if (previousSlice) {
    target.delete(start, previousSlice.length);
  }
  if (nextSlice) {
    target.insert(start, nextSlice);
  }
}

function getStringPatch(previous: string, next: string) {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) {
    start += 1;
  }

  let previousEnd = previous.length - 1;
  let nextEnd = next.length - 1;
  while (previousEnd >= start && nextEnd >= start && previous[previousEnd] === next[nextEnd]) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  return {
    start,
    previousSlice: previous.slice(start, previousEnd + 1),
    nextSlice: next.slice(start, nextEnd + 1)
  };
}

function findArrayItemIndex(target: Y.Array<unknown>, id: string) {
  const items = target.toArray();
  return items.findIndex((item) => item instanceof Y.Map && item.get('id') === id);
}

function deserializeDocument(root: Y.Map<unknown>): ErdDocument | null {
  const raw = readMap(root) as Partial<ErdDocument>;
  if (typeof raw.id !== 'string') {
    return null;
  }

  return {
    id: raw.id,
    title: typeof raw.title === 'string' ? raw.title : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    visibility: raw.visibility === 'public' ? 'public' : 'private',
    entities: Array.isArray(raw.entities) ? (raw.entities as ErdDocument['entities']) : [],
    relationships: Array.isArray(raw.relationships) ? (raw.relationships as ErdDocument['relationships']) : [],
    notes: Array.isArray(raw.notes) ? (raw.notes as ErdDocument['notes']) : [],
    viewport: isViewport(raw.viewport) ? raw.viewport : { x: 0, y: 0, zoom: 1 },
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    version: typeof raw.version === 'number' ? raw.version : 1
  };
}

function readMap(value: Y.Map<unknown>): JsonObject {
  const result: JsonObject = {};
  value.forEach((entry, key) => {
    result[key] = readValue(entry);
  });
  return result;
}

function readArray(value: Y.Array<unknown>) {
  return value.toArray().map((entry) => readValue(entry));
}

function readValue(value: unknown): unknown {
  if (value instanceof Y.Map) {
    return readMap(value);
  }
  if (value instanceof Y.Array) {
    return readArray(value);
  }
  if (value instanceof Y.Text) {
    return value.toString();
  }
  return value;
}

function shouldUseTextNode(key: string) {
  return TEXT_KEYS.has(key);
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIdentifiedObject(value: unknown): value is JsonObject & { id: string } {
  return isPlainObject(value) && typeof value.id === 'string';
}

function isViewport(value: unknown): value is ErdDocument['viewport'] {
  return (
    isPlainObject(value) &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.zoom === 'number'
  );
}

function resolveCollaborationUrl() {
  const configured = import.meta.env.VITE_COLLAB_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  try {
    const url = new URL(window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws/collaboration';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return 'ws://127.0.0.1/ws/collaboration';
  }
}
