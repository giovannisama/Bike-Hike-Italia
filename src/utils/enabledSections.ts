export type EnabledSectionKey = "ciclismo" | "trekking" | "bikeaut";

const KNOWN_KEYS: EnabledSectionKey[] = ["ciclismo", "trekking", "bikeaut"];

export const DEFAULT_ENABLED_SECTIONS: EnabledSectionKey[] = [
  "ciclismo",
  "trekking",
  "bikeaut",
];

export function normalizeEnabledSections(value: unknown): EnabledSectionKey[] | null {
  if (!Array.isArray(value)) return null;

  const normalized = value
    .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
    .filter((entry): entry is EnabledSectionKey =>
      KNOWN_KEYS.includes(entry as EnabledSectionKey)
    );

  const unique = Array.from(new Set(normalized));
  return unique;
}
