const ACTION_GREEN = "#22c55e";

export type DifficultyMeta = {
  label: string;
  color: string;
};

export const getDifficultyMeta = (difficulty?: string | null): DifficultyMeta => {
  const label = difficulty || "—";
  const d = (difficulty || "").toLowerCase();
  if (d.includes("facile")) return { label, color: ACTION_GREEN };
  if (d.includes("medio") || d.includes("moderato")) return { label, color: "#f97316" };
  if (d.includes("difficile") || d.includes("impegnativo")) return { label, color: "#ef4444" };
  if (d.includes("estremo")) return { label, color: "#000000" };
  return { label, color: "#94a3b8" };
};

