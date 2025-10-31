import { useNavigation } from "@react-navigation/native";
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateData } from "react-native-calendars";
import { db } from "../../firebase";
import {
  endOfMonthISO,
  inputDateValue,
  normalizeForSearch,
  pad2,
  rideDateValue,
  startOfMonthISO,
  toISODate,
} from "./helpers";
import { MarkedDates, Ride } from "./types";

export type SearchModalState = {
  ymLocal: string;
  fromLocal: string;
  toLocal: string;
  textLocal: string;
  setYmLocal: (value: string) => void;
  setFromLocal: (value: string) => void;
  setToLocal: (value: string) => void;
  setTextLocal: (value: string) => void;
  apply: () => void;
  reset: () => void;
};

export type CalendarState = {
  visibleMonth: string;
  selectedDay: string;
  selectedDayLabel: string;
  hasRangeFilters: boolean;
  resultsCount: number;
  markedDates: MarkedDates;
  onDayPress: (day: DateData) => void;
  onMonthChange: (day: DateData) => void;
  collapsed: boolean;
};

export type KeywordState = {
  active: boolean;
  results: Ride[];
  loading: boolean;
  searchText: string;
};

export type RideLists = {
  forSelectedDay: Ride[];
  filtered: Ride[];
};

export type LoadingFlags = {
  initial: boolean;
  keyword: boolean;
};

export type CalendarActions = {
  openSearch: () => void;
  closeSearch: () => void;
  openRide: (ride: Ride) => void;
  toggleCalendar: () => void;
};

export type UseCalendarScreenResult = {
  actions: CalendarActions;
  searchModal: SearchModalState;
  calendar: CalendarState;
  keyword: KeywordState;
  rideLists: RideLists;
  loading: LoadingFlags;
  isSearchOpen: boolean;
};

