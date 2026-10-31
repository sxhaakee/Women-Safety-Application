import { describe, it, expect } from 'vitest';
import { en, hi, kn, type I18nCatalog } from '../src/i18n/catalogs';

function getAllLeafKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    getAllLeafKeys(v, prefix ? `${prefix}.${k}` : k)
  );
}

describe('I18n key parity', () => {
  const enKeys = getAllLeafKeys(en).filter(k => k !== 'reviewed').sort();
  const hiKeys = getAllLeafKeys(hi).filter(k => k !== 'reviewed').sort();
  const knKeys = getAllLeafKeys(kn).filter(k => k !== 'reviewed').sort();

  it('hi has same keys as en', () => {
    expect(hiKeys).toEqual(enKeys);
  });

  it('kn has same keys as en', () => {
    expect(knKeys).toEqual(enKeys);
  });

  it('no key has empty string value in en', () => {
    const allLeaves = getAllLeafKeys(en).filter(k => k !== 'reviewed');
    for (const key of allLeaves) {
      const parts = key.split('.');
      let val: unknown = en;
      for (const p of parts) val = (val as Record<string, unknown>)[p];
      expect(typeof val === 'string' && val.length > 0, `en.${key} is empty`).toBe(true);
    }
  });

  it('hi and kn are marked reviewed:false', () => {
    expect(hi.reviewed).toBe(false);
    expect(kn.reviewed).toBe(false);
  });

  it('en is marked reviewed:true', () => {
    expect(en.reviewed).toBe(true);
  });
});
