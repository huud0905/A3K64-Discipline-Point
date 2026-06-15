export const DESKTOP_ROOT_PATH = '/desktop';

export const DESKTOP_PATHS = {
  dashboard: '/desktop/bang-diem-a3',
  settings: '/desktop/cai-dat',
  profile: '/desktop/profile',
  messages: '/desktop/messages',
  quickScore: '/desktop/nhap-diem-nhanh',
  ranking: '/desktop/xep-hang',
  contests: '/desktop/cuoc-thi-hien-tai',
  students: '/desktop/so-do-lop',
} as const;

export type DesktopRouteKey = keyof typeof DESKTOP_PATHS;

export function normalizeDesktopPath(pathname: string | undefined | null) {
  const path = pathname || DESKTOP_ROOT_PATH;
  return path.startsWith(DESKTOP_ROOT_PATH) ? path : DESKTOP_ROOT_PATH;
}

export function isDesktopPath(pathname: string | undefined | null) {
  return normalizeDesktopPath(pathname) !== DESKTOP_ROOT_PATH || pathname === DESKTOP_ROOT_PATH;
}

export function routeKeyFromPath(pathname: string | undefined | null): DesktopRouteKey | null {
  const path = normalizeDesktopPath(pathname);
  return (Object.entries(DESKTOP_PATHS).find(([, value]) => value === path)?.[0] as DesktopRouteKey | undefined) || null;
}
