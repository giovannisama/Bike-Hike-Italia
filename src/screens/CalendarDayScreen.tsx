import React, { useMemo, useRef } from "react";
import { View, Text, TouchableOpacity, FlatList } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Ionicons } from "@expo/vector-icons";

import { RootStackParamList } from "../navigation/types";
import { Ride } from "./calendar/types";
import { RideList } from "./calendar/RideList";
import { Screen } from "../components/Screen";
import useCurrentProfile from "../hooks/useCurrentProfile";
import AccessDenied from "../components/AccessDenied";

type Props = NativeStackScreenProps<RootStackParamList, "CalendarDay">;

export default function CalendarDayScreen({ navigation, route }: Props) {
    const { canSeeCiclismo, loading: profileLoading } = useCurrentProfile();
    const { day, rides } = route.params;
    const insets = useSafeAreaInsets();

    const bottomInset = useMemo(() => Math.max(insets.bottom, 16), [insets.bottom]);
    const indicatorInsets = useMemo(() => ({ bottom: bottomInset }), [bottomInset]);

    const listRef = useRef<FlatList<Ride> | null>(null);

    const dayLabel = useMemo(() => {
        try {
            const d = new Date(day);
            return format(d, "eeee d MMMM yyyy", { locale: it });
        } catch (e) {
            return day;
        }
    }, [day]);

    const handleOpenRide = (ride: Ride) => {
        navigation.navigate("RideDetails", { rideId: ride.id, title: ride.title });
    };

    const headerLeft = (
        <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ paddingRight: 16, paddingVertical: 4 }}
        >
            <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
    );

    if (profileLoading) {
        return (
            <Screen useNativeHeader={true} scroll={false}>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Text>Caricamento…</Text>
                </View>
            </Screen>
        );
    }
    if (!canSeeCiclismo) {
        return (
            <AccessDenied message="La sezione Ciclismo non è abilitata per il tuo profilo." />
        );
    }

    return (
        <Screen
            title="Uscite del giorno"
            subtitle={dayLabel}
            headerLeft={headerLeft}
            scroll={false}
        >
            <View style={{ flex: 1, backgroundColor: "#F9FAFB" }}>
                <RideList
                    data={rides as Ride[]}
                    onSelect={handleOpenRide}
                    contentContainerStyle={{
                        paddingTop: 16,
                        paddingBottom: 32 + bottomInset,
                    }}
                    indicatorInsets={indicatorInsets}
                    listRef={listRef}
                    emptyMessage="Nessuna uscita per questo giorno."
                />
            </View>
        </Screen>
    );
}
