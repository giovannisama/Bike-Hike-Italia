// src/screens/CalendarScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform, Modal } from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { collection, onSnapshot, query, where, orderBy, Timestamp, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useNavigation } from "@react-navigation/native";

import { Screen } from "../components/Screen";
import { SafeAreaView } from "react-native-safe-area-context";

type Ride = {
  id: string;
  title: string;
  meetingPoint: string;
  date?: Timestamp | null;
  dateTime?: Timestamp | null;
  status?: "active" | "cancelled";
  archived?: boolean;
};

type CalendarMarkedDate = {
  marked?: boolean;
  dots?: Array<{ color: string }>;
  selected?: boolean;
  selectedColor?: string;
  selectedTextColor?: string;
};

type CalendarMarkedDates = Record<string, CalendarMarkedDate>;


function startOfMonthISO(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number); // es. "2025-10"
  const d = new Date(y, m - 1, 1, 0, 0, 0, 0);
  return d.toISOString();
}
function endOfMonthISO(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m, 0, 23, 59, 59, 999); // ultimo giorno del mese
  return d.toISOString();
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function toISODate(ts?: Timestamp | null) {
  if (!ts?.toDate) return null;
  const d = ts.toDate();
  // YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

function rideDateValue(ride: Ride): number | null {
  const ts = ride.dateTime ?? ride.date;
  if (!ts?.toDate) return null;
  const d = ts.toDate();
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function inputDateValue(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export default function CalendarScreen() {
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

  // 🔎 Ricerca
  const [yearMonthInput, setYearMonthInput] = useState<string>(""); // formato YYYY-MM
  const [searchText, setSearchText] = useState<string>(""); // cerca per titolo o luogo
  const [dateFromInput, setDateFromInput] = useState<string>(""); // formato YYYY-MM-DD
  const [dateToInput, setDateToInput] = useState<string>("");   // formato YYYY-MM-DD

  const [isSearchOpen, setSearchOpen] = useState(false);

  // Stati LOCALI del modal (per evitare re-render della schermata principale mentre si digita)
  const [ymLocal, setYmLocal] = useState<string>("");
  const [fromLocal, setFromLocal] = useState<string>("");
  const [toLocal, setToLocal] = useState<string>("");
  const [textLocal, setTextLocal] = useState<string>("");

  // Quando apro il modal, sincronizzo i campi locali con i valori correnti dei filtri
  useEffect(() => {
    if (isSearchOpen) {
      setYmLocal(yearMonthInput);
      setFromLocal(dateFromInput);
      setToLocal(dateToInput);
      setTextLocal(searchText);
    }
  }, [isSearchOpen]);

  const applySearchAndClose = useCallback(() => {
    const ym = ymLocal.trim();
    const from = fromLocal.trim();
    const to = toLocal.trim();
    const txt = textLocal.trim();
    // Copia nei filtri globali SOLO quando si preme Applica
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

  const isYYYYMM = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
  const isYYYYMMDD = (s: string) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s);

  const goToYearMonth = useCallback(() => {
    const ym = yearMonthInput.trim();
    // valida formato YYYY-MM
    if (isYYYYMM(ym)) {
      // aggiorna subito il calendario visibile
      setVisibleMonth(`${ym}-01`);
      // aggiorna (leggermente in ritardo) il mese per la query
      if (monthChangeTimer.current) clearTimeout(monthChangeTimer.current);
      monthChangeTimer.current = setTimeout(() => setCurrentMonth(ym), 120);
      // opzionale: seleziona il primo giorno del mese cercato
      setSelectedDay(`${ym}-01`);
    }
  }, [yearMonthInput]);

  const normalizeForSearch = (s?: string) =>
    (s || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const clearSearch = useCallback(() => {
    setYearMonthInput("");
    setSearchText("");
    setDateFromInput("");
    setDateToInput("");
  }, []);

  // debounce per aggiornare il mese di query senza far "saltare" il layout
  const monthChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // 🔎 carica le uscite del mese corrente da ENTRAMBI i campi: `dateTime` e `date`
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

  // 🎯 markers per giorno (filtra per ricerca testuale e range date se attivi)
  const marked: CalendarMarkedDates = useMemo(() => {
    const out: CalendarMarkedDates = {};

    // Filtri attivi
    const qText = normalizeForSearch(searchText.trim());
    const from = isYYYYMMDD(dateFromInput.trim()) ? dateFromInput.trim() : null;
    const to = isYYYYMMDD(dateToInput.trim()) ? dateToInput.trim() : null;

    const ridesForMarks = rides.filter((r) => {
      const key = toISODate(r.dateTime || r.date);
      if (!key) return false;

      // Filtro range date (se presente)
      if (from && key < from) return false;
      if (to && key > to) return false;

      // Filtro testo (se presente)
      if (qText) {
        const t = normalizeForSearch(r.title);
        const p = normalizeForSearch(r.meetingPoint);
        if (!t.includes(qText) && !p.includes(qText)) return false;
      }
      return true;
    });

    // Raggruppa per giorno
    const byDay = new Map<string, Ride[]>();
    for (const r of ridesForMarks) {
      const key = toISODate(r.dateTime || r.date);
      if (!key) continue;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(r);
    }

    // Colori richiesti: Attive=Verde, Annullate=Rosso, Archiviate=Blu
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
    if (q) base = base.filter((r) => normalizeForSearch(r.title).includes(q) || normalizeForSearch(r.meetingPoint).includes(q));

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

  const hasRangeFilters = useMemo(() => {
    const f = dateFromInput.trim();
    const t = dateToInput.trim();
    const ym = yearMonthInput.trim();
    return isYYYYMMDD(f) || isYYYYMMDD(t) || isYYYYMM(ym);
  }, [dateFromInput, dateToInput, yearMonthInput]);

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
      base = base.filter((r) => normalizeForSearch(r.title).includes(q) || normalizeForSearch(r.meetingPoint).includes(q));
    }

    base.sort((a, b) => {
      const da = (a.dateTime || a.date)?.toDate()?.getTime() ?? 0;
      const db = (b.dateTime || b.date)?.toDate()?.getTime() ?? 0;
      return da - db;
    });

    return base;
  }, [rides, searchText, dateFromInput, dateToInput]);

  const keywordHeader = useMemo(() => {
    const term = searchText.trim();
    return (
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text style={styles.listTitle} numberOfLines={2}>
          {term ? `Risultati per "${term}"` : "Risultati"}
        </Text>
      </View>
    );
  }, [searchText]);

  const keywordEmpty = useMemo(() => {
    const term = searchText.trim();
    return (
      <View style={[styles.centerRow, { paddingHorizontal: 16, paddingVertical: 32 }]}>
        <Text style={{ color: "#6B7280", textAlign: "center" }}>
          {term ? `Nessuna uscita trovata per "${term}".` : "Nessun risultato."}
        </Text>
      </View>
    );
  }, [searchText]);

  const onDayPress = useCallback((d: DateData) => {
    // ✅ Quando l'utente seleziona una data dal calendario, azzeriamo QUALSIASI filtro attivo
    clearSearch();
    // azzero anche gli stati locali del modal, così alla prossima apertura risultano vuoti
    setYmLocal("");
    setFromLocal("");
    setToLocal("");
    setTextLocal("");

    // Seleziona il giorno
    setSelectedDay(d.dateString); // YYYY-MM-DD

    // Se il giorno appartiene ad un altro mese, aggiorno mese visibile e query
    const yyyymm = d.dateString.slice(0, 7);
    const newVisibleMonth = `${yyyymm}-01`;
    if (newVisibleMonth !== visibleMonth) {
      setVisibleMonth(newVisibleMonth);
    }
    if (yyyymm !== currentMonth) {
      if (monthChangeTimer.current) clearTimeout(monthChangeTimer.current);
      monthChangeTimer.current = setTimeout(() => setCurrentMonth(yyyymm), 120);
    }
  }, [visibleMonth, currentMonth, clearSearch]);

  const onMonthChange = useCallback((d: DateData) => {
    // d.dateString è YYYY-MM-DD → ricaviamo YYYY-MM
    const yyyymm = d.dateString.slice(0, 7);

    // Aggiorniamo SUBITO la parte visiva del calendario
    setVisibleMonth(`${yyyymm}-01`);

    // Rimandiamo di poco la query Firestore per evitare micro reflow del layout
    if (monthChangeTimer.current) clearTimeout(monthChangeTimer.current);
    monthChangeTimer.current = setTimeout(() => {
      if (yyyymm !== currentMonth) setCurrentMonth(yyyymm);
    }, 120);
  }, [currentMonth]);

  const openRide = useCallback(
    (ride: Ride) => {
      navigation.navigate("RideDetails", { rideId: ride.id, title: ride.title });
    },
    [navigation]
  );

  const renderKeywordItem = useCallback(
    ({ item }: { item: Ride }) => {
      const isCancelled = item.status === "cancelled";
      const isArchived = !!item.archived;
      const dateObj = item.dateTime?.toDate?.() ?? item.date?.toDate?.() ?? null;
      const dateLabel = dateObj
        ? format(dateObj, "EEEE d MMMM yyyy 'alle' HH:mm", { locale: it })
        : "Data da definire";

      return (
        <TouchableOpacity style={[styles.rideCard, { marginHorizontal: 12 }]} onPress={() => openRide(item)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rideDate} numberOfLines={1}>
              {dateLabel}
            </Text>
            <Text
              style={[
                styles.rideTitle,
                isCancelled && { textDecorationLine: "line-through", color: "#991B1B" },
                isArchived && { color: "#374151" },
              ]}
              numberOfLines={1}
            >
              {item.title || "Uscita"}
            </Text>
            <Text style={styles.ridePlace} numberOfLines={1}>
              {item.meetingPoint || "—"}
            </Text>
          </View>
          {isArchived ? (
            <Badge text="Arch." bg="#E5E7EB" fg="#374151" />
          ) : isCancelled ? (
            <Badge text="No" bg="#FEE2E2" fg="#991B1B" />
          ) : (
            <Badge text="OK" bg="#111" fg="#fff" />
          )}
        </TouchableOpacity>
      );
    },
    [openRide]
  );

  const headerRightBtn = (
    <TouchableOpacity onPress={() => setSearchOpen(true)} accessibilityRole="button">
      <Text style={{ color: "#fff", fontWeight: "800" }}>🔎 Cerca</Text>
    </TouchableOpacity>
  );

  const listHeader = useMemo(() => (
    <View>
      {/* Calendar */}
      <View style={{ overflow: "hidden", paddingHorizontal: 12 }} collapsable={false}>
        <Calendar
          key={`cal-${visibleMonth}`}
          current={visibleMonth}
          style={{ height: 360 }}
          hideExtraDays={false}
          enableSwipeMonths
          markingType="multi-dot"
          markedDates={marked}
          onDayPress={onDayPress}
          onMonthChange={onMonthChange}
          firstDay={1}
          theme={{
            todayTextColor: "#0EA5E9",
            arrowColor: "#111",
            monthTextColor: "#111",
            textMonthFontWeight: "700",
          }}
          dayComponent={({ date, state, marking, onDayPress: dayOnPress }: any) => {
            const info = marking || {};
            const dots = Array.isArray(info.dots) ? info.dots.slice(0, 3) : [];
            const key = `${(date as any).year}-${pad2((date as any).month)}-${pad2((date as any).day)}`;
            const isSelected = key === selectedDay; // evidenziazione affidabile
            const isDisabled = state === 'disabled';

            const handlePress = () => {
              const payload: DateData = {
                dateString: key,
                day: (date as any).day,
                month: (date as any).month,
                year: (date as any).year,
                timestamp: (date as any).timestamp,
              };
              // usa onDayPress del calendario se fornito al dayComponent, altrimenti fallback al nostro handler in closure
              if (typeof dayOnPress === 'function') {
                dayOnPress(payload);
              } else {
                onDayPress(payload);
              }
            };

            return (
              <TouchableOpacity
                style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 2 }}
                onPress={!isDisabled ? handlePress : undefined}
                disabled={isDisabled}
                activeOpacity={0.6}
              >
                <View
                  style={{
                    paddingHorizontal: 6,
                    paddingVertical: 3,
                    borderRadius: 8,
                    backgroundColor: isSelected ? '#111' : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontWeight: '700',
                      color: isSelected ? '#fff' : isDisabled ? '#9CA3AF' : '#111',
                      textAlign: 'center',
                    }}
                  >
                    {date.day}
                  </Text>
                </View>
                {dots.length > 0 ? (
                  <View style={{ flexDirection: 'row', marginTop: 3 }}>
                    {dots.map((d: any, idx: number) => (
                      <View key={idx} style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: d.color, marginHorizontal: 1 }} />
                    ))}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* legenda compatta */}
      <View style={[styles.legend, { minHeight: 36, paddingHorizontal: 12 }]}>
        <LegendDot color="#10B981" label="Attiva" />
        <LegendDot color="#DC2626" label="Annullata" />
        <LegendDot color="#3B82F6" label="Archiviata" />
      </View>

      {/* titolo lista (risultati o giorno selezionato) */}
      <View style={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 4 }}>
        {hasRangeFilters ? (
          <Text style={styles.listTitle} numberOfLines={1}>
            Risultati: {resultsAll.length} uscita{resultsAll.length === 1 ? "" : "e"}
          </Text>
        ) : (
          <Text style={styles.listTitle} numberOfLines={1}>
            {format(new Date(selectedDay), "eeee d MMMM yyyy", { locale: it })}
          </Text>
        )}
      </View>
    </View>
  ), [visibleMonth, marked, onDayPress, onMonthChange, hasRangeFilters, resultsAll.length, selectedDay]);

  return (
    <Screen title="Calendario" subtitle="Visualizza uscite per giorno" scroll={false} headerRight={headerRightBtn}>
      <View style={{ flex: 1, minHeight: 600, justifyContent: "flex-start" }}>
        {/* 🔎 Modal Ricerca */}
        <Modal
          visible={isSearchOpen}
          animationType="slide"
          presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
          onRequestClose={() => setSearchOpen(false)}
        >
          <View style={{ flex: 1, backgroundColor: "#fff" }}>
            <SafeAreaView edges={["top", "left", "right"]}>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingTop: 8,
                  paddingBottom: 8,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderColor: "#e5e7eb",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: "800", color: "#111827" }}>Cerca</Text>
                <TouchableOpacity onPress={() => setSearchOpen(false)} accessibilityLabel="Chiudi filtri" accessibilityRole="button">
                  <Text style={{ fontSize: 22, fontWeight: "700", color: "#111827" }}>×</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
              <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={{ padding: 16 }}>
                {/* Campi controllati locali al modal */}
                <View style={{ marginBottom: 12 }}>
                  <Text style={styles.inputLabel}>Anno-Mese</Text>
                  <TextInput
                    value={ymLocal}
                    onChangeText={setYmLocal}
                    placeholder="YYYY-MM"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="numbers-and-punctuation"
                    style={styles.textInput}
                    returnKeyType="go"
                    onSubmitEditing={applySearchAndClose}
                  />
                </View>
                <View style={{ marginBottom: 12 }}>
                  <Text style={styles.inputLabel}>Intervallo date</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TextInput
                      value={fromLocal}
                      onChangeText={setFromLocal}
                      placeholder="Da YYYY-MM-DD"
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="numbers-and-punctuation"
                      style={[styles.textInput, { flex: 1 }]}
                      returnKeyType="next"
                    />
                    <TextInput
                      value={toLocal}
                      onChangeText={setToLocal}
                      placeholder="A YYYY-MM-DD"
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="numbers-and-punctuation"
                      style={[styles.textInput, { flex: 1 }]}
                      returnKeyType="done"
                    />
                  </View>
                </View>
                <View style={{ marginBottom: 12 }}>
                  <Text style={styles.inputLabel}>Cerca (titolo/luogo)</Text>
                  <TextInput
                    value={textLocal}
                    onChangeText={setTextLocal}
                    placeholder="Es. Gran Fondo, Pista ciclabile..."
                    placeholderTextColor="#9CA3AF"
                    style={styles.textInput}
                    returnKeyType="search"
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                  <Pressable
                    onPress={applySearchAndClose}
                    style={[styles.goBtn, { backgroundColor: "#111" }]}
                  >
                    <Text style={{ color: "#fff", fontWeight: "800" }}>Applica</Text>
                  </Pressable>

                  <Pressable
                    onPress={resetFiltersAndView}
                    style={[styles.goBtn, { backgroundColor: "#6B7280" }]}
                  >
                    <Text style={{ color: "#fff", fontWeight: "800" }}>Reimposta</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>
        {loading && rides.length === 0 ? (
          <View style={styles.centerRow}><ActivityIndicator /></View>
        ) : keywordActive ? (
          allRidesLoading && allRides.length === 0 ? (
            <View style={styles.centerRow}><ActivityIndicator /></View>
          ) : (
            <FlatList
              data={keywordResults}
              keyExtractor={(r) => r.id}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              renderItem={renderKeywordItem}
              ListHeaderComponent={keywordHeader}
              ListEmptyComponent={keywordEmpty}
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 32, paddingTop: 12 }}
            />
          )
        ) : (
          <FlatList
            ListHeaderComponent={listHeader}
            data={hasRangeFilters ? resultsAll : listForSelected}
            keyExtractor={(r) => r.id}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item }) => {
              const isCancelled = item.status === "cancelled";
              const isArchived = !!item.archived;
              return (
                <TouchableOpacity style={[styles.rideCard, { marginHorizontal: 12 }]} onPress={() => openRide(item)}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.rideTitle,
                        isCancelled && { textDecorationLine: "line-through", color: "#991B1B" },
                        isArchived && { color: "#374151" },
                      ]}
                      numberOfLines={1}
                    >
                      {item.title || "Uscita"}
                    </Text>
                    <Text style={styles.ridePlace} numberOfLines={1}>
                      {item.meetingPoint || "—"}
                    </Text>
                  </View>
                  {isArchived ? (
                    <Badge text="Arch." bg="#E5E7EB" fg="#374151" />
                  ) : isCancelled ? (
                    <Badge text="No" bg="#FEE2E2" fg="#991B1B" />
                  ) : (
                    <Badge text="OK" bg="#111" fg="#fff" />
                  )}
                </TouchableOpacity>
              );
            }}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
            initialNumToRender={10}
            windowSize={10}
            maxToRenderPerBatch={10}
            removeClippedSubviews={false}
          />
        )}
      </View>
    </Screen>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 6 }} />
      <Text style={{ color: "#374151" }}>{label}</Text>
    </View>
  );
}

