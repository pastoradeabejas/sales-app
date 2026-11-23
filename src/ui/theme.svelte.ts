// Applies the stored appearance to <html data-theme> and follows the system.
import { parseThemePref, resolveTheme, themeStorageKey, type ThemePref } from './theme.ts';

const media = matchMedia('(prefers-color-scheme: dark)');

export const appearance = $state({ pref: parseThemePref(localStorage.getItem(themeStorageKey)) });

function apply() {
  document.documentElement.dataset.theme = resolveTheme(appearance.pref, media.matches);
}

export function setThemePref(pref: ThemePref) {
  appearance.pref = pref;
  localStorage.setItem(themeStorageKey, pref);
  apply();
}

export function initTheme() {
  apply();
  media.addEventListener('change', apply);
}
