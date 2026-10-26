/**
 * Age is always computed from the date of birth, never stored — a stored age
 * goes stale. Returns whole years completed as of `at` (default: today), or
 * null for missing/invalid dates.
 */
export function ageFrom(dateOfBirth: string | undefined, at: Date = new Date()): number | null {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    return null;
  }
  const [year, month, day] = dateOfBirth.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (
    birth.getUTCFullYear() !== year ||
    birth.getUTCMonth() !== month - 1 ||
    birth.getUTCDate() !== day
  ) {
    return null;
  }
  let age = at.getUTCFullYear() - year;
  const beforeBirthday =
    at.getUTCMonth() < month - 1 ||
    (at.getUTCMonth() === month - 1 && at.getUTCDate() < day);
  if (beforeBirthday) {
    age -= 1;
  }
  return age < 0 ? null : age;
}