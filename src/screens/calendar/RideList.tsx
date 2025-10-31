import React from "react";
import { FlatList, View, TouchableOpacity, Text, StyleProp, ViewStyle } from "react-native";
import { calendarStyles } from "./styles";
import { Ride } from "./types";
import { StatusBadge } from "./StatusBadge";

type RideListProps = {
  data: Ride[];
  onSelect: (ride: Ride) => void;
  contentContainerStyle: StyleProp<ViewStyle>;
  indicatorInsets: { bottom: number };
};

export function RideList({ data, onSelect, contentContainerStyle, indicatorInsets }: RideListProps) {
  return (
    <FlatList
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
              <StatusBadge text="Arch." bg="#E5E7EB" fg="#374151" />
            ) : isCancelled ? (
              <StatusBadge text="No" bg="#FEE2E2" fg="#991B1B" />
            ) : (
              <StatusBadge text="OK" bg="#111" fg="#fff" />
            )}
          </TouchableOpacity>
        );
      }}
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
