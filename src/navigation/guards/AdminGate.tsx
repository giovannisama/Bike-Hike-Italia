import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import AdminScreen from "../../screens/AdminScreen";
import useCurrentProfile from "../../hooks/useCurrentProfile";

export default function AdminGate() {
    const { isAdmin, loading } = useCurrentProfile();

    if (loading) {
        return (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (!isAdmin) {
        return (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", marginBottom: 8 }}>Accesso negato</Text>
                <Text style={{ textAlign: "center", color: "#475569" }}>
                    Questa sezione è riservata agli Admin e agli Owner.
                </Text>
            </View>
        );
    }

    return <AdminScreen />;
}
