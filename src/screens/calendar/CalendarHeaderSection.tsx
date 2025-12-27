import React, { useMemo, useEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Calendar, DateData, LocaleConfig } from "react-native-calendars";
import { UI } from "../../components/Screen";
import { pad2 } from "./helpers";
import { MarkedDates } from "./types";



// --- LAYOUT CONSTANTS ---
const HEADER_TITLE_HEIGHT = 46;
const HEADER_WEEKDAY_HEIGHT = 30;
const TOTAL_HEADER_HEIGHT = HEADER_TITLE_HEIGHT + HEADER_WEEKDAY_HEIGHT;

LocaleConfig.locales.it = {
  monthNames: [
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
  ],
  monthNamesShort: [
    "Gen",
    "Feb",
    "Mar",
    "Apr",
    "Mag",
    "Giu",
    "Lug",
    "Ago",
    "Set",
    "Ott",
    "Nov",
    "Dic",
  ],
  dayNames: [
    "Domenica",
    "Lunedi",
    "Martedi",
    "Mercoledi",
    "Giovedi",
    "Venerdi",
    "Sabato",
  ],
  dayNamesShort: ["D", "L", "M", "M", "G", "V", "S"],
  today: "Oggi",
};
LocaleConfig.defaultLocale = "it";

type CalendarHeaderSectionProps = {
  visibleMonth: string;
  markedDates: MarkedDates;
  selectedDay: string;
  onDayPress: (day: DateData) => void;
  onMonthChange: (day: DateData) => void;
  onTodayPress?: () => void;
  gridWidth?: number;
  gridHeight?: number;
};

