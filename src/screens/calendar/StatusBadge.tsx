import React from "react";
import { Text, View } from "react-native";

type StatusBadgeProps = {
  text: string;
  bg: string;
  fg: string;
  icon?: string;
  accessibilityLabel?: string;
};

export function StatusBadge({ text, bg, fg, icon, accessibilityLabel }: StatusBadgeProps) {
  const label = accessibilityLabel ?? text;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}
    >
      <Text style={{ color: fg, fontWeight: "800", fontSize: 12 }} accessibilityElementsHidden>
        {icon ? `${icon} ${text}` : text}
      </Text>
    </View>
  );
}
