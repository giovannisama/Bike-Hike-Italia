import { useNavigation } from "@react-navigation/native";
import useCurrentProfile from "../../hooks/useCurrentProfile";
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
import { UI } from "../../components/Screen";
import {
  endOfMonthISO,
  inputDateValue,
  normalizeForSearch,
  pad2,
  rideDateValue,
  startOfMonthISO,
  toLocalISODate,
  getFilterTitle,
  MONTH_NAMES,
} from "./helpers";
import { MarkedDates, Ride } from "./types";

export type SocialCalendarEvent = {
  id: string;
  title?: string;
  meetingPlaceText?: string;
  organizerName?: string;
  startAt?: Timestamp | null;
  status?: "active" | "archived" | "cancelled";
};

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
  filterTitle: string;
  hasRangeFilters: boolean;
  resultsCount: number;
  markedDates: MarkedDates;
  onDayPress: (day: DateData) => void;
  onMonthChange: (day: DateData) => void;
  hasEventsForDay: (dateString: string) => boolean;
  hasEventsForSelectedDay: boolean;
  collapsed: boolean;
  isFilteredView: boolean;
  viewMode: "month" | "day";
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
  socialForSelectedDay: SocialCalendarEvent[];
  tripsForSelectedDay: SocialCalendarEvent[];
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
  openDayPage: (date: string) => void;
  closeDayPage: () => void;
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
  const { canSeeCiclismo, canSeeTrekking, canSeeViaggi } = useCurrentProfile();

  const [currentMonth, setCurrentMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [visibleMonth, setVisibleMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });

  const [rides, setRides] = useState<Ride[]>([]); // Contains both rides and treks for the month
  const [socialEvents, setSocialEvents] = useState<SocialCalendarEvent[]>([]);
  const [tripEvents, setTripEvents] = useState<SocialCalendarEvent[]>([]); // Reusing SocialCalendarEvent structure for Trips as they are similar enough for calendar view
  const [loading, setLoading] = useState(true);
  const [allRides, setAllRides] = useState<Ride[]>([]);
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
  /* --- STATE DEFINITIONS --- */
  const [isFilteredView, setFilteredView] = useState(false);
  const [viewMode, setViewMode] = useState<"month" | "day">("month");

  /* --- COMPATIBILITY / HELPERS --- */
  // ... (Restore missing helper functions and state if any were lost)

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
    if (!canSeeCiclismo) {
      allRidesFetchedRef.current = false;
      setAllRides([]);
      setAllRidesLoading(false);
      return;
    }
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
  }, [canSeeCiclismo, canSeeTrekking]);

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
    setFilteredView(false);
    setSearchOpen(false);
    setViewMode("month");
  }, [clearSearch]);

  useEffect(() => {
    setLoading(true);
    const start = new Date(startOfMonthISO(currentMonth));
    const end = new Date(endOfMonthISO(currentMonth));
    const col = collection(db, "rides");
    const socialCol = collection(db, "social_events");
    const tripsCol = collection(db, "trips");

    const map = new Map<string, Ride>();
    const unsubs: Array<() => void> = [];

    if (canSeeCiclismo) {
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

      const upsertFromSnap = (snap: any) => {
        snap.forEach((doc: any) => {
          const d = doc.data() as any;
          const status = (d?.status as Ride["status"]) ?? "active";
          if (status === "cancelled") return; // Filter out cancelled

          map.set(doc.id, {
            id: doc.id,
            title: d?.title ?? "",
            meetingPoint: d?.meetingPoint ?? "",
            bikes: sanitizeBikeList(d?.bikes),
            date: d?.date ?? null,
            dateTime: d?.dateTime ?? null,
            status,
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
      unsubs.push(unsub1, unsub2);
    } else {
      setRides([]);
    }

    const qSocial = query(
      socialCol,
      where("startAt", ">=", Timestamp.fromDate(start)),
      where("startAt", "<=", Timestamp.fromDate(end)),
      orderBy("startAt", "asc")
    );

    const unsubSocial = onSnapshot(
      qSocial,
      (snap) => {
        const rows: SocialCalendarEvent[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data() as any;
          const status = (d?.status as SocialCalendarEvent["status"]) ?? "active";
          if (status === "cancelled") return;
          rows.push({
            id: docSnap.id,
            title: d?.title ?? "",
            meetingPlaceText: d?.meetingPlaceText ?? "",
            organizerName: d?.organizerName ?? "",
            startAt: d?.startAt ?? null,
            status,
          });
        });
        setSocialEvents(rows);
        setLoading(false);
      },
      () => setLoading(false)
    );
    unsubs.push(unsubSocial);

    if (canSeeViaggi) {
      const qTrips = query(
        tripsCol,
        where("dateTime", ">=", Timestamp.fromDate(start)),
        where("dateTime", "<=", Timestamp.fromDate(end)),
        orderBy("dateTime", "asc")
      );

      const unsubTrips = onSnapshot(qTrips, (snap) => {
        const rows: SocialCalendarEvent[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data() as any;
          let status = (d?.status as SocialCalendarEvent["status"]) ?? "active";
          if (d?.archived) status = "archived";
          if (status === "cancelled") return; // Filter out cancelled trips

          rows.push({
            id: docSnap.id,
            title: d?.title ?? "",
            meetingPlaceText: d?.meetingPoint ?? "", // Mapped from meetingPoint
            organizerName: d?.guidaName ?? "", // Mapped from guidaName
            startAt: d?.dateTime ?? d?.date ?? null,
            status,
          });
        });
        setTripEvents(rows);
      }, () => { }); // No explicit loading update here to avoid flickering or race conditions, logic handles global loading mostly
      unsubs.push(unsubTrips);
    } else {
      setTripEvents([]);
    }

    if (canSeeTrekking) {
      const trekCol = collection(db, "treks");
      // Reuse query constraints (roughly same fields)
      const qDateTimeTrek = query(
        trekCol,
        where("dateTime", ">=", Timestamp.fromDate(start)),
        where("dateTime", "<=", Timestamp.fromDate(end)),
        orderBy("dateTime", "asc")
      );
      const qDateTrek = query(
        trekCol,
        where("date", ">=", Timestamp.fromDate(start)),
        where("date", "<=", Timestamp.fromDate(end)),
        orderBy("date", "asc")
      );

      const upsertTreks = (snap: any) => {
        snap.forEach((doc: any) => {
          const d = doc.data() as any;
          const status = (d?.status as Ride["status"]) ?? "active";
          if (status === "cancelled") return; // Filter out cancelled treks

          map.set(doc.id, {
            id: doc.id,
            title: d?.title ?? "",
            meetingPoint: d?.meetingPoint ?? "",
            bikes: [], // Trek has no bikes
            date: d?.date ?? null,
            dateTime: d?.dateTime ?? null,
            status,
            archived: !!d?.archived,
            difficulty: null, // Trek has difficulty in trek object, but Ride type expects standard diff? 
            // Actually Ride type has `trek` object now.
            guidaName: d?.guidaName ?? null,
            guidaNames: Array.isArray(d?.guidaNames) ? d.guidaNames : null,
            kind: "trek",
            trek: d?.trek,
          });
        });
        // Re-sort and set
        const rows = Array.from(map.values()).sort((a, b) => {
          const ta = (a.dateTime || a.date)?.toDate()?.getTime() ?? 0;
          const tb = (b.dateTime || b.date)?.toDate()?.getTime() ?? 0;
          return ta - tb;
        });
        setRides(rows);
        setLoading(false);
      };

      const unsubT1 = onSnapshot(qDateTimeTrek, upsertTreks, () => setLoading(false));
      const unsubT2 = onSnapshot(qDateTrek, upsertTreks, () => setLoading(false));
      unsubs.push(unsubT1, unsubT2);
    }

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [currentMonth, canSeeCiclismo, canSeeTrekking, canSeeViaggi]);

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

    const byDay = new Map<string, { rides: Ride[]; hasSocial: boolean; hasTrips: boolean }>();
    for (const r of ridesVisible) {
      const key = toLocalISODate(r.dateTime || r.date);
      if (!key) continue;
      if (!byDay.has(key)) byDay.set(key, { rides: [], hasSocial: false, hasTrips: false });
      byDay.get(key)!.rides.push(r);
    }

    for (const s of socialEvents) {
      const key = toLocalISODate(s.startAt);
      if (!key) continue;
      if (!byDay.has(key)) byDay.set(key, { rides: [], hasSocial: false, hasTrips: false });
      byDay.get(key)!.hasSocial = true;
    }

    for (const t of tripEvents) {
      const key = toLocalISODate(t.startAt);
      if (!key) continue;
      if (!byDay.has(key)) byDay.set(key, { rides: [], hasSocial: false, hasTrips: false });
      byDay.get(key)!.hasTrips = true;
    }

    byDay.forEach((entry, day) => {
      const dots: any[] = [];

      const hasCycling = entry.rides.some(r => r.kind !== "trek");
      const hasTrekking = entry.rides.some(r => r.kind === "trek");

      // 1. Cycling
      if (hasCycling) {
        dots.push({ color: UI.colors.eventCycling });
      }
      // 2. Trekking
      if (hasTrekking) {
        dots.push({ color: UI.colors.eventTrekking });
      }
      // 3. Trips (Viaggi)
      if (entry.hasTrips) {
        dots.push({ color: UI.colors.eventTravel });
      }
      // 4. Social
      if (entry.hasSocial) {
        dots.push({ color: UI.colors.eventSocial });
      }

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
  }, [ridesVisible, socialEvents, tripEvents, selectedDay]);

  const listForSelected = useMemo(() => {
    const key = selectedDay;
    const dayRides = ridesVisible.filter((r) => toLocalISODate(r.dateTime || r.date) === key);

    // Sort: Cycling First, then Trekking. Secondary sort by Time.
    dayRides.sort((a, b) => {
      const isTrekA = a.kind === "trek";
      const isTrekB = b.kind === "trek";
      if (isTrekA !== isTrekB) return isTrekA ? 1 : -1; // Ride (false) comes before Trek (true)

      const da = (a.dateTime || a.date)?.toDate()?.getTime() ?? 0;
      const db = (b.dateTime || b.date)?.toDate()?.getTime() ?? 0;
      return da - db;
    });

    return dayRides;
  }, [ridesVisible, selectedDay]);

  const socialForSelectedDay = useMemo(() => {
    const key = selectedDay;
    return socialEvents.filter((e) => toLocalISODate(e.startAt) === key);
  }, [socialEvents, selectedDay]);

  const tripsForSelectedDay = useMemo(() => {
    const key = selectedDay;
    return tripEvents.filter((e) => toLocalISODate(e.startAt) === key);
  }, [tripEvents, selectedDay]);

  const hasEventsForDay = useCallback(
    (dateString: string) =>
      ridesVisible.some((r) => toLocalISODate(r.dateTime || r.date) === dateString) ||
      socialEvents.some((e) => toLocalISODate(e.startAt) === dateString) ||
      tripEvents.some((e) => toLocalISODate(e.startAt) === dateString),
    [ridesVisible, socialEvents, tripEvents]
  );

  const hasEventsForSelectedDay = useMemo(
    () => listForSelected.length > 0 || socialForSelectedDay.length > 0 || tripsForSelectedDay.length > 0,
    [listForSelected, socialForSelectedDay, tripsForSelectedDay]
  );

  const resultsAll = useMemo(() => {
    // Return visible rides, sorted
    const list = [...ridesVisible];
    list.sort((a, b) => {
      // Keep search results time-sorted? Or grouped?
      // "Elenco degli eventi per giorno" implies day view specifically.
      // Search results might span multiple days, so pure time sort is often better.
      // But if consistency is desired, we can group.
      // Let's stick to TIME primarily for global search to avoid confusing date jumps.
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

  const openDayPage = useCallback((params: {
    dateString?: string;
    filtersApplied?: boolean;
  }) => {
    // 1. Position calendar if needed
    if (params.dateString) {
      const d = new Date(params.dateString);
      const payload: DateData = {
        dateString: params.dateString,
        day: d.getDate(),
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        timestamp: d.getTime()
      }
      // Reuse existing logic to set month/selected day without clearing search unless explicit
      if (!params.filtersApplied) {
        applyDaySelection(payload);
      } else {
        setSelectedDay(params.dateString);
        // Determine if we need to switch month
        const yyyymm = params.dateString.slice(0, 7);
        const currentVis = visibleMonth.slice(0, 7);
        if (yyyymm !== currentVis) {
          setVisibleMonth(`${yyyymm}-01`);
          setCurrentMonth(yyyymm);
        }
      }
    }

    // 2. Set mode
    if (params.filtersApplied) {
      setFilteredView(true);
    } else {
      // If standard day tap, we ensure filtered view is OFF
      if (isFilteredView) setFilteredView(false);
    }

    // 3. Switch view & collapse
    setViewMode("day");
    setCalendarCollapsed(true);
  }, [applyDaySelection, visibleMonth, isFilteredView]);

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

    setYearMonthInput(finalYm);
    setDateFromInput(finalFrom);
    setDateToInput(finalTo);
    setSearchText(txt);

    // Anchor calculation logic
    let anchorDate = selectedDay;
    if (finalHasYearMonth) {
      anchorDate = `${finalYm}-01`;
    } else if (finalFrom) {
      anchorDate = finalFrom;
    } else if (finalTo) {
      // If only TO is set, maybe anchor to TO? or Today? Let's use Today or TO.
      // Requirement said: "Da" se presente altrimenti "A", else today.
      anchorDate = finalTo;
    } else {
      // use today if no date filters
      anchorDate = new Date().toISOString().slice(0, 10);
    }

    setSearchOpen(false);

    // Defer the openDayPage call slightly to allow modal to close smoothly if needed, 
    // though React state updates are batched.
    // Calling directly is usually fine in RN unless simulating navigation.
    openDayPage({ dateString: anchorDate, filtersApplied: true });

  }, [ymLocal, fromLocal, toLocal, textLocal, selectedDay, openDayPage]);

  const openRide = useCallback(
    (ride: Ride) => {
      const isTrek = ride.kind === "trek";
      navigation.navigate("RideDetails", {
        rideId: ride.id,
        title: ride.title,
        collectionName: isTrek ? "treks" : "rides",
        kind: isTrek ? "trek" : "ride",
      });
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

  const closeDayPage = useCallback(() => {
    if (isFilteredView) {
      resetFiltersAndView();
    } else {
      setViewMode("month");
      setCalendarCollapsed(false);
    }
  }, [isFilteredView, resetFiltersAndView]);

  const selectedDayLabel = useMemo(
    () => format(new Date(selectedDay), "eeee d MMMM yyyy", { locale: it }),
    [selectedDay]
  );

  const filterTitle = useMemo(() => {
    return getFilterTitle(
      {
        yearMonth: yearMonthInput,
        dateFrom: dateFromInput,
        dateTo: dateToInput,
        searchText,
      },
      MONTH_NAMES
    );
  }, [yearMonthInput, dateFromInput, dateToInput, searchText]);

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

  // ... (rest of rideDateSequence and quickNavigation) ...

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
    openDayPage: (date) => openDayPage({ dateString: date }),
    closeDayPage
  };

  const calendar: CalendarState = {
    visibleMonth,
    selectedDay,
    selectedDayLabel,
    filterTitle,
    hasRangeFilters,
    resultsCount: resultsAll.length,
    markedDates: marked,
    onDayPress,
    onMonthChange,
    hasEventsForDay,
    hasEventsForSelectedDay,
    collapsed: isCalendarCollapsed,
    isFilteredView,
    viewMode, // Exposed
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
    socialForSelectedDay,
    tripsForSelectedDay,
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
