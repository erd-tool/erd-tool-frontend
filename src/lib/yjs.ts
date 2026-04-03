import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { isServerErdId } from './erd-id';
import type { ErdDocument, UserSession } from './types';

type CollaborationStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

const COLLAB_URL = resolveCollaborationUrl();

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
    snapshot: Y.Map<unknown>;
  } | null>(null);
  const lastSerializedRef = useRef('');

  useEffect(() => {
    onRemoteChangeRef.current = onRemoteChange;
  }, [onRemoteChange]);

  useEffect(() => {
    if (!session || !isServerErdId(erdId) || session.token === 'local-demo-token') {
      setStatus('idle');
      return undefined;
    }

    const doc = new Y.Doc();
    const provider = new WebsocketProvider(COLLAB_URL, erdId, doc, {
      connect: true,
      params: {
        access_token: session.token
      }
    });
    const snapshot = doc.getMap('snapshot');
    providerRef.current = { doc, provider, snapshot };
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

    const handleSnapshot = () => {
      const raw = snapshot.get('document');
      if (typeof raw !== 'string') return;
      try {
        const next = JSON.parse(raw) as ErdDocument;
        if (JSON.stringify(next) !== lastSerializedRef.current) {
          onRemoteChangeRef.current(next);
        }
      } catch {
        setStatus('error');
      }
    };

    provider.on('status', handleStatus);
    provider.awareness.on('change', handleAwareness);
    snapshot.observe(handleSnapshot);

    return () => {
      snapshot.unobserve(handleSnapshot);
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
    current.snapshot.set('document', serialized);
  }, [document]);

  return {
    status,
    peers,
    peerNames,
    isConnected: status === 'connected'
  };
}

function resolveCollaborationUrl() {
  const configured = import.meta.env.VITE_COLLAB_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  try {
    const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || window.location.origin;
    const url = new URL(apiBase, window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws/collaboration';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return 'ws://localhost:8080/ws/collaboration';
  }
}
