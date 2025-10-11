// src/components/Screen.tsx
import React from "react";
import { View, Text, ScrollView, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

export const UI = {
  colors: {
    primary: "#06b6d4",
    secondary: "#0ea5e9",
    text: "#0f172a",
    muted: "#64748b",
    bg: "#ffffff",
    card: "#ffffff",
    tint: "#ECFEFF",
  },
  spacing: { xs: 6, sm: 10, md: 16, lg: 20, xl: 24 },
  radius: { sm: 10, md: 14, lg: 18, xl: 24, round: 999 },
};

export function Screen({
  title,
  subtitle,
  headerRight,
  children,
  scroll = true,
  useNativeHeader = false,
}: {
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  useNativeHeader?: boolean;
}) {
  const Content = () => (
    <View style={{ flex: 1, backgroundColor: UI.colors.bg }}>
      {!useNativeHeader && (
        <LinearGradient
          colors={[UI.colors.primary, UI.colors.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingHorizontal: UI.spacing.lg,
            paddingTop: UI.spacing.lg,
            paddingBottom: UI.spacing.lg + 4,
          }}
        >
          <SafeAreaView edges={["top"]}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1, paddingRight: UI.spacing.sm }}>
                {!!title && (
                  <Text style={{ fontSize: 22, fontWeight: "900", color: "#fff" }}>
                    {title}
                  </Text>
                )}
                {!!subtitle && (
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "600",
                      color: "#F0F9FF",
                      marginTop: 4,
                    }}
                  >
                    {subtitle}
                  </Text>
                )}
              </View>
              {!!headerRight && <View style={{ marginLeft: UI.spacing.sm }}>{headerRight}</View>}
            </View>
          </SafeAreaView>
        </LinearGradient>
      )}

      <View
        style={{
          flex: 1,
          marginTop: useNativeHeader ? 0 : -UI.radius.xl,
          backgroundColor: UI.colors.bg,
          borderTopLeftRadius: useNativeHeader ? 0 : UI.radius.xl,
          borderTopRightRadius: useNativeHeader ? 0 : UI.radius.xl,
          padding: UI.spacing.lg,
        }}
      >
        {children}
      </View>
    </View>
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: useNativeHeader ? UI.colors.bg : UI.colors.primary,
      }}
    >
      {scroll ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <Content />
        </ScrollView>
      ) : (
        <Content />
      )}
    </View>
  );
}

export function Hero({
  title,
  subtitle,
  style,
}: {
  title: string;
  subtitle?: string;
  style?: ViewStyle;
}) {
  return (
    <LinearGradient
      colors={[UI.colors.primary, UI.colors.secondary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        {
          borderRadius: 20,
          paddingVertical: 16,
          paddingHorizontal: 16,
          marginBottom: 10,
        },
        style,
      ]}
    >
      <Text style={{ fontSize: 22, fontWeight: "900", color: "#fff" }}>{title}</Text>
      {!!subtitle && (
        <Text style={{ fontSize: 16, fontWeight: "600", color: "#F0F9FF", marginTop: 4 }}>
          {subtitle}
        </Text>
      )}
    </LinearGradient>
  );
}
