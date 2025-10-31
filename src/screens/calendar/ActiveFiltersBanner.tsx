import React from "react";
import { View, Text, TouchableOpacity } from "react-native";

export function ActiveFiltersBanner({
  chips,
  onClear,
}: {
  chips: string[];
  onClear: () => void;
}) {
  if (chips.length === 0) return null;

  return (
    <View
      style={{
        marginHorizontal: 12,
        marginBottom: 8,
        padding: 12,
        borderRadius: 12,
        backgroundColor: "#F1F5F9",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontWeight: "700", color: "#0F172A" }}>Filtri attivi</Text>
        <TouchableOpacity onPress={onClear} accessibilityRole="button">
          <Text style={{ color: "#1D4ED8", fontWeight: "700" }}>Pulisci</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {chips.map((chip) => (
          <View
            key={chip}
            style={{
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: "#CBD5F5",
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: "#1E293B", fontWeight: "600" }}>{chip}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
