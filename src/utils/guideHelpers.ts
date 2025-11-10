export type GuideSource = {
  guidaName?: string | null;
  guidaNames?: string[] | null | undefined;
};

const DEFAULT_SEPARATOR = ";";

/**
 * Split the raw guides text entered by admins. It prefers the semicolon
 * separator but gracefully falls back to commas for legacy content.
 */
export function splitGuideInput(raw: string): string[] {
  if (!raw) return [];
  const hasSemicolon = raw.includes(";");
  const hasComma = raw.includes(",");
  const separator = hasSemicolon ? ";" : hasComma ? "," : DEFAULT_SEPARATOR;
  return raw
    .split(separator)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

/**
 * Returns the main guide (first) and the full, ordered list of guides.
 */
export function deriveGuideSummary(source: GuideSource) {
  const byArray =
    Array.isArray(source?.guidaNames) && source.guidaNames.length > 0
      ? source.guidaNames.map((n) => (n ?? "").toString().trim()).filter(Boolean)
      : [];
  const mainFromField = (source?.guidaName ?? "").toString().trim();

  if (mainFromField) {
    if (byArray.length === 0) return { main: mainFromField, all: [mainFromField] };
    return { main: mainFromField, all: byArray };
  }

  if (byArray.length > 0) {
    return { main: byArray[0], all: byArray };
  }

  return { main: null as string | null, all: [] as string[] };
}

export function formatGuideList(names?: string[] | null, separator = `${DEFAULT_SEPARATOR} `) {
  if (!Array.isArray(names) || names.length === 0) return "";
  return names
    .map((name) => (name ?? "").toString().trim())
    .filter(Boolean)
    .join(separator);
}
