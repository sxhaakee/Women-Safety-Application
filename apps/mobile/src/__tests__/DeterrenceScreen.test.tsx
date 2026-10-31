jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { STROBE_HZ } from '../screens/DeterrenceScreen';

describe('DeterrenceScreen Safety & Constraints', () => {
  test('STROBE_HZ must strictly be <= 3.0 Hz for photosensitive epilepsy safety (WCAG 2.3.1)', () => {
    expect(STROBE_HZ).toBeLessThanOrEqual(3.0);
    expect(STROBE_HZ).toBe(2.5);
  });

  test('STROBE interval must be >= 333ms to enforce <= 3 Hz', () => {
    const intervalMs = Math.round(1000 / STROBE_HZ);
    expect(intervalMs).toBeGreaterThanOrEqual(333);
    expect(intervalMs).toBe(400);
  });
});
