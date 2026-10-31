/**
 * Hash Chain for Evidence Integrity
 *
 * chain_n = sha256(chain_{n-1} || file_sha || seq || captured_at_iso)
 *
 * Pure TypeScript — uses subtle crypto (Web Crypto API, available in
 * both Node 20+ and React Native Hermes via polyfill).
 *
 * Property test: flip any 1 byte in any chunk → verify_chain returns false.
 */

export interface EvidenceChunk {
  seq: number;
  fileSha256: Uint8Array; // 32 bytes
  capturedAtIso: string;
  chainHash: Uint8Array; // 32 bytes (computed)
}

const GENESIS_HASH = new Uint8Array(32); // 32 zero bytes

/**
 * Compute chain hash for a chunk, given the previous chain hash.
 *
 * chain_n = sha256(prev_chain_hash || file_sha256 || seq_u32_be || captured_at_iso_utf8)
 */
export async function computeChainHash(
  prevChainHash: Uint8Array,
  fileSha256: Uint8Array,
  seq: number,
  capturedAtIso: string,
): Promise<Uint8Array> {
  // Build concatenated buffer
  const seqBuf = new ArrayBuffer(4);
  new DataView(seqBuf).setUint32(0, seq, false); // big-endian

  const isoBytes = new TextEncoder().encode(capturedAtIso);

  const totalLen =
    prevChainHash.byteLength +
    fileSha256.byteLength +
    seqBuf.byteLength +
    isoBytes.byteLength;

  const concat = new Uint8Array(totalLen);
  let offset = 0;
  concat.set(prevChainHash, offset); offset += prevChainHash.byteLength;
  concat.set(fileSha256, offset);    offset += fileSha256.byteLength;
  concat.set(new Uint8Array(seqBuf), offset); offset += seqBuf.byteLength;
  concat.set(isoBytes, offset);

  const hashBuffer = await crypto.subtle.digest('SHA-256', concat);
  return new Uint8Array(hashBuffer);
}

/**
 * Compute SHA-256 of arbitrary bytes.
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(buf);
}

/**
 * Verify an entire chain of evidence chunks.
 * Returns { ok: true } if valid, or { ok: false, brokenAt: seq } on first mismatch.
 */
export async function verifyChain(
  chunks: EvidenceChunk[],
): Promise<{ ok: true } | { ok: false; brokenAt: number }> {
  // Sort by seq ascending
  const sorted = [...chunks].sort((a, b) => a.seq - b.seq);

  let prevHash = GENESIS_HASH;

  for (const chunk of sorted) {
    const expected = await computeChainHash(
      prevHash,
      chunk.fileSha256,
      chunk.seq,
      chunk.capturedAtIso,
    );

    if (!arraysEqual(expected, chunk.chainHash)) {
      return { ok: false, brokenAt: chunk.seq };
    }

    prevHash = chunk.chainHash;
  }

  return { ok: true };
}

/**
 * Build a chain from scratch given file SHA-256 hashes and metadata.
 * Returns chunks with computed chainHash values.
 */
export async function buildChain(
  items: Array<{ seq: number; fileSha256: Uint8Array; capturedAtIso: string }>,
): Promise<EvidenceChunk[]> {
  const sorted = [...items].sort((a, b) => a.seq - b.seq);
  const chunks: EvidenceChunk[] = [];
  let prevHash = GENESIS_HASH;

  for (const item of sorted) {
    const chainHash = await computeChainHash(
      prevHash,
      item.fileSha256,
      item.seq,
      item.capturedAtIso,
    );
    chunks.push({ ...item, chainHash });
    prevHash = chainHash;
  }

  return chunks;
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  // Constant-time comparison to prevent timing attacks
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Convert a Uint8Array to a hex string.
 */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert a hex string to Uint8Array.
 */
export function fromHex(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < result.length; i++) {
    result[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return result;
}