function Badge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}>
      <Text style={{ color: fg, fontWeight: "800", fontSize: 12 }}>{text}</Text>
    </View>
  );
}

const SearchBar = React.memo(function SearchBar({
  yearMonthInput,
  onChangeYearMonth,
  searchText,
  onChangeSearchText,
  onGoToYearMonth,
  dateFromInput,
  onChangeDateFrom,
  dateToInput,
  onChangeDateTo,
}: {
  yearMonthInput: string;
  onChangeYearMonth: (v: string) => void;
  searchText: string;
  onChangeSearchText: (v: string) => void;
  onGoToYearMonth: () => void;
  dateFromInput: string;
  onChangeDateFrom: (v: string) => void;
  dateToInput: string;
  onChangeDateTo: (v: string) => void;
}) {
  // Refs agli input per evitare re-render e mantenere SEMPRE il focus
  const ymRef = React.useRef<TextInput>(null);
  const fromRef = React.useRef<TextInput>(null);
  const toRef = React.useRef<TextInput>(null);
  const textRef = React.useRef<TextInput>(null);

  // Valori correnti (non in stato, così non causano re-render)
  const ymVal = React.useRef(yearMonthInput);
  const fromVal = React.useRef(dateFromInput);
  const toVal = React.useRef(dateToInput);
  const textVal = React.useRef(searchText);

  // Solo per abilitare/disabilitare il tasto Vai senza toccare il parent
  const [ymValid, setYmValid] = React.useState(/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonthInput.trim()));

  // Se il parent pulisce i filtri, aggiorniamo i campi visualmente SENZA perdere focus
  React.useEffect(() => {
    ymVal.current = yearMonthInput; ymRef.current?.setNativeProps({ text: yearMonthInput }); setYmValid(/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonthInput.trim()));
  }, [yearMonthInput]);
  React.useEffect(() => { fromVal.current = dateFromInput; fromRef.current?.setNativeProps({ text: dateFromInput }); }, [dateFromInput]);
  React.useEffect(() => { toVal.current = dateToInput; toRef.current?.setNativeProps({ text: dateToInput }); }, [dateToInput]);
  React.useEffect(() => { textVal.current = searchText; textRef.current?.setNativeProps({ text: searchText }); }, [searchText]);

  const handleYmChange = (t: string) => { ymVal.current = t; setYmValid(/^\d{4}-(0[1-9]|1[0-2])$/.test(t.trim())); };
  const handleFromChange = (t: string) => { fromVal.current = t; };
  const handleToChange = (t: string) => { toVal.current = t; };
  const handleTextChange = (t: string) => { textVal.current = t; };

  const handleYmSubmit = () => { if (ymValid) { onChangeYearMonth(ymVal.current); onGoToYearMonth(); } };
  const handleFromEnd = () => onChangeDateFrom(fromVal.current);
  const handleToEnd = () => onChangeDateTo(toVal.current);
  const handleTextEnd = () => onChangeSearchText(textVal.current);

  return (
    <View style={styles.searchCard}>
      <Text style={styles.searchTitle}>Cerca</Text>

      {/* Anno-Mese */}
      <View style={{ width: "100%", marginTop: 6 }}>
        <Text style={styles.inputLabel}>Anno-Mese</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <TextInput
            ref={ymRef}
            defaultValue={yearMonthInput}
            placeholder="YYYY-MM"
            placeholderTextColor="#9CA3AF"
            onChangeText={handleYmChange}
            style={[styles.textInput, { flex: 1, paddingHorizontal: 10 }]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            returnKeyType="go"
            blurOnSubmit={false}
            onSubmitEditing={handleYmSubmit}
          />
        </View>
      </View>

      {/* Intervallo date */}
      <View style={{ width: "100%", marginTop: 10 }}>
        <Text style={styles.inputLabel}>Intervallo date</Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <TextInput
            ref={fromRef}
            defaultValue={dateFromInput}
            placeholder="Da YYYY-MM-DD"
            placeholderTextColor="#9CA3AF"
            onChangeText={handleFromChange}
            style={[styles.textInput, { flex: 1 }]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            returnKeyType="next"
            blurOnSubmit={false}
            onEndEditing={handleFromEnd}
          />
          <TextInput
            ref={toRef}
            defaultValue={dateToInput}
            placeholder="A YYYY-MM-DD"
            placeholderTextColor="#9CA3AF"
            onChangeText={handleToChange}
            style={[styles.textInput, { flex: 1 }]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            blurOnSubmit={false}
            onEndEditing={handleToEnd}
          />
        </View>
      </View>

      {/* Testo (titolo/luogo) */}
      <View style={{ width: "100%", marginTop: 10 }}>
        <Text style={styles.inputLabel}>Cerca (titolo/luogo)</Text>
        <TextInput
          ref={textRef}
          defaultValue={searchText}
          placeholder="Es. Gran Fondo, Pista ciclabile..."
          placeholderTextColor="#9CA3AF"
          onChangeText={handleTextChange}
          style={styles.textInput}
          returnKeyType="search"
          blurOnSubmit={false}
          onEndEditing={handleTextEnd}
        />
      </View>

      {/* Azioni */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <Pressable onPress={handleYmSubmit} style={styles.goBtn} disabled={!ymValid}>
          <Text style={{ color: "#fff", fontWeight: "800", opacity: ymValid ? 1 : 0.5 }}>Vai</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  legend: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  listWrap: { flex: 1, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12, gap: 8, minHeight: 280 },
  listTitle: { fontWeight: "700", color: "#111", lineHeight: 22 },
  rideCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
  },
  rideTitle: { fontWeight: "700", color: "#111" },
  ridePlace: { color: "#374151", marginTop: 2 },
  rideDate: { color: "#6B7280", fontSize: 12, marginBottom: 4 },
  centerRow: { padding: 12, alignItems: "center", justifyContent: "center" },
  searchCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  searchTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  searchBar: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 10,
  },
  inputLabel: { fontSize: 12, color: "#6B7280", marginBottom: 4 },
  textInput: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    color: "#111827",
  },
  goBtn: {
    backgroundColor: "#111",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
