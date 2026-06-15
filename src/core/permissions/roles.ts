export const FULL_ACCESS_ROLES = ['gvcn', 'lop_truong', 'bi_thu'] as const;
export const SCORE_WEEK_CREATOR_ROLES = ['to_truong', ...FULL_ACCESS_ROLES] as const;
export const STUDENT_ROLE = 'hoc_sinh';

export type FullAccessRole = typeof FULL_ACCESS_ROLES[number];
export type ScoreWeekCreatorRole = typeof SCORE_WEEK_CREATOR_ROLES[number];

export function normalizeRole(role?: string | null) {
  return String(role || STUDENT_ROLE)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || STUDENT_ROLE;
}

export function hasFullAccessRole(role?: string | null) {
  return FULL_ACCESS_ROLES.includes(normalizeRole(role) as FullAccessRole);
}

export function canCreateScoreWeek(role?: string | null) {
  return SCORE_WEEK_CREATOR_ROLES.includes(normalizeRole(role) as ScoreWeekCreatorRole);
}

export function isStudentRole(role?: string | null) {
  return normalizeRole(role) === STUDENT_ROLE;
}

export function parseGroupNumber(value?: number | string | null) {
  const parsed = Number(String(value ?? '').replace(/[^0-9]/g, ''));
  return parsed === 1 || parsed === 2 || parsed === 3 || parsed === 4 ? parsed : null;
}
