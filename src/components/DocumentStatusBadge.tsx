import React from "react";
import { Text, View } from "react-native";
import { UI } from "./Screen";

type DocumentStatus = "missing" | "valid" | "warning" | "expired";

type DocumentStatusBadgeProps = {
  status: DocumentStatus;
  label: string;
  accessibilityLabel?: string;
};

const STATUS_CONFIG: Record<DocumentStatus, { bg: string; fg: string }> = {
  missing: { bg: "#F1F5F9", fg: UI.colors.muted },
  valid: { bg: UI.colors.tint, fg: UI.colors.action },
  warning: { bg: UI.colors.warningBg, fg: "#9A3412" },
  expired: { bg: "#FEE2E2", fg: UI.colors.danger },
};

export function DocumentStatusBadge({ status, label, accessibilityLabel }: DocumentStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const a11yLabel = accessibilityLabel ?? label;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={a11yLabel}
      style={{
        backgroundColor: config.bg,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: config.bg,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      }}
    >
      <Text
        style={{
          color: config.fg,
          fontWeight: "700",
          fontSize: 12,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </View>
  );
}