export function CalendarHeaderSection({
  visibleMonth,
  markedDates,
  selectedDay,
  onDayPress,
  onMonthChange,
  onTodayPress,
  gridWidth = 0,
  gridHeight = 0,
}: CalendarHeaderSectionProps) {
  const SHOW_LAYOUT_DEBUG = false; // audit concluso: debug disattivato
  const [layoutDebug, setLayoutDebug] = useState({
    outerWrapperW: 0,
    innerWrapperW: 0,
    calendarW: 0,
  });

  // 1. Grid Width Calculation
  // Single source of truth: the measured width inside the 16px side margins (outerWrapperW).
  // We derive a grid width that is ALWAYS a multiple of 7 and therefore cannot overflow.

  // Effective available width inside the red wrapper (already excludes the 16px margins).
  const effectiveW = layoutDebug.outerWrapperW;

  // Until measured, keep a conservative fallback.
  const fallbackCellW = 48;

  // Compute a grid width that is a multiple of 7 and never exceeds effectiveW.
  const gridW = useMemo(() => {
    if (effectiveW > 0) {
      const w = Math.floor(effectiveW / 7) * 7;
      return Math.max(0, w);
    }
    return fallbackCellW * 7;
  }, [effectiveW]);

  const cellW = useMemo(() => {
    if (gridW > 0) return Math.floor(gridW / 7);
    return fallbackCellW;
  }, [gridW]);

  // Remainder split: guarantees equal left/right visual space.
  const { padLeft, padRight } = useMemo(() => {
    if (effectiveW <= 0 || gridW <= 0) return { padLeft: 0, padRight: 0 };
    const remainder = Math.max(0, effectiveW - gridW);
    const left = Math.floor(remainder / 2);
    const right = remainder - left;
    return { padLeft: left, padRight: right };
  }, [effectiveW, gridW]);

  const hairline = StyleSheet.hairlineWidth;
  const gridBorderWidth = hairline < 1 ? 1 : hairline;
  const gridBorderColor = "#D1D5DB";

  // 2. Date & Weeks Calculation
  const [vmYear, vmMonth] = useMemo(() => {
    const parts = visibleMonth.split("-").map(Number);
    return [parts[0] || new Date().getFullYear(), parts[1] || new Date().getMonth() + 1];
  }, [visibleMonth]);

  const gridStartUTC = useMemo(() => {
    const firstOfMonthUTC = Date.UTC(vmYear, vmMonth - 1, 1);
    const firstDow = new Date(firstOfMonthUTC).getUTCDay(); // 0=Sun...6=Sat
    // IT locale: Start Monday (1).
    const offset = (firstDow + 6) % 7;
    return Date.UTC(vmYear, vmMonth - 1, 1 - offset);
  }, [vmYear, vmMonth]);

  const gridEndUTC = useMemo(() => {
    const lastOfMonthUTC = Date.UTC(vmYear, vmMonth, 0);
    const lastDow = new Date(lastOfMonthUTC).getUTCDay();
    const mondayIndex = (lastDow + 6) % 7;
    const daysToSunday = 6 - mondayIndex;
    return Date.UTC(vmYear, vmMonth, 0 + daysToSunday);
  }, [vmYear, vmMonth]);

  // Exact number of weeks needed (4, 5, or 6)
  const weeksCount = useMemo(() => {
    const totalDays = Math.round((gridEndUTC - gridStartUTC) / 86400000) + 1;
    const weeks = Math.max(4, Math.min(6, Math.ceil(totalDays / 7)));
    return weeks;
  }, [gridEndUTC, gridStartUTC]);

  // 3. Dynamic Cell Height Calculation
  const availableForGrid = useMemo(() => {
    if (gridHeight <= 0) return 0;
    return Math.max(0, gridHeight - TOTAL_HEADER_HEIGHT);
  }, [gridHeight]);

  const cellH = useMemo(() => {
    // When gridHeight is not ready yet, keep a conservative height to avoid layout explosions.
    if (gridHeight <= 0) return 44;
    return Math.floor(availableForGrid / weeksCount);
  }, [availableForGrid, gridHeight, weeksCount]);

  // 4. Calendar Total Height
  const calendarHeight = useMemo(() => {
    if (gridHeight <= 0) return undefined;
    const total = TOTAL_HEADER_HEIGHT + cellH * weeksCount;
    return Math.min(gridHeight, total);
  }, [cellH, gridHeight, weeksCount]);

  const handleTodayPress = useCallback(() => {
    if (onTodayPress) {
      onTodayPress();
      return;
    }
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const todayKey = `${year}-${pad2(month)}-${pad2(day)}`;
    const payload: DateData = {
      dateString: todayKey,
      day,
      month,
      year,
      timestamp: Date.UTC(year, month - 1, day),
    };
    onDayPress(payload);
  }, [onDayPress, onTodayPress]);

  useEffect(() => {
    if (!SHOW_LAYOUT_DEBUG) return;
    // eslint-disable-next-line no-console
    console.log("[CalendarLayout]", {
      gridWidth,
      cellW,
      gridW,
      outerWrapperW: layoutDebug.outerWrapperW,
      innerWrapperW: layoutDebug.innerWrapperW,
      calendarW: layoutDebug.calendarW,
    });
  }, [
    gridWidth,
    cellW,
    gridW,
    layoutDebug.outerWrapperW,
    layoutDebug.innerWrapperW,
    layoutDebug.calendarW,
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <View
        style={{
          marginHorizontal: 16,
          alignSelf: "stretch",
          alignItems: "center",
          ...(SHOW_LAYOUT_DEBUG ? { borderWidth: 1, borderColor: "red" } : null),
        }}
        onLayout={(event) => {
          const { width } = event.nativeEvent.layout;
          setLayoutDebug((prev) => (prev.outerWrapperW === width ? prev : { ...prev, outerWrapperW: width }));
        }}
      >
        {/* Container with rounded corners for the whole calendar block */}
        <View
          style={{
            width: gridW || "100%",
            maxWidth: "100%",
            alignSelf: "center",
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: "#FFFFFF",
            ...(SHOW_LAYOUT_DEBUG ? { borderWidth: 1, borderColor: "blue" } : null),
          }}
          onLayout={(event) => {
            const { width } = event.nativeEvent.layout;
            setLayoutDebug((prev) => (prev.innerWrapperW === width ? prev : { ...prev, innerWrapperW: width }));
          }}
        >
          <View
            style={{
              width: gridW || "100%",
              maxWidth: "100%",
              height: calendarHeight,
              ...(SHOW_LAYOUT_DEBUG ? { borderWidth: 1, borderColor: "green" } : null),
            }}
            onLayout={(event) => {
              const { width } = event.nativeEvent.layout;
              setLayoutDebug((prev) => (prev.calendarW === width ? prev : { ...prev, calendarW: width }));
            }}
          >
            <Calendar
              key={`cal-${visibleMonth}`}
              current={visibleMonth}
              renderArrow={(direction) => {
                const iconName = direction === "left" ? "chevron-back" : "chevron-forward";
                if (direction === "left") {
                  return (
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <TouchableOpacity
                        onPress={handleTodayPress}
                        style={{ paddingHorizontal: 8, paddingVertical: 4, marginRight: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel="Oggi"
                      >
                        <Text style={{ fontSize: 14, fontWeight: "700", color: UI.colors.action }}>Oggi</Text>
                      </TouchableOpacity>
                      <Ionicons name={iconName} size={18} color="#111827" />
                    </View>
                  );
                }
                return <Ionicons name={iconName} size={18} color="#111827" />;
              }}
              style={{
                width: gridW,
                height: "100%",
                backgroundColor: "transparent",
                alignSelf: "center",
              }}
              hideExtraDays={false}
              showSixWeeks={false}
              enableSwipeMonths
              markedDates={markedDates}
              onDayPress={onDayPress}
              onMonthChange={onMonthChange}
              firstDay={1}
              theme={{
                backgroundColor: "#FFFFFF",
                calendarBackground: "transparent",
                textDayHeaderFontSize: 12,
                textSectionTitleColor: "#6B7280",
                dayTextColor: "#111827",
                monthTextColor: "#111827",
                selectedDayBackgroundColor: "transparent",
                selectedDayTextColor: "#111827",
                todayTextColor: UI.colors.action,
                arrowColor: "#111827",
                arrowStyle: {
                  padding: 0,
                },

                // --- CRITICAL LAYOUT OVERRIDES ---
                "stylesheet.calendar.main": {
                  container: {
                    paddingLeft: 0,
                    paddingRight: 0,
                    paddingTop: 0,
                    paddingBottom: 0,
                    backgroundColor: "transparent",
                  },
                  monthView: {
                    paddingTop: 0,
                    paddingBottom: 0,
                  },
                  dayContainer: {
                    flex: 0,
                    width: cellW,
                    height: cellH,
                    alignItems: "stretch",
                  },
                  emptyDayContainer: {
                    width: cellW,
                    height: cellH,
                  },
                  // Zero gaps between weeks
                  week: {
                    marginTop: 0,
                    marginBottom: 0,
                    paddingTop: 0,
                    paddingBottom: 0,
                    flexDirection: "row",
                    justifyContent: "flex-start",
                    alignItems: "stretch",
                    height: cellH, // critical: prevents invisible gaps between week rows
                  },
                },
                "stylesheet.calendar.header": {
                  // Month Title Row
                  header: {
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: 0,
                    paddingBottom: 0,
                    paddingLeft: 0,
                    paddingRight: 0,
                    marginTop: 0,
                    marginBottom: 0,
                    height: HEADER_TITLE_HEIGHT, // Force fixed height
                  },
                  headerContainer: {
                    flex: 1,
                    alignItems: "center",
                  },
                  monthText: {
                    fontSize: 16,
                    fontWeight: "700",
                    color: "#111827",
                    margin: 0, // Remove uncontrolled margins
                  },
                  // Weekday Row (L M M G V S D)
                  week: {
                    marginTop: 0,
                    marginBottom: 0,
                    flexDirection: "row",
                    justifyContent: "flex-start",
                    paddingTop: 0,
                    paddingBottom: 0,
                    paddingHorizontal: 0,
                    height: HEADER_WEEKDAY_HEIGHT, // fixed and compact
                    alignItems: "center",
                  },
                  dayHeader: {
                    flex: 1,
                    textAlign: "center",
                    fontWeight: "600",
                    color: "#6B7280",
                    marginTop: 0,
                    marginBottom: 0,
                  },
                },
                textMonthFontWeight: "700",
                textDayHeaderFontWeight: "600",
              }}
              dayComponent={({ date, state, marking }) => {
                if (!date) {
                  return (
                    <View
                      style={{
                        width: cellW,
                        height: cellH,
                        borderWidth: 0.5,
                        borderColor: gridBorderColor,
                        backgroundColor: "#FFFFFF",
                      }}
                    />
                  );
                }

                const calendarDate = date as DateData;
                const info = marking || {};
                const isMarked = !!info.marked;
                const key = `${calendarDate.year}-${pad2(calendarDate.month)}-${pad2(calendarDate.day)}`;
                const isSelected = key === selectedDay;
                const isDisabled = state === "disabled";
                const dateUTC = Date.UTC(calendarDate.year, calendarDate.month - 1, calendarDate.day);

                // Calculate Position in Grid for borders
                const diffDays = Math.round((dateUTC - gridStartUTC) / 86400000);
                const rowIndex = diffDays >= 0 ? Math.floor(diffDays / 7) : 0;
                const colIndex = diffDays >= 0 ? diffDays % 7 : 0;

                const isFirstRow = rowIndex === 0;
                const isFirstCol = colIndex === 0;

                const handlePress = () => {
                  const payload: DateData = {
                    dateString: key,
                    day: calendarDate.day,
                    month: calendarDate.month,
                    year: calendarDate.year,
                    timestamp: calendarDate.timestamp,
                  };
                  onDayPress(payload);
                };

                const textColor = isSelected ? "#FFFFFF" : isDisabled ? "#9CA3AF" : "#111827";
                const borderColor = gridBorderColor;
                const barW = Math.min(36, Math.max(26, Math.floor(cellW * 0.6)));

                return (
                  <View
                    style={{
                      width: cellW,
                      height: cellH,
                      borderWidth: 0.5,
                      borderColor: gridBorderColor,
                      backgroundColor: "#FFFFFF",
                    }}
                  >
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "flex-start",
                        paddingTop: 6,
                      }}
                      onPress={!isDisabled ? handlePress : undefined}
                      disabled={isDisabled}
                      activeOpacity={0.7}
                    >
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: isSelected ? UI.colors.action : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ fontWeight: "600", color: textColor, fontSize: 15 }}>
                          {calendarDate.day}
                        </Text>
                      </View>

                      {isMarked && !isDisabled ? (
                        <View
                          style={{
                            position: "absolute",
                            bottom: 10,
                            height: 4,
                            width: barW,
                            borderRadius: 2,
                            backgroundColor: UI.colors.action,
                          }}
                        />
                      ) : null}
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
