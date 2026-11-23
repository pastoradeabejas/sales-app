// Appearance: Light · Dark · System (spec §10). Pure: no DOM.

export type ThemePref = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

export const themeStorageKey = 'theme';

export function parseThemePref(stored: string | null | undefined): ThemePref {
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
}
