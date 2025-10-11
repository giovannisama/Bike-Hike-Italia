// src/components/Button.tsx
import React from "react";
import {
  ActivityIndicator,
  GestureResponderEvent,
  Pressable,
  Text,
  ViewStyle,
} from "react-native";
import { UI } from "./Screen";

type PrimaryProps = {
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  style,
}: PrimaryProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          backgroundColor: isDisabled ? "#94a3b8" : UI.colors.primary,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: UI.radius.md,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.85 : 1,
          shadowColor: "#000",
          shadowOpacity: 0.12,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
          marginBottom: 8,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator />
      ) : (
        <Text style={{ color: "#fff", fontWeight: "800" }}>{label}</Text>
      )}
    </Pressable>
  );
}

type PillProps = {
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  active?: boolean;
  style?: ViewStyle;
};

export function PillButton({ label, onPress, active, style }: PillProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          borderWidth: 1,
          borderColor: active ? UI.colors.primary : "#cbd5e1",
          backgroundColor: active ? UI.colors.tint : "#fff",
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: UI.radius.round,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.85 : 1,
          marginRight: 8,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: active ? UI.colors.text : "#475569",
          fontWeight: active ? "800" : "700",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
