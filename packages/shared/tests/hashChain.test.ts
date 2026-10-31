import { describe, it, expect } from 'vitest';
import { fc } from '@fast-check/vitest';
import { buildChain, verifyChain, sha256, toHex } from '../src/chain/hashChain';

async function makeChunk(seq: number) {
  const data = new TextEncoder().encode(`chunk-data-${seq}`);
  const fileSha = await sha256(data);
  return { seq, fileSha256: fileSha, capturedAtIso: new Date(Date.now() + seq * 1000).toISOString() };
}

describe('HashChain', () => {
  it('single chunk verifies correctly', async () => {
    const items = [await makeChunk(0)];
    const chain = await buildChain(items);
    const result = await verifyChain(chain);
    expect(result.ok).toBe(true);
  });

  it('5-chunk chain verifies correctly', async () => {
    const items = await Promise.all([0,1,2,3,4].map(makeChunk));
    const chain = await buildChain(items);
    const result = await verifyChain(chain);
    expect(result.ok).toBe(true);
  });

  it('empty chain verifies', async () => {
    expect((await verifyChain([])).ok).toBe(true);
  });

  it('flipping 1 byte in fileSha256 breaks verification', async () => {
    const items = [await makeChunk(0), await makeChunk(1), await makeChunk(2)];
    const chain = await buildChain(items);
    // Tamper: flip one byte in chunk 1's fileSha256
    const tampered = chain.map((c, i) => {
      if (i === 1) {
        const newSha = new Uint8Array(c.fileSha256);
        newSha[0] = (newSha[0]! ^ 0xFF) & 0xFF;
        return { ...c, fileSha256: newSha };
      }
      return c;
    });
    const result = await verifyChain(tampered);
    expect(result.ok).toBe(false);
  });

  it('flipping 1 byte in chainHash breaks verification', async () => {
    const items = [await makeChunk(0), await makeChunk(1)];
    const chain = await buildChain(items);
    const tampered = chain.map((c, i) => {
      if (i === 0) {
        const newHash = new Uint8Array(c.chainHash);
        newHash[5] = (newHash[5]! ^ 0x01) & 0xFF;
        return { ...c, chainHash: newHash };
      }
      return c;
    });
    const result = await verifyChain(tampered);
    expect(result.ok).toBe(false);
  });

  it('reordering chunks breaks chain (wrong seq order)', async () => {
    const items = [await makeChunk(0), await makeChunk(1), await makeChunk(2)];
    const chain = await buildChain(items);
    // Swap seq numbers of chunk 0 and chunk 1 (keepchain_hash from original position)
    // This means chunk with seq=1's chainHash was computed with prev=chain[0], but now
    // verifyChain will try chunk with seq=0 first and compute with prev=genesis
    const tampered = chain.map((c, i) => {
      if (i === 0) return { ...c, seq: 1 }; // swap seq
      if (i === 1) return { ...c, seq: 0 }; // swap seq
      return c;
    });
    const result = await verifyChain(tampered);
    expect(result.ok).toBe(false);
  });

  it('deleting middle chunk breaks verification', async () => {
    const items = [await makeChunk(0), await makeChunk(1), await makeChunk(2)];
    const chain = await buildChain(items);
    // Remove chunk 1
    const withGap = [chain[0]!, chain[2]!];
    const result = await verifyChain(withGap);
    expect(result.ok).toBe(false);
  });

  it('brokenAt reports correct seq', async () => {
    const items = await Promise.all([0,1,2,3].map(makeChunk));
    const chain = await buildChain(items);
    const tampered = chain.map((c, i) => {
      if (i === 2) {
        const newSha = new Uint8Array(c.fileSha256);
        newSha[0] = (newSha[0]! ^ 0xFF);
        return { ...c, fileSha256: newSha };
      }
      return c;
    });
    const result = await verifyChain(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.brokenAt).toBe(2);
  });

  it('toHex produces 64-char string for SHA-256', async () => {
    const data = new TextEncoder().encode('test');
    const h = await sha256(data);
    expect(toHex(h)).toHaveLength(64);
  });
});
