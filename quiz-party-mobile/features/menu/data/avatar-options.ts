// Local avatar set for the native menu preview.
// The values intentionally mirror the backend whitelist so that profile create
// and touch requests cannot fail with a 422 because of avatar drift.
export const MENU_AVATARS: string[] = [
  '\u{1F436}',
  '\u{1F431}',
  '\u{1F42D}',
  '\u{1F439}',
  '\u{1F430}',
  '\u{1F98A}',
  '\u{1F43B}',
  '\u{1F43C}',
  '\u{1F428}',
  '\u{1F42F}',
  '\u{1F981}',
  '\u{1F42E}',
  '\u{1F437}',
  '\u{1F438}',
  '\u{1F435}',
];

export const DEFAULT_MENU_AVATAR = MENU_AVATARS[0];

export function normalizeMenuAvatar(value?: string | null) {
  // Normalize stale local state to the server-supported list before sending it
  // to the backend or rendering it in the native UI.
  return value && MENU_AVATARS.includes(value)
    ? value
    : DEFAULT_MENU_AVATAR;
}
