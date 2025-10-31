import React from "react";
import { Text, View } from "react-native";

type StatusBadgeProps = {
  text: string;
  bg: string;
  fg: string;
};

export function StatusBadge({ text, bg, fg }: StatusBadgeProps) {
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}>
      <Text style={{ color: fg, fontWeight: "800", fontSize: 12 }}>{text}</Text>
    </View>
  );
}
