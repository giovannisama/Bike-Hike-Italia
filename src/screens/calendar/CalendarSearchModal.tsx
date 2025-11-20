import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { calendarStyles } from "./styles";
import { SearchModalState } from "./useCalendarScreen";
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { pad2 } from "./helpers";
import { Picker } from "@react-native-picker/picker";

type CalendarSearchModalProps = {
  visible: boolean;
  onClose: () => void;
  state: SearchModalState;
};

export function CalendarSearchModal({ visible, onClose, state }: CalendarSearchModalProps) {
  const [iosPickerField, setIosPickerField] = useState<"from" | "to" | null>(null);
  const [iosPickerDate, setIosPickerDate] = useState<Date>(new Date());
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [androidYmModalVisible, setAndroidYmModalVisible] = useState(false);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(() => new Date().getMonth());
  const isIos = Platform.OS === "ios";

  const hasYearMonthFilter = state.ymLocal.trim().length > 0;
  const hasDateRangeFilter =
    state.fromLocal.trim().length > 0 || state.toLocal.trim().length > 0;

  const monthNames = useMemo(
    () => [
      "Gennaio",
      "Febbraio",
      "Marzo",
      "Aprile",
      "Maggio",
      "Giugno",
      "Luglio",
      "Agosto",
      "Settembre",
      "Ottobre",
      "Novembre",
      "Dicembre",
    ],
    []
  );
  const yearOptions = useMemo(() => {
    const start = 2020;
    const end = new Date().getFullYear() + 2;
    const years: number[] = [];
    for (let year = start; year <= end; year += 1) {
      years.push(year);
    }
    return years;
  }, []);

  const formatIsoDate = (date: Date) =>
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

  const parseIsoDate = (value: string) => {
    if (!value) return null;
    const parts = value.split("-");
    if (parts.length !== 3) return null;
    const [year, month, day] = parts.map((segment) => Number(segment));
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      return null;
    }
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const applyDateValue = (field: "from" | "to", date: Date) => {
    const formatted = formatIsoDate(date);
    const fromDate = parseIsoDate(state.fromLocal);
    const toDate = parseIsoDate(state.toLocal);
    if (field === "from") {
      state.setFromLocal(formatted);
      // mantieni la "A" ≥ "Da"
      if (toDate && toDate < date) {
        state.setToLocal(formatted);
      }
      return;
    }
    if (fromDate && date < fromDate) {
      state.setToLocal(formatIsoDate(fromDate));
      return;
    }
    state.setToLocal(formatted);
  };

  const openPicker = (field: "from" | "to") => {
    if (hasYearMonthFilter) return;
    const currentValue = field === "from" ? state.fromLocal : state.toLocal;
    const baseDate = parseIsoDate(currentValue) ?? new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: baseDate,
        mode: "date",
        is24Hour: true,
        onChange: (_event, selectedDate) => {
          if (!_event || _event.type !== "set" || !selectedDate) return;
          applyDateValue(field, selectedDate);
        },
      });
      return;
    }
    setIosPickerDate(baseDate);
    setIosPickerField(field);
  };

  const confirmIosPicker = () => {
    if (!iosPickerField) return;
    applyDateValue(iosPickerField, iosPickerDate);
    setIosPickerField(null);
  };

  const parseYearMonth = (value: string) => {
    if (!value) return null;
    const parts = value.split("-");
    if (parts.length !== 2) return null;
    const [year, month] = parts.map((segment) => Number(segment));
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      month < 1 ||
      month > 12 ||
      year < 1900
    ) {
      return null;
    }
    return { year, month };
  };

  const formatMonthYearLabel = (value: string) => {
    const parsed = parseYearMonth(value);
    if (!parsed) return value;
    return `${monthNames[parsed.month - 1]} ${parsed.year}`;
  };

  const applyYearMonthSelection = (year: number, monthIndex: number) => {
    const d = new Date(year, monthIndex, 1);
    const ymStr = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    state.setYmLocal(ymStr);
    setMonthPickerVisible(false);
    setAndroidYmModalVisible(false);
  };

  const openYearMonthPicker = () => {
    if (hasDateRangeFilter) return;
    const parsed = parseYearMonth(state.ymLocal);
    if (Platform.OS === "android") {
      setSelectedYear(parsed?.year ?? new Date().getFullYear());
      setSelectedMonthIndex(parsed ? parsed.month - 1 : new Date().getMonth());
      setAndroidYmModalVisible(true);
      return;
    }
    setSelectedYear(parsed?.year ?? new Date().getFullYear());
    setSelectedMonth(parsed?.month ?? new Date().getMonth() + 1);
    setMonthPickerVisible(true);
  };

  const confirmYearMonth = () => {
    if (isIos) {
      applyYearMonthSelection(selectedYear, selectedMonth - 1);
      return;
    }
    applyYearMonthSelection(selectedYear, selectedMonthIndex);
  };

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
              <Pressable
                onPress={openYearMonthPicker}
                disabled={hasDateRangeFilter}
                style={({ pressed }) => [
                  calendarStyles.textInput,
                  {
                    justifyContent: "center",
                    opacity: hasDateRangeFilter ? 0.55 : pressed ? 0.7 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Apri selezione anno e mese"
                accessibilityState={{ disabled: hasDateRangeFilter }}
              >
                <Text style={{ color: state.ymLocal ? "#111827" : "#9CA3AF" }}>
                  {state.ymLocal ? formatMonthYearLabel(state.ymLocal) : "YYYY-MM"}
                </Text>
              </Pressable>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={calendarStyles.inputLabel}>Intervallo date</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => openPicker("from")}
                  disabled={hasYearMonthFilter}
                  style={({ pressed }) => [
                    calendarStyles.textInput,
                    {
                      flex: 1,
                      justifyContent: "center",
                      opacity: hasYearMonthFilter ? 0.55 : pressed ? 0.7 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Apri selezione data Da"
                  accessibilityState={{ disabled: hasYearMonthFilter }}
                >
                  <Text style={{ color: state.fromLocal ? "#111827" : "#9CA3AF" }}>
                    {state.fromLocal || "Da YYYY-MM-DD"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => openPicker("to")}
                  disabled={hasYearMonthFilter}
                  style={({ pressed }) => [
                    calendarStyles.textInput,
                    {
                      flex: 1,
                      justifyContent: "center",
                      opacity: hasYearMonthFilter ? 0.55 : pressed ? 0.7 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Apri selezione data A"
                  accessibilityState={{ disabled: hasYearMonthFilter }}
                >
                  <Text style={{ color: state.toLocal ? "#111827" : "#9CA3AF" }}>
                    {state.toLocal || "A YYYY-MM-DD"}
                  </Text>
                </Pressable>
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

      {/* Modal iOS per il DateTimePicker "Da/A" */}
      {Platform.OS === "ios" && iosPickerField && (
        <Modal
          transparent
          visible={true}
          animationType="slide"
          onRequestClose={() => setIosPickerField(null)}
        >
          <View style={pickerModalStyles.wrapper}>
            {/* backdrop cliccabile */}
            <TouchableWithoutFeedback onPress={() => setIosPickerField(null)}>
              <View style={pickerModalStyles.overlay} />
            </TouchableWithoutFeedback>

            {/* sheet in basso con header + picker */}
            <View style={pickerModalStyles.container}>
              <View style={pickerModalStyles.actions}>
                <Pressable onPress={() => setIosPickerField(null)}>
                  <Text style={pickerModalStyles.cancelText}>Annulla</Text>
                </Pressable>
                <Pressable onPress={confirmIosPicker}>
                  <Text style={pickerModalStyles.confirmText}>Fatto</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={iosPickerDate}
                mode="date"
                display={isIos ? "spinner" : "default"}
                preferredDatePickerStyle={isIos ? "spinner" : undefined}
                onChange={(_: DateTimePickerEvent, selected) => {
                  if (selected) setIosPickerDate(selected);
                }}
                locale="it-IT"
                style={pickerModalStyles.picker}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Picker Mese/Anno */}
      {isIos && monthPickerVisible && (
        <Modal
          transparent
          visible={true}
          animationType="slide"
          onRequestClose={() => setMonthPickerVisible(false)}
        >
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <TouchableWithoutFeedback onPress={() => setMonthPickerVisible(false)}>
              <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} />
            </TouchableWithoutFeedback>
            <View
              style={{
                backgroundColor: "#fff",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingBottom: 16,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 16,
                }}
              >
                <Pressable onPress={() => setMonthPickerVisible(false)}>
                  <Text style={{ color: "#111827", fontWeight: "600" }}>Annulla</Text>
                </Pressable>
                <Pressable onPress={confirmYearMonth}>
                  <Text style={{ color: "#0B3D2E", fontWeight: "700" }}>Fatto</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: "row" }}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      textAlign: "center",
                      fontSize: 12,
                      color: "#6B7280",
                      marginBottom: 4,
                    }}
                  >
                    Mese
                  </Text>
                  <Picker
                    selectedValue={selectedMonth}
                    onValueChange={(value) => setSelectedMonth(value)}
                  >
                    {monthNames.map((label, index) => (
                      <Picker.Item key={label} label={label} value={index + 1} />
                    ))}
                  </Picker>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      textAlign: "center",
                      fontSize: 12,
                      color: "#6B7280",
                      marginBottom: 4,
                    }}
                  >
                    Anno
                  </Text>
                  <Picker
                    selectedValue={selectedYear}
                    onValueChange={(value) => setSelectedYear(value)}
                  >
                    {yearOptions.map((year) => (
                      <Picker.Item key={year} label={String(year)} value={year} />
                    ))}
                  </Picker>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* FIX: su Android il picker "Anno-Mese" usa una modal custom mese/anno invece del calendario con i giorni */}
      {Platform.OS === "android" && androidYmModalVisible && (
        <Modal
          transparent
          visible={true}
          animationType="slide"
          onRequestClose={() => setAndroidYmModalVisible(false)}
        >
          <View style={androidMonthPickerStyles.overlay}>
            <TouchableWithoutFeedback onPress={() => setAndroidYmModalVisible(false)}>
              <View style={{ flex: 1 }} />
            </TouchableWithoutFeedback>
            <View style={androidMonthPickerStyles.sheet}>
              <View style={androidMonthPickerStyles.header}>
                <Pressable onPress={() => setAndroidYmModalVisible(false)}>
                  <Text style={androidMonthPickerStyles.cancelText}>Annulla</Text>
                </Pressable>
                <Pressable onPress={confirmYearMonth}>
                  <Text style={androidMonthPickerStyles.confirmText}>Fatto</Text>
                </Pressable>
              </View>
              <View style={androidMonthPickerStyles.columns}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={[androidMonthPickerStyles.column, { marginRight: 8 }]}
                >
                  {yearOptions.map((year) => (
                    <Pressable
                      key={year}
                      onPress={() => setSelectedYear(year)}
                      style={androidMonthPickerStyles.option}
                    >
                      <Text
                        style={[
                          androidMonthPickerStyles.optionText,
                          selectedYear === year && androidMonthPickerStyles.optionTextSelected,
                        ]}
                      >
                        {year}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={androidMonthPickerStyles.column}
                >
                  {monthNames.map((label, index) => (
                    <Pressable
                      key={label}
                      onPress={() => setSelectedMonthIndex(index)}
                      style={androidMonthPickerStyles.option}
                    >
                      <Text
                        style={[
                          androidMonthPickerStyles.optionText,
                          selectedMonthIndex === index &&
                            androidMonthPickerStyles.optionTextSelected,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </Modal>
  );
}

const pickerModalStyles = StyleSheet.create({
  wrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  // backdrop sopra il foglio
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  // sheet in basso con altezza minima sufficiente
  container: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    minHeight: 320,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 4,
  },
  cancelText: {
    color: "#111827",
    fontWeight: "600",
  },
  confirmText: {
    color: "#0B3D2E",
    fontWeight: "700",
  },
  picker: {
    width: "100%",
    minHeight: 260,
  },
});

const androidMonthPickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 16,
    maxHeight: 320,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 4,
  },
  cancelText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 16,
  },
  confirmText: {
    color: "#0B3D2E",
    fontWeight: "700",
    fontSize: 16,
  },
  columns: {
    flexDirection: "row",
    marginTop: 12,
    height: 220,
  },
  column: {
    flex: 1,
  },
  option: {
    paddingVertical: 10,
  },
  optionText: {
    textAlign: "center",
    fontSize: 16,
    color: "#111827",
  },
  optionTextSelected: {
    color: "#0B3D2E",
    fontWeight: "700",
  },
});
