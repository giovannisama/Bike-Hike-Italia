// src/components/Screen.tsx
import React from "react";
import {
  View,
  Text,
  ScrollView,
  ViewStyle,
  KeyboardAvoidingView,
  Platform,
  KeyboardAvoidingViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

const COLORS = {
  primary: "#0B3D2E",
  secondary: "#1FA36B",
  accent: "#C1275A",
  accentWarm: "#F7B32B",
  text: "#102A43",
  muted: "#5B6B7F",
  bg: "#ffffff",
  card: "#ffffff",
  tint: "#E6F4ED",
  danger: "#DC2626",
  warningBg: "#FFF7ED",
  warningBorder: "#FED7AA",
};

export const UI = {
  colors: COLORS,
  spacing: { xs: 6, sm: 10, md: 16, lg: 20, xl: 24 },
  radius: { sm: 10, md: 14, lg: 18, xl: 24, round: 999 },
  shadow: {
    card: {
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    hero: {
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
  },
  text: {
    h1Light: { fontSize: 22, fontWeight: "900", color: "#fff" } as const,
    h2Light: { fontSize: 16, fontWeight: "700", color: COLORS.accentWarm, letterSpacing: 0.4 } as const,
  },
};

type ScreenProps = {
  title?: string;
  titleMeta?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  useNativeHeader?: boolean;
  keyboardShouldPersistTaps?: "always" | "handled" | "never";
  headerContent?: React.ReactNode;
  avoidKeyboard?: boolean;
};

export function Screen({
  title,
  titleMeta,
  subtitle,
  headerRight,
  children,
  scroll = true,
  useNativeHeader = false,
  keyboardShouldPersistTaps = "always",
  headerContent,
  avoidKeyboard = true,
  backgroundColor,
}: ScreenProps & { backgroundColor?: string }) {
  const keyboardBehavior: KeyboardAvoidingViewProps["behavior"] = Platform.select({
    ios: "padding",
    android: "height",
    default: "padding",
  });
  const keyboardVerticalOffset = Platform.select({
    ios: 140,
    android: 100,
    default: 110,
  });
  // render tree kept inline so we don't recreate components each render (avoids TextInput blur)
  const content = (
    <View style={{ flex: 1, backgroundColor: backgroundColor ?? UI.colors.bg }}>
      {!useNativeHeader && (
        <LinearGradient
          colors={[UI.colors.primary, "#146C43", UI.colors.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingHorizontal: UI.spacing.lg,
            paddingTop: UI.spacing.lg,
            paddingBottom: UI.spacing.lg + 4,
          }}
        >
          <SafeAreaView edges={["top"]}>
            <View
              style={{
                flexDirection: "row",
                alignItems: headerContent ? "flex-start" : "center",
              }}
            >
              <View style={{ flex: 1, paddingRight: UI.spacing.sm }}>
                {headerContent ? (
                  headerContent
                ) : (
                  <>
                    {(!!title || !!titleMeta) && (
                      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}>
                        {!!title && (
                          <Text
                            style={{ fontSize: 22, fontWeight: "900", color: "#fff" }}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.85}
                          >
                            {title}
                          </Text>
                        )}
                        {!!titleMeta && (
                          <Text
                            style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.85}
                          >
                            {titleMeta}
                          </Text>
                        )}
                      </View>
                    )}
                    {!!subtitle && (
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "700",
                          color: UI.colors.accentWarm,
                          marginTop: 4,
                          letterSpacing: 0.4,
                        }}
                      >
                        {subtitle}
                      </Text>
                    )}
                  </>
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
          backgroundColor: backgroundColor ?? UI.colors.bg,
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
        backgroundColor: useNativeHeader ? (backgroundColor ?? UI.colors.bg) : UI.colors.primary,
      }}
    >
      {scroll ? (
        avoidKeyboard ? (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={keyboardBehavior}
            keyboardVerticalOffset={keyboardVerticalOffset}
          >
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                paddingBottom: UI.spacing.lg + 28,
              }}
              keyboardShouldPersistTaps={keyboardShouldPersistTaps}
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            >
              {content}
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingBottom: UI.spacing.lg + 28,
            }}
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          >
            {content}
          </ScrollView>
        )
      ) : (
        content
      )}
    </View>
  );
}

export function Hero({
  title,
  subtitle,
  style,
  rightSlot,
}: {
  title: string;
  subtitle?: string;
  style?: ViewStyle;
  rightSlot?: React.ReactNode;
}) {
  return (
    <LinearGradient
      colors={[UI.colors.primary, "#146C43", UI.colors.secondary]}
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
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1, paddingRight: UI.spacing.sm }}>
          <Text style={{ fontSize: 22, fontWeight: "900", color: "#fff" }}>{title}</Text>
          {!!subtitle && (
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: UI.colors.accentWarm,
                marginTop: 4,
                letterSpacing: 0.4,
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>
        {!!rightSlot && <View style={{ marginLeft: UI.spacing.sm }}>{rightSlot}</View>}
      </View>
    </LinearGradient>
  );
}
