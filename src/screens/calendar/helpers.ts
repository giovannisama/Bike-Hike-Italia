import { Timestamp } from "firebase/firestore";

export function startOfMonthISO(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m - 1, 1, 0, 0, 0, 0);
  return d.toISOString();
}

export function endOfMonthISO(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m, 0, 23, 59, 59, 999);
  return d.toISOString();
}

export function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toISODate(ts?: Timestamp | null) {
  if (!ts?.toDate) return null;
  const d = ts.toDate();
  return d.toISOString().slice(0, 10);
}

// FIX: Timezone-safe key (YYYY-MM-DD based on Local Time)
export function toLocalISODate(ts?: Timestamp | null) {
  if (!ts?.toDate) return null;
  const d = ts.toDate();
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${y}-${m}-${dd}`;
}

export function rideDateValue(ride: { date?: Timestamp | null; dateTime?: Timestamp | null }) {
  const ts = ride.dateTime ?? ride.date;
  if (!ts?.toDate) return null;
  const d = ts.toDate();
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

export function inputDateValue(raw: string) {
  const s = raw.trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function normalizeForSearch(value?: string) {
  return (value || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
