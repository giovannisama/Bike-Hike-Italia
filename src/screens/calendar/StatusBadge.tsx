import React from "react";
import { Text, View } from "react-native";
import { UI } from "../../components/Screen";

type StatusBadgeProps = {
  status?: "active" | "cancelled" | "archived" | string; // Helper mode
  text?: string;
  bg?: string;
  fg?: string;
  icon?: string;
  accessibilityLabel?: string;
};

export function StatusBadge({ status, text, bg, fg, icon, accessibilityLabel }: StatusBadgeProps) {
  let finalBg = bg;
  let finalFg = fg || "#fff";
  let finalText = text;

  if (status) {
    if (status === "cancelled") {
      finalBg = "#fee2e2"; // red-100
      finalFg = "#991b1b"; // red-800
      finalText = "ANNULLATA";
    } else if (status === "archived") {
      finalBg = "#f1f5f9"; // slate-100
      finalFg = "#64748b"; // slate-500
      finalText = "ARCHIVIATA";
    } else if (status === "active") {
      finalBg = "#dcfce7"; // green-100
      finalFg = UI.colors.action; // green-600
      finalText = "ATTIVA";
    } else {
      // Fallback
      finalText = status.toUpperCase();
      finalBg = "#f1f5f9";
      finalFg = "#64748b";
    }
  }

  if (!finalText) return null;

  const label = accessibilityLabel ?? finalText;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={{ backgroundColor: finalBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: finalBg }}
    >
      <Text style={{ color: finalFg, fontWeight: "700", fontSize: 12, textTransform: "uppercase" }} accessibilityElementsHidden>
        {icon ? `${icon} ${finalText}` : finalText}
      </Text>
    </View>
  );
}
