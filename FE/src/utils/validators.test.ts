import { describe, expect, it } from 'vitest';

import { isValidUuid } from './validators';

describe('validators', () => {
  it('accepts canonical UUID strings', () => {
    expect(isValidUuid('8c9c0611-67d7-4d84-9bd5-b9053aab319d')).toBe(true);
  });

  it('rejects malformed UUID strings', () => {
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('8c9c061167d74d849bd5b9053aab319d')).toBe(false);
  });
});
