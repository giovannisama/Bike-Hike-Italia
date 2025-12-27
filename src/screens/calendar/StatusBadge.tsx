import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { UI } from "../../components/Screen";

type StatusBadgeProps = {
  status?: "active" | "cancelled" | "archived" | string; // Helper mode
  text?: string;
  bg?: string;
  fg?: string;
  icon?: string;
  accessibilityLabel?: string;
};

// UI RULES Standard Implementation
const STATUS_CONFIG: Record<string, { bg: string; fg: string; text: string; iconName: keyof typeof Ionicons.glyphMap }> = {
  active: {
    bg: "#DCFCE7", // Green-100
    fg: "#15803D", // Green-700
    text: "ATTIVA",
    iconName: "radio-button-on",
  },
  archived: {
    bg: "#F1F5F9", // Slate-100
    fg: "#475569", // Slate-600
    text: "ARCHIVIATA",
    iconName: "archive-outline",
  },
  cancelled: {
    bg: "#FEE2E2", // Red-100
    fg: "#B91C1C", // Red-700
    text: "ANNULLATA",
    iconName: "alert-circle-outline",
  },
};

export function StatusBadge({ status, text, bg, fg, icon, accessibilityLabel }: StatusBadgeProps) {
  let finalBg = bg || "#f1f5f9";
  let finalFg = fg || "#64748b";
  let finalText = text || status?.toUpperCase() || "";
  let finalIconName: string | undefined = undefined;

  // Use standardized config if matches
  if (status && STATUS_CONFIG[status]) {
    const config = STATUS_CONFIG[status];
    finalBg = config.bg;
    finalFg = config.fg;
    finalText = config.text;
    finalIconName = config.iconName;
  }
  // Custom manual overrides (if consumers still pass explicit text/colors)
  // We keep this to avoid breaking legacy calls that might use it for distinct reasons,
  // but status-based usage takes precedence for standard statuses.
  if (text) finalText = text;
  if (bg) finalBg = bg;
  if (fg) finalFg = fg;

  if (!finalText) return null;

  const label = accessibilityLabel ?? finalText;

  // Determine if icon is Ionicons name (from config) or raw string (from props)
  const isIonicon = !!finalIconName;
  const rawIcon = icon; // Legacy prop support

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={{
        backgroundColor: finalBg,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: finalBg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4
      }}
    >
      {/* Icon */}
      {isIonicon && <Ionicons name={finalIconName as any} size={12} color={finalFg} />}
      {!!rawIcon && <Text style={{ fontSize: 12, color: finalFg }}>{rawIcon}</Text>}

      <Text style={{ color: finalFg, fontWeight: "700", fontSize: 12, textTransform: "uppercase" }} accessibilityElementsHidden>
        {finalText}
      </Text>
    </View>
  );
}
