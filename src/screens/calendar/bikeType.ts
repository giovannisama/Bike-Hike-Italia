import { Ride } from "./types";

const normalizeBikeTypes = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter((v) => v.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }
  return [];
};

export const getBikeCategoryLabel = (ride: Ride): string | null => {
  const typeList = normalizeBikeTypes(ride.bikes);
  if (typeList.length === 0) return "Altro";

  const hasType = (t: string) =>
    typeList.some((x) => x.toLowerCase() === t.toLowerCase());

  const allowedExtras = ["enduro", "ebike"];
  const isStrictlyEnduro = typeList.every((t) =>
    allowedExtras.includes(t.toLowerCase())
  );

  if (hasType("Enduro") && isStrictlyEnduro) return "Enduro";
  if (typeList.length === 1 && hasType("BDC")) return "Bici da Corsa";
  if (hasType("MTB") || hasType("Gravel") || hasType("Ebike")) return "MTB/Gravel";

  return "Altro";
};

