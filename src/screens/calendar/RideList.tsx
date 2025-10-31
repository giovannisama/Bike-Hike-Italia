import React from "react";
import {
  FlatList,
  View,
  TouchableOpacity,
  Text,
  StyleProp,
  ViewStyle,
  Pressable,
} from "react-native";
import { calendarStyles } from "./styles";
import { Ride } from "./types";
import { StatusBadge } from "./StatusBadge";

export type RideListProps = {
  data: Ride[];
  onSelect: (ride: Ride) => void;
  contentContainerStyle: StyleProp<ViewStyle>;
  indicatorInsets: { bottom: number };
  listRef?: React.RefObject<FlatList<Ride> | null>;
  emptyMessage?: string;
  onClearFilters?: () => void;
};

export function RideList({
  data,
  onSelect,
  contentContainerStyle,
  indicatorInsets,
  listRef,
  emptyMessage,
  onClearFilters,
}: RideListProps) {
  return (
    <FlatList
      ref={listRef}
      style={{ flex: 1 }}
      data={data}
      keyExtractor={(item) => item.id}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      renderItem={({ item }) => {
        const isCancelled = item.status === "cancelled";
        const isArchived = !!item.archived;
        return (
          <TouchableOpacity style={[calendarStyles.rideCard, { marginHorizontal: 12 }]} onPress={() => onSelect(item)}>
            <View style={{ flex: 1 }}>
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
      ListEmptyComponent={
        <View style={[calendarStyles.centerRow, { paddingVertical: 40 }]}>
          <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 24 }}>
            <Text style={{ color: "#64748B", textAlign: "center" }}>
              {emptyMessage || "Nessuna uscita disponibile."}
            </Text>
            {onClearFilters ? (
              <Pressable
                onPress={onClearFilters}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: "#111",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Rimuovi filtri</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      }
      initialNumToRender={10}
      windowSize={10}
      maxToRenderPerBatch={10}
      removeClippedSubviews={false}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator
      scrollIndicatorInsets={indicatorInsets}
    />
  );
}
