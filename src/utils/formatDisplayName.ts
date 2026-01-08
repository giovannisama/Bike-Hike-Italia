export function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function formatDisplayName(
  firstName?: string | null,
  lastName?: string | null
): string {
  const cleanFirst = firstName ? normalizeSpaces(firstName) : "";
  const cleanLast = lastName ? normalizeSpaces(lastName) : "";

  if (cleanFirst && cleanLast) return `${cleanLast}, ${cleanFirst}`;
  if (cleanLast) return cleanLast;
  if (cleanFirst) return cleanFirst;
  return "";
}
