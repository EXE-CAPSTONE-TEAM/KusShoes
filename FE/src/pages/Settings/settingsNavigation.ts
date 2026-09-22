export const SETTINGS_TABS = ['profile', 'security', 'privacy', 'appearance'] as const;

export type SettingTab = (typeof SETTINGS_TABS)[number];

export const DEFAULT_SETTING_TAB: SettingTab = 'profile';

export function getSettingTabFromSearch(search: string): SettingTab {
  const requestedTab = new URLSearchParams(search).get('tab');

  return SETTINGS_TABS.includes(requestedTab as SettingTab)
    ? (requestedTab as SettingTab)
    : DEFAULT_SETTING_TAB;
}
