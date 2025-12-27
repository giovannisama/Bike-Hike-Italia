// src/components/ScreenHeader.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

type ScreenHeaderProps = {
    title: string;
    subtitle?: string | React.ReactNode;
    showBack?: boolean;
    rightAction?: React.ReactNode;
    // Allows overriding the top padding if needed (e.g. for AdminScreen without back button)
    topPadding?: number;
    disableUppercase?: boolean;
};

export function ScreenHeader({
    title,
    subtitle,
    showBack = true,
    rightAction,
    topPadding,
    disableUppercase
}: ScreenHeaderProps) {
    const navigation = useNavigation<any>();

    return (
        <View style={styles.container}>
            {/* Absolute Gradient Background */}
            <View style={styles.gradientContainer}>
                <LinearGradient
                    colors={["rgba(20, 83, 45, 0.08)", "rgba(14, 165, 233, 0.08)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                />
            </View>

            {/* Header Content */}
            <View style={[
                styles.headerBlock,
                topPadding !== undefined ? { paddingTop: topPadding } : undefined
            ]}>

                {/* Top Row: Back Button & Right Action */}
                <View style={styles.actionRow}>
                    {showBack ? (
                        <TouchableOpacity
                            onPress={() => navigation.goBack()}
                            style={styles.backButton}
                            hitSlop={10}
                        >
                            <Ionicons name="arrow-back" size={24} color="#1E293B" />
                        </TouchableOpacity>
                    ) : (
                        // Spacer if back is hidden but we want to maintain alignment? 
                        // Actually, usually if back is hidden we align left or center.
                        // For now, if hidden, we just render nothing.
                        <View />
                    )}

                    {rightAction}
                </View>

                {/* Title & Subtitle */}
                <View>
                    <Text style={[styles.headerTitle, disableUppercase && { textTransform: 'none' }]}>{title}</Text>
                    {!!subtitle && (
                        typeof subtitle === 'string'
                            ? <Text style={styles.headerSubtitle}>{subtitle}</Text>
                            : subtitle
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        // This container sits at the top of the screen content
        marginBottom: 0,
    },
    gradientContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 200, // Covers enough height for the header area
        zIndex: -1,
    },
    headerBlock: {
        paddingHorizontal: 16,
        paddingTop: 8, // Default top padding
        paddingBottom: 24,
        gap: 12
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
        height: 32, // Reserved height for back button row
    },
    backButton: {
        width: 40,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: "800",
        color: "#1E293B",
        letterSpacing: -0.5,
        textTransform: 'uppercase'
    },
    headerSubtitle: {
        fontSize: 14,
        fontWeight: "500",
        color: "#64748B",
        marginTop: 4
    },
});