export function useCalendarScreen(): UseCalendarScreenResult {
  const navigation = useNavigation<any>();

  const [currentMonth, setCurrentMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [visibleMonth, setVisibleMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });

  const [rides, setRides] = useState<Ride[]>([]);
  const [allRides, setAllRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [allRidesLoading, setAllRidesLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [yearMonthInput, setYearMonthInput] = useState<string>("");
  const [searchText, setSearchText] = useState<string>("");
  const [dateFromInput, setDateFromInput] = useState<string>("");
  const [dateToInput, setDateToInput] = useState<string>("");

  const [isSearchOpen, setSearchOpen] = useState(false);
  const [isCalendarCollapsed, setCalendarCollapsed] = useState(false);

  const [ymLocal, setYmLocal] = useState<string>("");
  const [fromLocal, setFromLocal] = useState<string>("");
  const [toLocal, setToLocal] = useState<string>("");
  const [textLocal, setTextLocal] = useState<string>("");

  useEffect(() => {
    if (isSearchOpen) {
      setYmLocal(yearMonthInput);
      setFromLocal(dateFromInput);
      setToLocal(dateToInput);
      setTextLocal(searchText);
    }
  }, [isSearchOpen, dateFromInput, dateToInput, searchText, yearMonthInput]);

  const monthChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSearch = useCallback(() => {
    setYearMonthInput("");
    setSearchText("");
    setDateFromInput("");
    setDateToInput("");
  }, []);

  const keywordActive = searchText.trim().length > 0;

  const keywordResults = useMemo(() => {
    if (!keywordActive) return [];
    const q = normalizeForSearch(searchText.trim());
    if (!q) return [];
    const source = allRides.length > 0 ? allRides : rides;
    const fromValue = inputDateValue(dateFromInput);
    const toValue = inputDateValue(dateToInput);

    const matches = source.filter((r) => {
      const value = rideDateValue(r);
      if (fromValue != null && (value == null || value < fromValue)) return false;
      if (toValue != null && (value == null || value > toValue)) return false;
      const title = normalizeForSearch(r.title);
      const place = normalizeForSearch(r.meetingPoint);
      return title.includes(q) || place.includes(q);
    });
    matches.sort((a, b) => {
      const tb = (b.dateTime || b.date)?.toDate?.()?.getTime() ?? 0;
      const ta = (a.dateTime || a.date)?.toDate?.()?.getTime() ?? 0;
      return tb - ta;
    });
    return matches;
  }, [keywordActive, rides, searchText, allRides, dateFromInput, dateToInput]);

  const allRidesFetchedRef = useRef(false);

  useEffect(() => {
    if (!keywordActive || allRidesFetchedRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        setAllRidesLoading(true);
        const col = collection(db, "rides");
        const snap = await getDocs(col);
        if (cancelled) return;
        const rows: Ride[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data() as any;
          rows.push({
            id: docSnap.id,
            title: d?.title ?? "",
            meetingPoint: d?.meetingPoint ?? "",
            date: d?.date ?? null,
            dateTime: d?.dateTime ?? null,
            status: (d?.status as Ride["status"]) ?? "active",
            archived: !!d?.archived,
          });
        });
        rows.sort((a, b) => {
          const tb = (b.dateTime || b.date)?.toDate?.()?.getTime() ?? 0;
          const ta = (a.dateTime || a.date)?.toDate?.()?.getTime() ?? 0;
          return tb - ta;
        });
        setAllRides(rows);
        allRidesFetchedRef.current = true;
      } catch (e) {
        if (!cancelled) console.error("all rides fetch", e);
      } finally {
        if (!cancelled) setAllRidesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [keywordActive]);

  const resetFiltersAndView = useCallback(() => {
    clearSearch();
    setYmLocal("");
    setFromLocal("");
    setToLocal("");
    setTextLocal("");

    const now = new Date();
    const month = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    const today = now.toISOString().slice(0, 10);

    setSelectedDay(today);
    setVisibleMonth(`${month}-01`);
    if (monthChangeTimer.current) {
      clearTimeout(monthChangeTimer.current);
      monthChangeTimer.current = null;
    }
    setCurrentMonth(month);
    setSearchOpen(false);
  }, [clearSearch]);

  useEffect(() => {
    setLoading(true);
    const start = new Date(startOfMonthISO(currentMonth));
    const end = new Date(endOfMonthISO(currentMonth));
    const col = collection(db, "rides");

    const qDateTime = query(
      col,
      where("dateTime", ">=", Timestamp.fromDate(start)),
      where("dateTime", "<=", Timestamp.fromDate(end)),
      orderBy("dateTime", "asc")
    );

    const qDate = query(
      col,
      where("date", ">=", Timestamp.fromDate(start)),
      where("date", "<=", Timestamp.fromDate(end)),
      orderBy("date", "asc")
    );

    const map = new Map<string, Ride>();

    const upsertFromSnap = (snap: any) => {
      snap.forEach((doc: any) => {
        const d = doc.data() as any;
        map.set(doc.id, {
          id: doc.id,
          title: d?.title ?? "",
          meetingPoint: d?.meetingPoint ?? "",
          date: d?.date ?? null,
          dateTime: d?.dateTime ?? null,
          status: (d?.status as Ride["status"]) ?? "active",
          archived: !!d?.archived,
        });
      });
      const rows = Array.from(map.values()).sort((a, b) => {
        const ta = (a.dateTime || a.date)?.toDate()?.getTime() ?? 0;
        const tb = (b.dateTime || b.date)?.toDate()?.getTime() ?? 0;
        return ta - tb;
      });
      setRides(rows);
      setLoading(false);
    };

    const unsub1 = onSnapshot(qDateTime, upsertFromSnap, () => setLoading(false));
    const unsub2 = onSnapshot(qDate, upsertFromSnap, () => setLoading(false));

    return () => {
      unsub1();
      unsub2();
    };
  }, [currentMonth]);

  const marked: MarkedDates = useMemo(() => {
    const out: MarkedDates = {};
    const qText = normalizeForSearch(searchText.trim());
    const from = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dateFromInput.trim())
      ? dateFromInput.trim()
      : null;
    const to = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dateToInput.trim())
      ? dateToInput.trim()
      : null;

    const ridesForMarks = rides.filter((r) => {
      const key = toISODate(r.dateTime || r.date);
      if (!key) return false;
      if (from && key < from) return false;
      if (to && key > to) return false;

      if (qText) {
        const t = normalizeForSearch(r.title);
        const p = normalizeForSearch(r.meetingPoint);
        if (!t.includes(qText) && !p.includes(qText)) return false;
      }
      return true;
    });

    const byDay = new Map<string, Ride[]>();
    for (const r of ridesForMarks) {
      const key = toISODate(r.dateTime || r.date);
      if (!key) continue;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(r);
    }

    const colorFor = (r: Ride) => (r.archived ? "#3B82F6" : r.status === "cancelled" ? "#DC2626" : "#10B981");

    byDay.forEach((list, day) => {
      const dots = list.slice(0, 3).map((r) => ({ color: colorFor(r) }));
      out[day] = {
        marked: dots.length > 0,
        dots,
        selected: day === selectedDay,
        selectedColor: "#111",
        selectedTextColor: "#fff",
      };
    });

    if (!out[selectedDay]) {
      out[selectedDay] = {
        selected: true,
        selectedColor: "#111",
        selectedTextColor: "#fff",
      };
    }

    return out;
  }, [rides, selectedDay, searchText, dateFromInput, dateToInput]);

  const listForSelected = useMemo(() => {
    const key = selectedDay;
    let base = rides.filter((r) => toISODate(r.dateTime || r.date) === key);

    const q = normalizeForSearch(searchText.trim());
    if (q) {
      base = base.filter(
        (r) => normalizeForSearch(r.title).includes(q) || normalizeForSearch(r.meetingPoint).includes(q)
      );
    }

    const fromValue = inputDateValue(dateFromInput);
    const toValue = inputDateValue(dateToInput);
    if (fromValue != null) {
      base = base.filter((r) => {
        const value = rideDateValue(r);
        return value != null && value >= fromValue;
      });
    }
    if (toValue != null) {
      base = base.filter((r) => {
        const value = rideDateValue(r);
        return value != null && value <= toValue;
      });
    }

    return base;
  }, [rides, selectedDay, searchText, dateFromInput, dateToInput]);

  const resultsAll = useMemo(() => {
    let base = [...rides];
    const fromValue = inputDateValue(dateFromInput);
    const toValue = inputDateValue(dateToInput);
    if (fromValue != null || toValue != null) {
      base = base.filter((r) => {
        const value = rideDateValue(r);
        if (value == null) return false;
        if (fromValue != null && value < fromValue) return false;
        if (toValue != null && value > toValue) return false;
        return true;
      });
    }

    const q = normalizeForSearch(searchText.trim());
    if (q) {
      base = base.filter(
        (r) => normalizeForSearch(r.title).includes(q) || normalizeForSearch(r.meetingPoint).includes(q)
      );
    }

    base.sort((a, b) => {
      const da = (a.dateTime || a.date)?.toDate()?.getTime() ?? 0;
      const db = (b.dateTime || b.date)?.toDate()?.getTime() ?? 0;
      return da - db;
    });
    return base;
  }, [rides, searchText, dateFromInput, dateToInput]);

  const hasRangeFilters = useMemo(() => {
    const f = dateFromInput.trim();
    const t = dateToInput.trim();
    const ym = yearMonthInput.trim();
    return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(f) ||
      /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(t) ||
      /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
  }, [dateFromInput, dateToInput, yearMonthInput]);

  const onDayPress = useCallback(
    (d: DateData) => {
      clearSearch();
      setYmLocal("");
      setFromLocal("");
      setToLocal("");
    setTextLocal("");

    setSelectedDay(d.dateString);

    const yyyymm = d.dateString.slice(0, 7);
    const newVisibleMonth = `${yyyymm}-01`;
    if (newVisibleMonth !== visibleMonth) {
      setVisibleMonth(newVisibleMonth);
    }
      if (yyyymm !== currentMonth) {
        if (monthChangeTimer.current) clearTimeout(monthChangeTimer.current);
        monthChangeTimer.current = setTimeout(() => setCurrentMonth(yyyymm), 120);
      }
    },
    [visibleMonth, currentMonth, clearSearch]
  );

  const onMonthChange = useCallback(
    (d: DateData) => {
      const yyyymm = d.dateString.slice(0, 7);
      setVisibleMonth(`${yyyymm}-01`);
      if (monthChangeTimer.current) clearTimeout(monthChangeTimer.current);
      monthChangeTimer.current = setTimeout(() => {
        if (yyyymm !== currentMonth) setCurrentMonth(yyyymm);
      }, 120);
    },
    [currentMonth]
  );

  const applySearchAndClose = useCallback(() => {
    const ym = ymLocal.trim();
    const from = fromLocal.trim();
    const to = toLocal.trim();
    const txt = textLocal.trim();
    setYearMonthInput(ym);
    setDateFromInput(from);
    setDateToInput(to);
    setSearchText(txt);

    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) {
      setVisibleMonth(`${ym}-01`);
      if (monthChangeTimer.current) clearTimeout(monthChangeTimer.current);
      monthChangeTimer.current = setTimeout(() => setCurrentMonth(ym), 120);
      setSelectedDay(`${ym}-01`);
    }
    setSearchOpen(false);
  }, [ymLocal, fromLocal, toLocal, textLocal]);

  const openRide = useCallback(
    (ride: Ride) => {
      navigation.navigate("RideDetails", { rideId: ride.id, title: ride.title });
    },
    [navigation]
  );

  const selectedDayLabel = useMemo(
    () => format(new Date(selectedDay), "eeee d MMMM yyyy", { locale: it }),
    [selectedDay]
  );

  const searchModal: SearchModalState = {
    ymLocal,
    fromLocal,
    toLocal,
    textLocal,
    setYmLocal,
    setFromLocal,
    setToLocal,
    setTextLocal,
    apply: applySearchAndClose,
    reset: resetFiltersAndView,
  };

  const calendar: CalendarState = {
    visibleMonth,
    selectedDay,
    selectedDayLabel,
    hasRangeFilters,
    resultsCount: resultsAll.length,
    markedDates: marked,
    onDayPress,
    onMonthChange,
    collapsed: isCalendarCollapsed,
  };

  const keyword: KeywordState = {
    active: keywordActive,
    results: keywordResults,
    loading: allRidesLoading && allRides.length === 0,
    searchText,
  };

  const rideLists: RideLists = {
    forSelectedDay: listForSelected,
    filtered: resultsAll,
  };

  const loadingFlags: LoadingFlags = {
    initial: loading && rides.length === 0,
    keyword: allRidesLoading && allRides.length === 0,
  };

  const actions: CalendarActions = {
    openSearch: () => setSearchOpen(true),
    closeSearch: () => setSearchOpen(false),
    openRide,
    toggleCalendar: () => setCalendarCollapsed((prev) => !prev),
  };

  return {
    actions,
    searchModal,
    calendar,
    keyword,
    rideLists,
    loading: loadingFlags,
    isSearchOpen,
  };
}
