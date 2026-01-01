import React from "react";
import { Text, StyleSheet, DeviceEventEmitter } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

// Screens
import HomeScreen from "../screens/HomeScreen";
import BoardScreen from "../screens/BoardScreen";
import CalendarScreen from "../screens/CalendarScreen";
import ProfileScreen from "../screens/ProfileScreen";
import type { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabLabel({ label, color }: { label: string; color: string }) {
    return (
        <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            allowFontScaling={false}
            style={{
                marginTop: 2,
                fontWeight: "800",
                fontSize: 10,
                color,
                maxWidth: 64,
                textAlign: "center",
            }}
        >
            {label}
        </Text>
    );
}

export default function MainTabs() {
    const insets = useSafeAreaInsets();
    const baseHeight = 74;
    const basePaddingBottom = 12;

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarShowLabel: true,
                tabBarActiveTintColor: "#0284C7", // Sky-600
                tabBarInactiveTintColor: "#94A3B8", // Slate-400
                tabBarHideOnKeyboard: true,
                tabBarStyle: {
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingHorizontal: 0,
                    height: baseHeight + insets.bottom,
                    paddingTop: 8,
                    paddingBottom: basePaddingBottom + insets.bottom,
                    borderTopWidth: 0,
                    backgroundColor: "#fff",
                    shadowColor: "#000",
                    shadowOpacity: 0.05,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: -4 },
                    elevation: 5,
                },
                tabBarLabelStyle: {
                    // Label rendering is handled via per-screen tabBarLabel (single-line).
                    // Keep minimal spacing only.
                    marginTop: 0,
                },
                tabBarItemStyle: {
                    flex: 1,
                    width: "auto",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 6,
                    marginHorizontal: 0, // Reset margin
                    borderRadius: 999,
                },
                tabBarActiveBackgroundColor: "#E0F2FE", // light sky pill
                tabBarInactiveBackgroundColor: "transparent",
                tabBarIcon: ({ color, size }) => {
                    const iconSize = size + 2;
                    switch (route.name) {
                        case "TabHome":
                            return <Ionicons name="home-outline" size={iconSize} color={color} />;
                        case "TabBacheca":
                            return <Ionicons name="newspaper-outline" size={iconSize} color={color} />;
                        case "TabCalendar":
                            return <Ionicons name="calendar-outline" size={iconSize} color={color} />;
                        case "TabProfile":
                            return <Ionicons name="person-outline" size={iconSize} color={color} />;
                        default:
                            return null;
                    }
                },
            })}
        >
            <Tab.Screen
                name="TabHome"
                component={HomeScreen}
                options={{
                    title: "Home",
                    tabBarLabel: ({ color }) => <TabLabel label="Home" color={color} />,
                }}
            />
            <Tab.Screen
                name="TabBacheca"
                component={BoardScreen}
                options={{
                    title: "Bacheca",
                    tabBarLabel: ({ color }) => <TabLabel label="Bacheca" color={color} />,
                }}
            />
            <Tab.Screen
                name="TabCalendar"
                component={CalendarScreen}
                options={{
                    title: "Calendario",
                    tabBarLabel: ({ color }) => <TabLabel label="Calendario" color={color} />,
                }}
                listeners={{
                    tabPress: () => {
                        DeviceEventEmitter.emit("event.calendar.reset");
                    },
                }}
            />
            <Tab.Screen
                name="TabProfile"
                component={ProfileScreen}
                options={{
                    title: "Profilo",
                    tabBarLabel: ({ color }) => <TabLabel label="Profilo" color={color} />,
                }}
            />
        </Tab.Navigator>
    );
}
