import React, { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Text,
  View,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
  Pressable,
} from "react-native";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { calendarStyles } from "./styles";
import { Ride } from "./types";
import { StatusBadge } from "./StatusBadge";

export type KeywordResultsListProps = {
  data: Ride[];
  loading: boolean;
  searchText: string;
  onSelect: (ride: Ride) => void;
  contentContainerStyle: StyleProp<ViewStyle>;
  indicatorInsets: { bottom: number };
  onClearFilters?: () => void;
};

export function KeywordResultsList({
  data,
  loading,
  searchText,
  onSelect,
  contentContainerStyle,
  indicatorInsets,
  onClearFilters,
}: KeywordResultsListProps) {
  const headerTitle = useMemo(() => {
    const term = searchText.trim();
    return term ? `Risultati per "${term}"` : "Risultati";
  }, [searchText]);

  const emptyMessage = useMemo(() => {
    const term = searchText.trim();
    return term ? `Nessuna uscita trovata per "${term}".` : "Nessun risultato.";
  }, [searchText]);

  if (loading && data.length === 0) {
    return (
      <View style={calendarStyles.centerRow}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1 }}
      data={data}
      keyExtractor={(item) => item.id}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      renderItem={({ item }) => {
        const isCancelled = item.status === "cancelled";
        const isArchived = !!item.archived;
        const dateObj = item.dateTime?.toDate?.() ?? item.date?.toDate?.() ?? null;
        const dateLabel = dateObj
          ? format(dateObj, "EEEE d MMMM yyyy 'alle' HH:mm", { locale: it })
          : "Data da definire";

        return (
          <TouchableOpacity style={[calendarStyles.rideCard, { marginHorizontal: 12 }]} onPress={() => onSelect(item)}>
            <View style={{ flex: 1 }}>
              <Text style={calendarStyles.rideDate} numberOfLines={1}>
                {dateLabel}
              </Text>
              <Text
                style={[
                  calendarStyles.rideTitle,
                  isCancelled && { textDecorationLine: "line-through", color: "#991B1B" },
                  isArchived && { color: "#374151" },
                ]}
                numberOfLines={1}
              >
                {item.title || "Uscita"}
              </Text>
              <Text style={calendarStyles.ridePlace} numberOfLines={1}>
                {item.meetingPoint || "—"}
              </Text>
            </View>
            {isArchived ? (
              <StatusBadge text="Arch." icon="📦" bg="#E5E7EB" fg="#374151" />
            ) : isCancelled ? (
              <StatusBadge text="No" icon="✖" bg="#FEE2E2" fg="#991B1B" />
            ) : (
              <StatusBadge text="OK" icon="✓" bg="#111" fg="#fff" />
            )}
          </TouchableOpacity>
        );
      }}
      ListHeaderComponent={
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Text style={calendarStyles.listTitle} numberOfLines={2}>
            {headerTitle}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <View style={[calendarStyles.centerRow, { paddingHorizontal: 16, paddingVertical: 32, gap: 12 }]}>
          <Text style={{ color: "#6B7280", textAlign: "center" }}>{emptyMessage}</Text>
          {onClearFilters ? (
            <Pressable
              onPress={onClearFilters}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: "#111" }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Rimuovi filtri</Text>
            </Pressable>
          ) : null}
        </View>
      }
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator
      scrollIndicatorInsets={indicatorInsets}
    />
  );
}
