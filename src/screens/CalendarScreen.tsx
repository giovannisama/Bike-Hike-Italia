// src/screens/CalendarScreen.tsx
import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "../components/Screen";
import { calendarStyles } from "./calendar/styles";
import { CalendarSearchModal } from "./calendar/CalendarSearchModal";
import { CalendarHeaderSection } from "./calendar/CalendarHeaderSection";
import { KeywordResultsList } from "./calendar/KeywordResultsList";
import { RideList } from "./calendar/RideList";
import { useCalendarScreen } from "./calendar/useCalendarScreen";

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const bottomInset = useMemo(() => Math.max(insets.bottom, 16), [insets.bottom]);

  const keywordContentStyle = useMemo(
    () => ({
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 32 + bottomInset,
    }),
    [bottomInset]
  );

  const listContentStyle = useMemo(
    () => ({
      paddingTop: 12,
      paddingBottom: 32 + bottomInset,
    }),
    [bottomInset]
  );

  const indicatorInsets = useMemo(() => ({ bottom: bottomInset }), [bottomInset]);

  const { actions, searchModal, calendar, keyword, rideLists, loading, isSearchOpen } = useCalendarScreen();

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

  return (
    <Screen title="Calendario" subtitle="Visualizza uscite per giorno" scroll={false} headerRight={headerRightBtn}>
      <View style={{ flex: 1, minHeight: 600, justifyContent: "flex-start", paddingBottom: bottomInset }}>
        <CalendarSearchModal visible={isSearchOpen} onClose={actions.closeSearch} state={searchModal} />

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
            contentContainerStyle={keywordContentStyle}
            indicatorInsets={indicatorInsets}
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
            />
            <RideList
              data={rideData}
              onSelect={actions.openRide}
              contentContainerStyle={listContentStyle}
              indicatorInsets={indicatorInsets}
            />
          </>
        )}
      </View>
    </Screen>
  );
}
