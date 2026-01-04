import type { FirestoreTimestamp } from "../types/firestore";

type FirestoreTimestampLike =
  | FirestoreTimestamp
  | { seconds: number; nanoseconds?: number; toDate?: () => Date };

export type FirestoreDateInput =
  | FirestoreTimestampLike
  | Date
  | number
  | null
  | undefined;

export function toDateSafe(value: FirestoreDateInput): Date | null {
  try {
    if (value == null) return null;
    if (value instanceof Date) return value;
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Date(value);
    }
    if (typeof value === "object") {
      const v = value as any;
      if (typeof v.toDate === "function") {
        const next = v.toDate();
        return next instanceof Date ? next : null;
      }
      const seconds = v.seconds;
      if (typeof seconds === "number" && Number.isFinite(seconds)) {
        const nanos = v.nanoseconds ?? 0;
        const millis = seconds * 1000 + Math.floor(nanos / 1e6);
        return new Date(millis);
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function toMillisSafe(value: FirestoreDateInput): number | null {
  try {
    if (value == null) return null;

    if (typeof value === "number" && Number.isFinite(value)) return value;

    if (value instanceof Date) {
      const millis = value.getTime();
      return Number.isFinite(millis) ? millis : null;
    }

    const v = value as any;
    if (typeof v?.seconds === "number") {
      const nanos = typeof v?.nanoseconds === "number" ? v.nanoseconds : 0;
      const millis = v.seconds * 1000 + Math.floor(nanos / 1e6);
      return Number.isFinite(millis) ? millis : null;
    }

    // Fallback via toDateSafe logic locally to avoid recursion
    if (typeof v === "object" && typeof v.toDate === "function") {
      const d = v.toDate();
      if (d instanceof Date) {
        const millis = d.getTime();
        return Number.isFinite(millis) ? millis : null;
      }
    }

    return null;
  } catch (e) {
    if (__DEV__) console.warn("toMillisSafe failed", e);
    return null;
  }
}
