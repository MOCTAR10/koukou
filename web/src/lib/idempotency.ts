import { useRef } from 'react';

function newKey(prefix: string): string {
  return `web-${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Key for a cash write. The same content keeps the same key until `settle()`,
 * so a retry after a lost response can't book the cash twice on the server;
 * changed content is a new operation and gets a new key.
 */
export function useIdempotencyKey(prefix: string): {
  keyFor: (content: unknown) => string;
  settle: () => void;
} {
  const current = useRef<{ signature: string; key: string } | null>(null);
  return {
    keyFor: (content) => {
      const signature = JSON.stringify(content);
      if (current.current?.signature !== signature) {
        current.current = { signature, key: newKey(prefix) };
      }
      return current.current.key;
    },
    settle: () => {
      current.current = null;
    },
  };
}
