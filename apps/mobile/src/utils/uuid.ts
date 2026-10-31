import * as Crypto from 'expo-crypto';

/**
 * Universal RFC 4122 UUID v4 generator for Expo Go, Dev Client, and Web.
 * Guarantees a valid UUID without throwing crypto.getRandomValues errors.
 */
export function generateUUID(): string {
  try {
    if (Crypto && typeof Crypto.randomUUID === 'function') {
      return Crypto.randomUUID();
    }
  } catch {
    // Continue to fallback
  }

  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  // Deterministic entropy fallback based on high-resolution timer
  let d = Date.now();
  let d2 = (typeof performance !== 'undefined' && performance.now && Math.floor(performance.now() * 1000)) || 1337;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    let r = (d + d2) % 16;
    d = Math.floor(d / 16);
    d2 = Math.floor(d2 / 7);
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}
