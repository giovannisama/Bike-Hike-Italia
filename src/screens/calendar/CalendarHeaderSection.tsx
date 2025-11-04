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
  onQuickSelect: (dateString: string) => void;
};

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 16 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginRight: 6 }} />
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
  quickTargets,
  onQuickSelect,
}: CalendarHeaderSectionProps) {
  const nextRideTarget = quickTargets.nextRide;
  const previousRideTarget = quickTargets.previousRide;

  return (
    <View>
      <View style={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[calendarStyles.listTitle, { marginRight: 12 }]}>Calendario</Text>
          <TouchableOpacity
            onPress={onToggle}
            accessibilityRole="button"
            accessibilityLabel={collapsed ? "Mostra calendario" : "Nascondi calendario"}
            style={calendarStyles.toggleButton}
            activeOpacity={0.7}
          >
            <Text style={calendarStyles.toggleText}>{collapsed ? "Mostra" : "Nascondi"}</Text>
            <Text style={[calendarStyles.toggleText, { fontSize: 14 }]}>{collapsed ? "▼" : "▲"}</Text>
          </TouchableOpacity>
        </View>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "nowrap",
            gap: 8,
            marginTop: 8,
            alignItems: "center",
          }}
        >
          <TouchableOpacity
            onPress={() => onQuickSelect(quickTargets.today)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: "#0EA5E9",
            }}
            activeOpacity={0.7}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Oggi</Text>
          </TouchableOpacity>
          {nextRideTarget ? (
            <TouchableOpacity
              onPress={() => onQuickSelect(nextRideTarget.dateString)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: "#111827",
              }}
              activeOpacity={0.7}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
                Prossima ({nextRideTarget.label})
              </Text>
            </TouchableOpacity>
          ) : null}
          {previousRideTarget ? (
            <TouchableOpacity
              onPress={() => onQuickSelect(previousRideTarget.dateString)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: "#4B5563",
              }}
              activeOpacity={0.7}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
                Precedente ({previousRideTarget.label})
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {!collapsed && (
        <>
          <View style={{ paddingHorizontal: 12 }} collapsable={false}>
            <View
              style={{
                borderRadius: 18,
                backgroundColor: "#fff",
                borderWidth: 1,
                borderColor: "#E5E7EB",
                shadowColor: "#000",
                shadowOpacity: 0.06,
                shadowRadius: 8,
                elevation: 2,
                paddingBottom: 2,
              }}
            >
              <Calendar
                key={`cal-${visibleMonth}`}
                current={visibleMonth}
                style={{ borderRadius: 18 }}
                hideExtraDays={false}
                enableSwipeMonths
                markingType="multi-dot"
                markedDates={markedDates}
                onDayPress={onDayPress}
                onMonthChange={onMonthChange}
                firstDay={1}
                theme={{
                  textDayFontSize: 14,
                  textDayHeaderFontSize: 12,
                  arrowStyle: { padding: 0 },
                  stylesheet: {
                    calendar: {
                      main: {
                        paddingTop: 6,
                        paddingBottom: 6,
                      },
                    },
                    day: {
                      basic: {
                        base: {
                          height: 42,
                          width: 42,
                        },
                      },
                    },
                  } as any,
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
                      style={{ alignItems: "center", justifyContent: "center", paddingVertical: 3 }}
                      onPress={!isDisabled ? handlePress : undefined}
                      disabled={isDisabled}
                      activeOpacity={0.6}
                    >
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          minWidth: 34,
                          borderRadius: 10,
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
                        <View style={{ flexDirection: "row", marginTop: 2 }}>
                          {dots.map((d: any, idx: number) => (
                            <View
                              key={idx}
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: 3,
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
          </View>

          <View style={[calendarStyles.legend, { minHeight: 26, paddingHorizontal: 12, marginTop: 12 }]}>
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
