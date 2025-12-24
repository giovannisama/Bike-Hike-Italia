import { Timestamp } from "firebase/firestore";

export const MONTH_NAMES = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];


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

export function getFilterTitle(
  filters: { yearMonth: string; dateFrom: string; dateTo: string; searchText: string },
  monthNames: string[]
): string {
  const parts: string[] = [];

  // 1. Anno-Mese
  if (filters.yearMonth) {
    const [y, m] = filters.yearMonth.split("-").map(Number);
    if (m >= 1 && m <= 12) {
      parts.push(`${monthNames[m - 1]} ${y}`);
    }
  }

  // 2. Intervallo date
  // Format: Dal 10 gennaio 2026 al 25 gennaio 2026
  if (filters.dateFrom || filters.dateTo) {
    const fromParts = filters.dateFrom ? filters.dateFrom.split("-").map(Number) : null;
    const toParts = filters.dateTo ? filters.dateTo.split("-").map(Number) : null;

    const fmt = (p: number[]) => {
      const dd = p[2];
      const mm = monthNames[p[1] - 1].toLowerCase();
      const yy = p[0];
      return `${dd} ${mm} ${yy}`;
    };

    if (fromParts && toParts) {
      parts.push(`Dal ${fmt(fromParts)} al ${fmt(toParts)}`);
    } else if (fromParts) {
      parts.push(`Dal ${fmt(fromParts)}`);
    } else if (toParts) {
      parts.push(`Fino al ${fmt(toParts)}`);
    }
  }

  // 3. Ricerca testo
  if (filters.searchText) {
    parts.push(`Ricerca: "${filters.searchText}"`);
  }

  return parts.join(" · ");
}
