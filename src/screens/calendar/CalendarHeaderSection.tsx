import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Calendar, DateData, LocaleConfig } from "react-native-calendars";
import { pad2 } from "./helpers";
import { MarkedDates } from "./types";

const ACTION_GREEN = "#22c55e";

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
  gridWidth?: number;
  gridHeight?: number;
};

export function CalendarHeaderSection({
  visibleMonth,
  markedDates,
  selectedDay,
  onDayPress,
  onMonthChange,
  gridWidth = 0,
  gridHeight = 0,
}: CalendarHeaderSectionProps) {
  // 1. Grid Width Calculation
  const contentWidth = useMemo(() => (gridWidth > 0 ? Math.max(0, gridWidth - 32) : 0), [gridWidth]);
  const cellW = useMemo(() => (contentWidth > 0 ? Math.floor(contentWidth / 7) : 48), [contentWidth]);

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

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 16 }}>
      {/* Container with rounded corners for the whole calendar block */}
      <View
        style={{
          width: cellW > 0 ? cellW * 7 : "100%",
          alignSelf: "center",
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: "#FFFFFF",
        }}
      >
        <Calendar
          key={`cal-${visibleMonth}`}
          current={visibleMonth}
          style={{ width: cellW > 0 ? cellW * 7 : "100%", height: calendarHeight, backgroundColor: "transparent" }}
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
            todayTextColor: ACTION_GREEN,
            arrowColor: "#111827",

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
                justifyContent: "center",
                alignItems: "center",
                paddingTop: 0,
                paddingBottom: 0,
                marginTop: 0,
                marginBottom: 0,
                height: HEADER_TITLE_HEIGHT, // Force fixed height
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
                    borderRightWidth: gridBorderWidth,
                    borderBottomWidth: gridBorderWidth,
                    borderColor: gridBorderColor,
                    backgroundColor: "#fff",
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

            return (
              <TouchableOpacity
                style={{
                  width: cellW,
                  height: cellH,
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  margin: 0,
                }}
                onPress={!isDisabled ? handlePress : undefined}
                disabled={isDisabled}
                activeOpacity={0.7}
              >
                <View
                  style={{
                    width: cellW,
                    height: cellH,
                    borderRightWidth: colIndex === 6 ? 0 : gridBorderWidth,
                    borderBottomWidth: gridBorderWidth,
                    // Collapsed borders: Top only on 1st row, Left only on 1st col
                    ...(isFirstRow ? { borderTopWidth: gridBorderWidth } : null),
                    ...(isFirstCol ? { borderLeftWidth: gridBorderWidth } : null),
                    borderColor,
                    backgroundColor: "#FFFFFF",
                    paddingTop: 6,
                    paddingLeft: 8,
                    paddingRight: 4,
                    paddingBottom: 0,
                  }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: isSelected ? ACTION_GREEN : "transparent",
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
                        height: 4,
                        width: Math.min(36, Math.max(26, Math.floor(cellW * 0.6))),
                        borderRadius: 2,
                        backgroundColor: ACTION_GREEN,
                        marginTop: 6,
                        marginLeft: 2,
                      }}
                    />
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </View>
  );
}
