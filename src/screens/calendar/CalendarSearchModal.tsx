import React from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { calendarStyles } from "./styles";
import { SearchModalState } from "./useCalendarScreen";

type CalendarSearchModalProps = {
  visible: boolean;
  onClose: () => void;
  state: SearchModalState;
};

export function CalendarSearchModal({ visible, onClose, state }: CalendarSearchModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        <SafeAreaView edges={["top", "left", "right"]}>
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 8,
              paddingBottom: 8,
              borderBottomWidth: 1,
              borderColor: "#e5e7eb",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#111827" }}>Cerca</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Chiudi filtri" accessibilityRole="button">
              <Text style={{ fontSize: 22, fontWeight: "700", color: "#111827" }}>×</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={{ padding: 16 }}>
            <View style={{ marginBottom: 12 }}>
              <Text style={calendarStyles.inputLabel}>Anno-Mese</Text>
              <TextInput
                value={state.ymLocal}
                onChangeText={state.setYmLocal}
                placeholder="YYYY-MM"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
                style={calendarStyles.textInput}
                returnKeyType="go"
                onSubmitEditing={state.apply}
              />
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={calendarStyles.inputLabel}>Intervallo date</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={state.fromLocal}
                  onChangeText={state.setFromLocal}
                  placeholder="Da YYYY-MM-DD"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="numbers-and-punctuation"
                  style={[calendarStyles.textInput, { flex: 1 }]}
                  returnKeyType="next"
                />
                <TextInput
                  value={state.toLocal}
                  onChangeText={state.setToLocal}
                  placeholder="A YYYY-MM-DD"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="numbers-and-punctuation"
                  style={[calendarStyles.textInput, { flex: 1 }]}
                  returnKeyType="done"
                />
              </View>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={calendarStyles.inputLabel}>Cerca (titolo/luogo/bici)</Text>
              <TextInput
                value={state.textLocal}
                onChangeText={state.setTextLocal}
                placeholder="Es. Gran Fondo, Pista ciclabile..."
                placeholderTextColor="#9CA3AF"
                style={calendarStyles.textInput}
                returnKeyType="search"
              />
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <Pressable onPress={state.apply} style={[calendarStyles.goBtn, { backgroundColor: "#111" }]}>
                <Text style={{ color: "#fff", fontWeight: "800" }}>Applica</Text>
              </Pressable>

              <Pressable
                onPress={state.reset}
                style={[calendarStyles.goBtn, { backgroundColor: "#6B7280" }]}
              >
                <Text style={{ color: "#fff", fontWeight: "800" }}>Reimposta</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
