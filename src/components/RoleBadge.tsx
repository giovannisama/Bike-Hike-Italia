import React from "react";
import { Text, View } from "react-native";

type RoleKey = "owner" | "admin" | "member";

type RoleBadgeProps = {
  role: RoleKey;
};

const ROLE_CONFIG: Record<RoleKey, { bg: string; fg: string; label: string }> = {
  owner: { bg: "#1c1917", fg: "#ffffff", label: "OWNER" },
  admin: { bg: "#e2e8f0", fg: "#1e293b", label: "ADMIN" },
  member: { bg: "#f8fafc", fg: "#64748b", label: "MEMBER" },
};

export function RoleBadge({ role }: RoleBadgeProps) {
  const config = ROLE_CONFIG[role];

  return (
    <View
      style={{
        backgroundColor: config.bg,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: config.bg,
      }}
    >
      <Text style={{ color: config.fg, fontWeight: "700", fontSize: 12 }}>{config.label}</Text>
    </View>
  );
}
