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
import { Dimensions, LayoutAnimation } from "react-native";
import { DateData } from "react-native-calendars";
import { db } from "../../firebase";
import {
  endOfMonthISO,
  inputDateValue,
  normalizeForSearch,
  pad2,
  rideDateValue,
  startOfMonthISO,
  toLocalISODate,
} from "./helpers";
import { MarkedDates, Ride } from "./types";

const sanitizeBikeList = (input: unknown): string[] => {
  if (Array.isArray(input)) {
    return input
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim());
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
};

const rideMatchesSearch = (ride: Ride, normalizedQuery: string) => {
  if (!normalizedQuery) return true;
  const bikesText =
    Array.isArray(ride.bikes) && ride.bikes.length > 0 ? ride.bikes.join(" ") : "";
  const haystack = [
    normalizeForSearch(ride.title),
    normalizeForSearch(ride.meetingPoint),
    normalizeForSearch(bikesText),
  ];
  return haystack.some((chunk) => chunk.includes(normalizedQuery));
};

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
  hasEventsForDay: (dateString: string) => boolean;
  hasEventsForSelectedDay: boolean;
  collapsed: boolean;
  quickTargets: {
    today: string;
    nextRide?: {
      dateString: string;
      label: string;
    };
    previousRide?: {
      dateString: string;
      label: string;
    };
  };
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
  clearFilters: () => void;
  goToDate: (dateString: string) => void;
};

