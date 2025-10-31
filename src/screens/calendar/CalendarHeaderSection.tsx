import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { calendarStyles } from "./styles";
import { pad2 } from "./helpers";
import { MarkedDates } from "./types";

type CalendarHeaderSectionProps = {
  visibleMonth: string;
  markedDates: MarkedDates;
  selectedDay: string;
  hasRangeFilters: boolean;
  resultsCount: number;
  selectedDayLabel: string;
  onDayPress: (day: DateData) => void;
  onMonthChange: (day: DateData) => void;
  collapsed: boolean;
  onToggle: () => void;
};

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 6 }} />
      <Text style={{ color: "#374151" }}>{label}</Text>
    </View>
  );
}

export function CalendarHeaderSection({
  visibleMonth,
  markedDates,
  selectedDay,
  hasRangeFilters,
  resultsCount,
  selectedDayLabel,
  onDayPress,
  onMonthChange,
  collapsed,
  onToggle,
}: CalendarHeaderSectionProps) {
  return (
    <View>
      <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[calendarStyles.listTitle, { marginRight: 12 }]}>Calendario</Text>
          <TouchableOpacity
            onPress={onToggle}
            accessibilityRole="button"
            accessibilityLabel={collapsed ? "Mostra calendario" : "Nascondi calendario"}
            style={calendarStyles.toggleButton}
          >
            <Text style={calendarStyles.toggleText}>{collapsed ? "Mostra" : "Nascondi"}</Text>
            <Text style={[calendarStyles.toggleText, { fontSize: 14 }]}>{collapsed ? "▼" : "▲"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!collapsed && (
        <>
          <View style={{ overflow: "hidden", paddingHorizontal: 12 }} collapsable={false}>
            <Calendar
              key={`cal-${visibleMonth}`}
              current={visibleMonth}
              style={{ height: 360 }}
              hideExtraDays={false}
              enableSwipeMonths
              markingType="multi-dot"
              markedDates={markedDates}
              onDayPress={onDayPress}
              onMonthChange={onMonthChange}
              firstDay={1}
              theme={{
                todayTextColor: "#0EA5E9",
                arrowColor: "#111",
                monthTextColor: "#111",
                textMonthFontWeight: "700",
              }}
              dayComponent={({ date, state, marking }) => {
                if (!date) return null;
                const calendarDate = date as DateData;
                const info = marking || {};
                const dots = Array.isArray(info.dots) ? info.dots.slice(0, 3) : [];
                const key = `${calendarDate.year}-${pad2(calendarDate.month)}-${pad2(calendarDate.day)}`;
                const isSelected = key === selectedDay;
                const isDisabled = state === "disabled";

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

                return (
                  <TouchableOpacity
                    style={{ alignItems: "center", justifyContent: "center", paddingVertical: 2 }}
                    onPress={!isDisabled ? handlePress : undefined}
                    disabled={isDisabled}
                    activeOpacity={0.6}
                  >
                    <View
                      style={{
                        paddingHorizontal: 6,
                        paddingVertical: 3,
                        borderRadius: 8,
                        backgroundColor: isSelected ? "#111" : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: "700",
                          color: isSelected ? "#fff" : isDisabled ? "#9CA3AF" : "#111",
                          textAlign: "center",
                        }}
                      >
                        {calendarDate.day}
                      </Text>
                    </View>
                    {dots.length > 0 ? (
                      <View style={{ flexDirection: "row", marginTop: 3 }}>
                        {dots.map((d: any, idx: number) => (
                          <View
                            key={idx}
                            style={{
                              width: 9,
                              height: 9,
                              borderRadius: 4.5,
                              backgroundColor: d.color,
                              marginHorizontal: 1,
                            }}
                          />
                        ))}
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              }}
            />
          </View>

          <View style={[calendarStyles.legend, { minHeight: 36, paddingHorizontal: 12 }]}>
            <LegendDot color="#10B981" label="Attiva" />
            <LegendDot color="#DC2626" label="Annullata" />
            <LegendDot color="#3B82F6" label="Archiviata" />
          </View>
        </>
      )}

      <View style={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 4 }}>
        {hasRangeFilters ? (
          <Text style={calendarStyles.listTitle} numberOfLines={1}>
            Risultati: {resultsCount} uscita{resultsCount === 1 ? "" : "e"}
          </Text>
        ) : (
          <Text style={calendarStyles.listTitle} numberOfLines={1}>
            {selectedDayLabel}
          </Text>
        )}
      </View>
    </View>
  );
}
