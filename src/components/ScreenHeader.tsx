// src/components/ScreenHeader.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UI } from './Screen';

type ScreenHeaderProps = {
    title: string;
    subtitle?: string | React.ReactNode;
    showBack?: boolean;
    rightAction?: React.ReactNode;
    titleNumberOfLines?: number;
    titleAllowShrink?: boolean;
    titleMinScale?: number;
    // Allows overriding the top padding if needed
    topPadding?: number;
    disableUppercase?: boolean; // Kept for compat, but Info style is Mixed case
    backIconColor?: string;
    headerIcon?: any; // Icon name from MaterialCommunityIcons
    headerIconColor?: string;
};

export function ScreenHeader({
    title,
    subtitle,
    showBack = true,
    rightAction,
    titleNumberOfLines,
    titleAllowShrink,
    titleMinScale,
    topPadding,
    disableUppercase,
    backIconColor,
    headerIcon,
    headerIconColor
}: ScreenHeaderProps) {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();

    const effectiveTopPadding = topPadding !== undefined ? topPadding : (insets.top > 0 ? insets.top + 10 : 20);
    const titleLines = titleNumberOfLines ?? 1;
    const allowShrink = titleAllowShrink ?? titleLines === 1;
    const minScale = titleMinScale ?? 0.8;

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
                { paddingTop: effectiveTopPadding }
            ]}>
                <View style={styles.mainRow}>
                    <View style={styles.leftGroup}>
                        {showBack && (
                            <Pressable
                                onPress={() => navigation.goBack()}
                                hitSlop={15}
                                style={styles.backButton}
                            >
                                <Ionicons name="arrow-back" size={24} color={backIconColor ?? "#1E293B"} />
                            </Pressable>
                        )}
                        {headerIcon && (
                            <View style={{ marginRight: 8, justifyContent: 'center' }}>
                                <MaterialCommunityIcons name={headerIcon} size={28} color={headerIconColor ?? "#1E293B"} />
                            </View>
                        )}
                        <View style={styles.titleBlock}>
                            <Text
                                style={styles.headerTitle}
                                numberOfLines={titleLines}
                                ellipsizeMode="tail"
                                adjustsFontSizeToFit={allowShrink}
                                minimumFontScale={allowShrink ? minScale : undefined}
                            >
                                {title}
                            </Text>
                            {!!subtitle && (
                                typeof subtitle === 'string'
                                    ? <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text>
                                    : subtitle
                            )}
                        </View>
                    </View>

                    {rightAction && (
                        <View style={styles.rightAction}>
                            {rightAction}
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 0,
        zIndex: 10,
    },
    gradientContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0, // Fill the container height
        zIndex: -1,
    },
    headerBlock: {
        paddingHorizontal: 20,
        paddingBottom: 24,
    },
    mainRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16
    },
    leftGroup: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        flex: 1,
    },
    backButton: {
        paddingRight: 4,
        marginTop: 4
    },
    titleBlock: {
        flex: 1,
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: "800",
        color: "#1E293B",
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 15,
        fontWeight: "500",
        color: "#64748B",
        marginTop: 2
    },
    rightAction: {
        // marginTop: 4
    }
});