export type UseCalendarScreenResult = {
  actions: CalendarActions;
  searchModal: SearchModalState;
  calendar: CalendarState;
  keyword: KeywordState;
  rideLists: RideLists;
  loading: LoadingFlags;
  isSearchOpen: boolean;
  filterSummary: string[];
  hasActiveFilters: boolean;
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
  const [isCalendarCollapsed, setCalendarCollapsed] = useState<boolean>(() => {
    const { height } = Dimensions.get("window");
    return height < 760;
  });

  const [ymLocal, setYmLocalRaw] = useState<string>("");
  const [fromLocal, setFromLocalRaw] = useState<string>("");
  const [toLocal, setToLocalRaw] = useState<string>("");
  const [textLocal, setTextLocal] = useState<string>("");

  const setYmLocal = useCallback(
    (value: string) => {
      setYmLocalRaw(value);
      if (value.trim()) {
        setFromLocalRaw("");
        setToLocalRaw("");
      }
    },
    [setFromLocalRaw, setToLocalRaw]
  );

  const setFromLocal = useCallback(
    (value: string) => {
      setFromLocalRaw(value);
      if (value.trim()) {
        setYmLocalRaw("");
      }
    },
    [setYmLocalRaw]
  );

  const setToLocal = useCallback(
    (value: string) => {
      setToLocalRaw(value);
      if (value.trim()) {
        setYmLocalRaw("");
      }
    },
    [setYmLocalRaw]
  );

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
      return rideMatchesSearch(r, q);
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
    if (allRidesFetchedRef.current) return;
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
            bikes: sanitizeBikeList(d?.bikes),
            date: d?.date ?? null,
            dateTime: d?.dateTime ?? null,
            status: (d?.status as Ride["status"]) ?? "active",
            archived: !!d?.archived,
            difficulty: d?.difficulty ?? null,
            guidaName: d?.guidaName ?? null,
            guidaNames: Array.isArray(d?.guidaNames) ? d.guidaNames : null,
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
  }, []);

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
    setCalendarCollapsed((prev) => {
      if (!prev) return prev;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      return false;
    });
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
          bikes: sanitizeBikeList(d?.bikes),
          date: d?.date ?? null,
          dateTime: d?.dateTime ?? null,
          status: (d?.status as Ride["status"]) ?? "active",
          archived: !!d?.archived,
          difficulty: d?.difficulty ?? null,
          guidaName: d?.guidaName ?? null,
          guidaNames: Array.isArray(d?.guidaNames) ? d.guidaNames : null,
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

  const applyCalendarFilters = (
    source: Ride[],
    {
      searchText,
      dateFrom,
      dateTo,
    }: { searchText: string; dateFrom: string; dateTo: string }
  ) => {
    const qText = normalizeForSearch(searchText.trim());
    const fromValue = inputDateValue(dateFrom);
    const toValue = inputDateValue(dateTo);
    const hasRange = fromValue != null || toValue != null;

    if (!qText && !hasRange) return source; // Fast path

    return source.filter((r) => {
      // 1. Date Range
      if (hasRange) {
        const value = rideDateValue(r);
        if (value == null) return false;
        if (fromValue != null && value < fromValue) return false;
        if (toValue != null && value > toValue) return false;
      }
      // 2. Search Text
      if (qText && !rideMatchesSearch(r, qText)) return false;

      return true;
    });
  };

  // ... inside useCalendarScreen ...

  // Policy: Calendar includes active + archived + cancelled; only decorates status.
  // Single source of truth for "visible" rides in the current month view
  const ridesVisible = useMemo(() => {
    return applyCalendarFilters(rides, {
      searchText,
      dateFrom: dateFromInput,
      dateTo: dateToInput,
    });
  }, [rides, searchText, dateFromInput, dateToInput]);

  // Single source for "all known rides" filtered (for navigation/sequence)
  const allRidesVisible = useMemo(() => {
    const source = allRides.length > 0 ? allRides : rides;
    return applyCalendarFilters(source, {
      searchText,
      dateFrom: dateFromInput,
      dateTo: dateToInput,
    });
  }, [allRides, rides, searchText, dateFromInput, dateToInput]);

  const marked: MarkedDates = useMemo(() => {
    const out: MarkedDates = {};

    const byDay = new Map<string, Ride[]>();
    for (const r of ridesVisible) {
      const key = toLocalISODate(r.dateTime || r.date);
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
  }, [ridesVisible, selectedDay]);

  const listForSelected = useMemo(() => {
    const key = selectedDay;
    // Just filter ridesVisible by day
    return ridesVisible.filter((r) => toLocalISODate(r.dateTime || r.date) === key);
  }, [ridesVisible, selectedDay]);

  const hasEventsForDay = useCallback(
    (dateString: string) =>
      ridesVisible.some((r) => toLocalISODate(r.dateTime || r.date) === dateString),
    [ridesVisible]
  );

  const hasEventsForSelectedDay = useMemo(
    () => listForSelected.length > 0,
    [listForSelected]
  );

  const resultsAll = useMemo(() => {
    // Return visible rides, sorted
    const list = [...ridesVisible];
    list.sort((a, b) => {
      const da = (a.dateTime || a.date)?.toDate()?.getTime() ?? 0;
      const db = (b.dateTime || b.date)?.toDate()?.getTime() ?? 0;
      return da - db;
    });
    return list;
  }, [ridesVisible]);

  const hasRangeFilters = useMemo(() => {
    const f = dateFromInput.trim();
    const t = dateToInput.trim();
    const ym = yearMonthInput.trim();
    return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(f) ||
      /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(t) ||
      /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
  }, [dateFromInput, dateToInput, yearMonthInput]);

  const applyDaySelection = useCallback(
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

      setCalendarCollapsed((prev) => prev);
    },
    [visibleMonth, currentMonth, clearSearch, rides, allRides]
  );

  const onDayPress = useCallback((d: DateData) => applyDaySelection(d), [applyDaySelection]);

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
    const trimmedYm = ymLocal.trim();
    const trimmedFrom = fromLocal.trim();
    const trimmedTo = toLocal.trim();
    const txt = textLocal.trim();

    let finalYm = trimmedYm;
    let finalFrom = trimmedFrom;
    let finalTo = trimmedTo;

    let finalHasYearMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(finalYm);
    const hasFromValue = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(finalFrom);
    const hasToValue = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(finalTo);

    if (finalHasYearMonth) {
      finalFrom = "";
      finalTo = "";
    } else if (hasFromValue || hasToValue) {
      finalYm = "";
      finalHasYearMonth = false;
    }

    const finalHasFrom = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(finalFrom);
    const finalHasTo = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(finalTo);
    const hasDateFilters = finalHasYearMonth || finalHasFrom || finalHasTo;

    setYearMonthInput(finalYm);
    setDateFromInput(finalFrom);
    setDateToInput(finalTo);
    setSearchText(txt);

    if (finalHasYearMonth) {
      setVisibleMonth(`${finalYm}-01`);
      if (monthChangeTimer.current) clearTimeout(monthChangeTimer.current);
      monthChangeTimer.current = setTimeout(() => setCurrentMonth(finalYm), 120);
      setSelectedDay(`${finalYm}-01`);
    }

    if (hasDateFilters) {
      setCalendarCollapsed((prev) => {
        if (prev) return prev;
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        return true;
      });
    }

    setSearchOpen(false);
  }, [ymLocal, fromLocal, toLocal, textLocal]);

  const openRide = useCallback(
    (ride: Ride) => {
      navigation.navigate("RideDetails", { rideId: ride.id, title: ride.title });
    },
    [navigation]
  );

  const goToDate = useCallback(
    (dateString: string) => {
      const [year, month, day] = dateString.split("-").map((v) => Number(v));
      if (!year || !month || !day) return;
      const payload: DateData = {
        dateString,
        day,
        month,
        year,
        timestamp: Date.UTC(year, month - 1, day),
      };
      applyDaySelection(payload);
    },
    [applyDaySelection]
  );

  const selectedDayLabel = useMemo(
    () => format(new Date(selectedDay), "eeee d MMMM yyyy", { locale: it }),
    [selectedDay]
  );

  const filterSummary = useMemo(() => {
    const chips: string[] = [];
    const term = searchText.trim();
    const from = dateFromInput.trim();
    const to = dateToInput.trim();
    const ym = yearMonthInput.trim();

    if (term) chips.push(`Testo: "${term}"`);
    if (from || to) {
      if (from && to) chips.push(`Dal ${from} al ${to}`);
      else if (from) chips.push(`Da ${from}`);
      else chips.push(`Fino al ${to}`);
    }
    if (ym) chips.push(`Mese: ${ym}`);

    return chips;
  }, [searchText, dateFromInput, dateToInput, yearMonthInput]);

  const rideDateSequence = useMemo(() => {
    const dates = new Set<string>();
    // Use allRidesVisible to ensure navigation respects filters globally
    allRidesVisible.forEach((ride) => {
      const key = toLocalISODate(ride.dateTime || ride.date);
      if (key) dates.add(key);
    });
    return Array.from(dates).sort();
  }, [allRidesVisible]);

  const quickNavigation = useMemo(() => {
    if (rideDateSequence.length === 0) {
      return { next: undefined, previous: undefined };
    }

    let previous: string | undefined;
    let next: string | undefined;

    for (let i = 0; i < rideDateSequence.length; i += 1) {
      const date = rideDateSequence[i];
      if (date < selectedDay) {
        previous = date;
        continue;
      }
      if (date > selectedDay) {
        next = date;
        break;
      }
    }

    if (!next) {
      next = rideDateSequence.find((date) => date > selectedDay);
    }

    if (!previous) {
      for (let i = rideDateSequence.length - 1; i >= 0; i -= 1) {
        const date = rideDateSequence[i];
        if (date < selectedDay) {
          previous = date;
          break;
        }
      }
    }

    const toTarget = (dateString: string | undefined) =>
      dateString
        ? {
          dateString,
          label: format(new Date(`${dateString}T00:00:00Z`), "d MMM", { locale: it }),
        }
        : undefined;

    return {
      next: toTarget(next),
      previous: toTarget(previous),
    };
  }, [rideDateSequence, selectedDay]);

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
    hasEventsForDay,
    hasEventsForSelectedDay,
    collapsed: isCalendarCollapsed,
    quickTargets: {
      today: new Date().toISOString().slice(0, 10),
      ...(quickNavigation.previous ? { previousRide: quickNavigation.previous } : {}),
      ...(quickNavigation.next ? { nextRide: quickNavigation.next } : {}),
    },
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
    toggleCalendar: () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setCalendarCollapsed((prev) => !prev);
    },
    clearFilters: () => resetFiltersAndView(),
    goToDate,
  };

  return {
    actions,
    searchModal,
    calendar,
    keyword,
    rideLists,
    loading: loadingFlags,
    isSearchOpen,
    filterSummary,
    hasActiveFilters: filterSummary.length > 0,
  };
}
