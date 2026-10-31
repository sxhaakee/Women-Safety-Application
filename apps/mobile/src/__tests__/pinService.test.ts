import { validatePin } from '../services/pinService';

describe('PinService Validation & Security', () => {
  test('rejects PINs that are not 6 digits', () => {
    expect(validatePin('1234').ok).toBe(false);
    expect(validatePin('1234567').ok).toBe(false);
    expect(validatePin('abcdef').ok).toBe(false);
  });

  test('rejects weak repetitive PINs', () => {
    expect(validatePin('000000').ok).toBe(false);
    expect(validatePin('111111').ok).toBe(false);
  });

  test('rejects sequential PINs', () => {
    expect(validatePin('123456').ok).toBe(false);
    expect(validatePin('654321').ok).toBe(false);
  });

  test('accepts strong 6-digit PINs', () => {
    expect(validatePin('829401').ok).toBe(true);
    expect(validatePin('710385').ok).toBe(true);
  });
});
