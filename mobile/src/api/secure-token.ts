/** Synchronous store for the auth token only (encrypted on device). */
export interface SecureTokenStore {
  get(): string | null;
  set(token: string): void;
  remove(): void;
}

/**
 * Web and unit tests (node): no secure store. The whole session, token
 * included, stays in `localStorage` / memory. iOS/Android resolve
 * `secure-token.native.ts` (Metro platform extension) instead of this file.
 */
export const secureToken: SecureTokenStore | null = null;
