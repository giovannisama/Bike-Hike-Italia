// src/screens/CalendarScreen.tsx
import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
  useWindowDimensions,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DateData } from "react-native-calendars";
import { LinearGradient } from "expo-linear-gradient";

import { Screen } from "../components/Screen";
import { CalendarSearchModal } from "./calendar/CalendarSearchModal";
import { CalendarHeaderSection } from "./calendar/CalendarHeaderSection";
import { useCalendarScreen } from "./calendar/useCalendarScreen";
import { ActiveFiltersBanner } from "./calendar/ActiveFiltersBanner";
import { RideList } from "./calendar/RideList";

export default function CalendarScreen() {
  const [calendarArea, setCalendarArea] = useState({ width: 0, height: 0 });
  // viewMode is now managed in useCalendarScreen hook
  const translateX = useRef(new Animated.Value(0)).current;
  const { width: windowWidth } = useWindowDimensions();
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
    rideLists,
    loading,
    isSearchOpen,
    filterSummary,
    hasActiveFilters,
  } = useCalendarScreen();

  const pageWidth = gridWidth || windowWidth;
  const bottomInset = useMemo(() => Math.max(insets.bottom, 16), [insets.bottom]);
  const indicatorInsets = useMemo(() => ({ bottom: bottomInset }), [bottomInset]);

  const handleDayPress = useCallback(
    (day: DateData) => {
      // Single entry point for day view
      actions.openDayPage(day.dateString);
    },
    [actions]
  );

  const handleBack = useCallback(() => {
    actions.closeDayPage();
  }, [actions]);

  // Sync animation with hook's viewMode
  useEffect(() => {
    if (pageWidth <= 0) return;
    Animated.timing(translateX, {
      toValue: calendar.viewMode === "day" ? -pageWidth : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pageWidth, translateX, calendar.viewMode]);

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
      <View style={styles.headerGradientContainer}>
        <LinearGradient
          colors={["rgba(20, 83, 45, 0.08)", "rgba(14, 165, 233, 0.08)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
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
            backgroundColor: "transparent",
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

        {/* Banner Filtri (nascosto in filtered view per richiesta design: titolo composto sostituisce chip) */}
        {hasActiveFilters && !calendar.isFilteredView && (
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
            <View style={{ flex: 1, overflow: "hidden" }}>
              <Animated.View
                style={{
                  flexDirection: "row",
                  width: pageWidth * 2,
                  flex: 1,
                  transform: [{ translateX }],
                }}
              >
                <View style={{ width: pageWidth, flex: 1 }}>
                  <CalendarHeaderSection
                    visibleMonth={calendar.visibleMonth}
                    markedDates={calendar.markedDates}
                    selectedDay={calendar.selectedDay}
                    onDayPress={handleDayPress}
                    onMonthChange={calendar.onMonthChange}
                    gridWidth={gridWidth}
                    gridHeight={gridHeight}
                  />
                </View>
                <View style={{ width: pageWidth, flex: 1, backgroundColor: "#F9FAFB" }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      backgroundColor: "#fff",
                      borderBottomWidth: 1,
                      borderBottomColor: "#F3F4F6",
                    }}
                  >
                    <TouchableOpacity
                      onPress={handleBack}
                      style={{ paddingRight: 12, paddingVertical: 4 }}
                    >
                      <Ionicons name="arrow-back" size={22} color="#111" />
                    </TouchableOpacity>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "700",
                        color: "#111",
                        flex: 1, // Ensure title breaks if too long
                      }}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {calendar.isFilteredView
                        ? calendar.filterTitle
                        : calendar.selectedDayLabel}
                    </Text>
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 16,
                      paddingTop: 16,
                      paddingBottom: 8,
                      backgroundColor: "#F9FAFB",
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "#111" }}>
                      Ciclismo
                    </Text>
                  </View>
                  <RideList
                    data={
                      calendar.isFilteredView
                        ? rideLists.filtered
                        : rideLists.forSelectedDay
                    }
                    onSelect={actions.openRide}
                    contentContainerStyle={{
                      paddingTop: 8,
                      paddingHorizontal: 16,
                      paddingBottom: 32 + bottomInset,
                    }}
                    indicatorInsets={indicatorInsets}
                    emptyMessage={
                      calendar.isFilteredView
                        ? "Nessun evento corrispondente ai filtri impostati."
                        : "Nessuna uscita per questo giorno."
                    }
                    showDate={calendar.isFilteredView}
                  />
                </View>
              </Animated.View>
            </View>
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

const styles = StyleSheet.create({
  headerGradientContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
});
