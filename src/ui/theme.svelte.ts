// Applies the stored appearance to <html data-theme> and follows the system.
import { parseThemePref, resolveTheme, themeStorageKey, type ThemePref } from './theme.ts';
import { parseTextScale, textScaleStorageKey } from './textSize.ts';

const media = matchMedia('(prefers-color-scheme: dark)');

export const appearance = $state({
  pref: parseThemePref(localStorage.getItem(themeStorageKey)),
  textScale: parseTextScale(localStorage.getItem(textScaleStorageKey)),
});

function apply() {
  document.documentElement.dataset.theme = resolveTheme(appearance.pref, media.matches);
  // Scales the whole UI (text, spacing, touch targets) like browser zoom.
  document.documentElement.style.zoom = appearance.textScale === 1 ? '' : String(appearance.textScale);
}

export function setThemePref(pref: ThemePref) {
  appearance.pref = pref;
  localStorage.setItem(themeStorageKey, pref);
  apply();
}

/** Text size from Settings, e.g. 1.2 = 120 %. */
export function setTextScale(scale: number) {
  appearance.textScale = parseTextScale(String(scale));
  localStorage.setItem(textScaleStorageKey, String(appearance.textScale));
  apply();
}

export function initTheme() {
  apply();
  media.addEventListener('change', apply);
}
