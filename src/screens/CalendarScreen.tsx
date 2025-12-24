// src/screens/CalendarScreen.tsx
import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "../components/Screen";
import { CalendarSearchModal } from "./calendar/CalendarSearchModal";
import { CalendarHeaderSection } from "./calendar/CalendarHeaderSection";
import { useCalendarScreen } from "./calendar/useCalendarScreen";
import { ActiveFiltersBanner } from "./calendar/ActiveFiltersBanner";

export default function CalendarScreen() {
  const [calendarArea, setCalendarArea] = useState({ width: 0, height: 0 });
  const insets = useSafeAreaInsets();
  const headerTopPadding = insets.top + 8;

  // Use the measured container size as the single source of truth.
  // This avoids incorrect sizing caused by native header/safe area/tab bar differences.
  const gridHeight = calendarArea.height;
  const gridWidth = calendarArea.width;

  const canRenderCalendar = gridWidth > 0 && gridHeight > 0;

  const {
    actions,
    searchModal,
    calendar,
    loading,
    isSearchOpen,
    filterSummary,
    hasActiveFilters,
  } = useCalendarScreen();

  if (loading.initial) {
    return (
      <Screen useNativeHeader={true} scroll={false}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#22c55e" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen useNativeHeader={true} scroll={false} backgroundColor="#fff">
      <View style={{ flex: 1 }}>
        {/* Custom Clean Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 16,
            paddingTop: headerTopPadding,
            backgroundColor: "#fff",
            borderBottomWidth: hasActiveFilters ? 0 : 1,
            borderBottomColor: "#F3F4F6",
          }}
        >
          <Text style={{ fontSize: 28, fontWeight: "800", color: "#111", letterSpacing: -0.5 }}>
            Calendario
          </Text>
          <TouchableOpacity
            onPress={actions.openSearch}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#F3F4F6",
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 20,
            }}
          >
            <Ionicons name="filter" size={18} color="#111" style={{ marginRight: 6 }} />
            <Text style={{ color: "#111", fontWeight: "600", fontSize: 14 }}>Filtri</Text>
          </TouchableOpacity>
        </View>

        {hasActiveFilters && (
          <View
            style={{ paddingHorizontal: 16, paddingBottom: 8, backgroundColor: "#fff" }}
          >
            <ActiveFiltersBanner chips={filterSummary} onClear={actions.clearFilters} />
          </View>
        )}

        {/* Full Screen Grid */}
        <View
          style={{ flex: 1, alignSelf: "stretch", paddingVertical: 0 }}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            // Avoid thrashing: only update when values actually change
            setCalendarArea((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
          }}
        >
          {canRenderCalendar ? (
            <CalendarHeaderSection
              visibleMonth={calendar.visibleMonth}
              markedDates={calendar.markedDates}
              selectedDay={calendar.selectedDay}
              onDayPress={calendar.onDayPress}
              onMonthChange={calendar.onMonthChange}
              gridWidth={gridWidth}
              gridHeight={gridHeight}
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="small" color="#22c55e" />
            </View>
          )}
        </View>
      </View>

      <CalendarSearchModal visible={isSearchOpen} onClose={actions.closeSearch} state={searchModal} />
    </Screen>
  );
}
