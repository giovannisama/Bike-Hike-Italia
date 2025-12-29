
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { UI } from "./Screen";

export type EventSection = {
    id: string;
    title: string;
    subtitle?: string; // For Hero
    caption: string;   // For Grid/List
    icon: any;         // MaterialCommunityIcons name
    iconColor?: string;
    badge?: number | null;
    enabled: boolean;
    permissionKey?: "ciclismo" | "trekking" | "bikeaut";
    onPress?: () => void;
    invisible?: boolean;
};

export function EventGridCard({ item, cardWidth }: { item: EventSection; cardWidth: number }) {
    if (item.invisible) {
        return <View style={{ width: cardWidth }} />;
    }
    return (
        <Pressable
            onPress={item.enabled ? item.onPress : undefined}
            style={({ pressed }) => [
                styles.gridCard,
                {
                    width: cardWidth,
                    borderTopColor: item.enabled ? item.iconColor : UI.colors.borderMuted,
                    borderTopWidth: 4,
                },
                !item.enabled && styles.gridCardDisabled,
                // 3D Press Effect: Scale down + Move down (reduce shadow)
                pressed && item.enabled && {
                    transform: [{ scale: 0.96 }, { translateY: 2 }],
                    shadowOpacity: 0.05,
                    shadowRadius: 4,
                    elevation: 2,
                },
            ]}
        >
            <View style={styles.gridHeader}>
                <View style={[styles.gridIcon, !item.enabled && { backgroundColor: "#F1F5F9" }]}>
                    <MaterialCommunityIcons
                        name={item.icon}
                        size={24}
                        color={item.enabled ? item.iconColor ?? UI.colors.primary : UI.colors.disabled}
                    />
                </View>
                {typeof item.badge === "number" && item.enabled && (
                    <View style={styles.badgeSoft}>
                        <Text style={styles.badgeSoftText}>{item.badge}</Text>
                    </View>
                )}
            </View>

            <View style={{ flex: 1, justifyContent: "flex-end" }}>
                <Text style={[styles.gridTitle, !item.enabled && { color: "#94A3B8" }]}>
                    {item.title}
                </Text>
                <Text style={[styles.gridCaption, !item.enabled && { color: "#CBD5E1" }]} numberOfLines={1}>
                    {item.caption}
                </Text>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    gridCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 20, // Slightly more rounded
        padding: 16,
        marginBottom: 16, // More spacing
        // Enhanced 3D Shadow
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 6 }, // Deeper shadow
        shadowOpacity: 0.12,
        shadowRadius: 10,
        elevation: 8, // High elevation for Android
        borderWidth: 1,
        borderColor: "#F1F5F9",
        minHeight: 120,
        justifyContent: "space-between",
    },
    gridCardDisabled: {
        backgroundColor: "#F8FAFC",
        borderTopColor: "#E2E8F0",
        shadowOpacity: 0.02,
        shadowRadius: 2,
        elevation: 1,
        borderWidth: 1,
        borderColor: "#F1F5F9",
    },
    gridHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 12,
    },
    gridIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: "#F0F9FF",
        alignItems: "center",
        justifyContent: "center",
    },
    badgeSoft: {
        backgroundColor: "#F0F9FF", // sky-50
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
        // No border
    },
    badgeSoftText: {
        fontSize: 13,
        fontWeight: "700",
        color: "#0EA5E9", // sky-500
    },
    gridTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: "#1E293B",
        marginBottom: 4,
    },
    gridCaption: {
        fontSize: 12,
        color: "#64748B",
        fontWeight: "500",
    },
});
