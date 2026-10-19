/** Generated illustrations keyed by ID (WSC employees, and the made-up recruiters); DiceBear Notionists, CC0. */
export const AVATAR: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('./assets/avatars/*.svg', { eager: true, query: '?url', import: 'default' })).map(([path, url]) => [
    path.replace(/^.*\/(.+)\.svg$/, '$1'),
    url as string,
  ]),
);

/** The avatar for an employee or recruiter ID; undefined (initials shown) for any ID without one. */
export const avatarFor = (id: string): string | undefined => (Object.hasOwn(AVATAR, id) ? AVATAR[id] : undefined);

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join('');
