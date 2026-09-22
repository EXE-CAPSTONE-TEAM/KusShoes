import { describe, expect, it } from 'vitest';

import { getSettingTabFromSearch } from './settingsNavigation';

describe('settings navigation', () => {
  it.each([
    ['?tab=profile', 'profile'],
    ['?tab=security', 'security'],
    ['?tab=privacy', 'privacy'],
  ])('reads %s as the %s tab', (search, expected) => {
    expect(getSettingTabFromSearch(search)).toBe(expected);
  });

  it('falls back to profile for missing or unsupported tabs', () => {
    expect(getSettingTabFromSearch('')).toBe('profile');
    expect(getSettingTabFromSearch('?tab=unknown')).toBe('profile');
  });
});
