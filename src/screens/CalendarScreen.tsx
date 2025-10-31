// src/screens/CalendarScreen.tsx
import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "../components/Screen";
import { calendarStyles } from "./calendar/styles";
import { CalendarSearchModal } from "./calendar/CalendarSearchModal";
import { CalendarHeaderSection } from "./calendar/CalendarHeaderSection";
import { KeywordResultsList } from "./calendar/KeywordResultsList";
import { RideList } from "./calendar/RideList";
import { useCalendarScreen } from "./calendar/useCalendarScreen";
import { Ride } from "./calendar/types";
import { ActiveFiltersBanner } from "./calendar/ActiveFiltersBanner";

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const bottomInset = useMemo(() => Math.max(insets.bottom, 16), [insets.bottom]);

  const keywordContentStyleBase = useMemo(
    () => ({
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 32 + bottomInset,
    }),
    [bottomInset]
  );

  const indicatorInsets = useMemo(() => ({ bottom: bottomInset }), [bottomInset]);

  const {
    actions,
    searchModal,
    calendar,
    keyword,
    rideLists,
    loading,
    isSearchOpen,
    filterSummary,
    hasActiveFilters,
  } = useCalendarScreen();

  const headerRightBtn = useMemo(
    () => (
      <TouchableOpacity onPress={actions.openSearch} accessibilityRole="button">
        <Text style={{ color: "#fff", fontWeight: "800" }}>🔎 Cerca</Text>
      </TouchableOpacity>
    ),
    [actions]
  );

  const showKeywordResults = keyword.active;
  const rideData = calendar.hasRangeFilters ? rideLists.filtered : rideLists.forSelectedDay;
  const listContentStyle = useMemo(
    () => ({
      paddingTop: calendar.collapsed ? 8 : 12,
      paddingBottom: 32 + bottomInset,
      flexGrow: rideData.length === 0 ? 1 : undefined,
    }),
    [bottomInset, rideData.length, calendar.collapsed]
  );
  const rideEmptyMessage = calendar.hasRangeFilters || hasActiveFilters
    ? "Nessuna uscita corrispondente ai filtri."
    : "Nessuna uscita per questo giorno.";

  const rideListRef = useRef<FlatList<Ride> | null>(null);

  useEffect(() => {
    if (!keyword.active) {
      rideListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [calendar.selectedDay, calendar.hasRangeFilters, keyword.active]);

  return (
    <Screen title="Calendario" subtitle="Visualizza uscite per giorno" scroll={false} headerRight={headerRightBtn}>
      <View style={{ flex: 1, minHeight: 600, justifyContent: "flex-start", paddingBottom: bottomInset }}>
        <CalendarSearchModal visible={isSearchOpen} onClose={actions.closeSearch} state={searchModal} />

        {hasActiveFilters ? (
          <ActiveFiltersBanner chips={filterSummary} onClear={actions.clearFilters} />
        ) : null}

        {loading.initial ? (
          <View style={calendarStyles.centerRow}>
            <ActivityIndicator />
          </View>
        ) : showKeywordResults ? (
          <KeywordResultsList
            data={keyword.results}
            loading={keyword.loading}
            searchText={keyword.searchText}
            onSelect={actions.openRide}
            contentContainerStyle={keywordContentStyleBase}
            indicatorInsets={indicatorInsets}
            onClearFilters={actions.clearFilters}
          />
        ) : (
          <>
            <CalendarHeaderSection
              visibleMonth={calendar.visibleMonth}
              markedDates={calendar.markedDates}
              selectedDay={calendar.selectedDay}
              hasRangeFilters={calendar.hasRangeFilters}
              resultsCount={calendar.resultsCount}
              selectedDayLabel={calendar.selectedDayLabel}
              onDayPress={calendar.onDayPress}
              onMonthChange={calendar.onMonthChange}
              collapsed={calendar.collapsed}
              onToggle={actions.toggleCalendar}
              quickTargets={calendar.quickTargets}
              onQuickSelect={actions.goToDate}
            />
            <RideList
              data={rideData}
              onSelect={actions.openRide}
              contentContainerStyle={listContentStyle}
              indicatorInsets={indicatorInsets}
              listRef={rideListRef}
              emptyMessage={rideEmptyMessage}
              onClearFilters={hasActiveFilters ? actions.clearFilters : undefined}
            />
          </>
        )}
      </View>
    </Screen>
  );
}
