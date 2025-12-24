import React, { useMemo, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { SearchModalState } from "./useCalendarScreen";
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { pad2 } from "./helpers";
import { Picker } from "@react-native-picker/picker";
import { Ionicons } from "@expo/vector-icons";

// Using standardized colors/styles from observation of new files
const ACTION_GREEN = "#22c55e";

type CalendarSearchModalProps = {
  visible: boolean;
  onClose: () => void;
  state: SearchModalState;
};

export function CalendarSearchModal({ visible, onClose, state }: CalendarSearchModalProps) {
  const [iosPickerField, setIosPickerField] = useState<"from" | "to" | null>(null);
  const [iosPickerDate, setIosPickerDate] = useState<Date>(new Date());

  const insets = useSafeAreaInsets();
  const headerTopPadding = insets.top > 0 ? insets.top + 12 : 24;

  // Animation state for Top Sheet
  const translateY = React.useRef(new Animated.Value(-600)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        speed: 12,
        bounciness: 4
      }).start();
    } else {
      translateY.setValue(-600);
    }
  }, [visible]);

  const handleClose = () => {
    Animated.timing(translateY, {
      toValue: -600,
      duration: 250,
      useNativeDriver: true,
      easing: Easing.in(Easing.cubic)
    }).start(() => {
      onClose();
    });
  };

  // Hook apply/reset to animate out first
  const handleApply = () => {
    Animated.timing(translateY, {
      toValue: -600,
      duration: 200, // faster
      useNativeDriver: true
    }).start(() => {
      state.apply();
    });
  };

  const handleReset = () => {
    state.reset(); // reset clears immediately, maybe we want to keep it open? 
    // Usually reset just clears fields. 
    // If user wants to close, they press X. 
    // But let's assume standard behavior is just clear fields.
  };

  // Custom Year/Month picker states
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
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      {/* Overlay Background */}
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}>
          {/* Top Sheet Container */}
          <TouchableWithoutFeedback>
            <Animated.View
              style={{
                transform: [{ translateY }],
                backgroundColor: "#FDFCF8",
                borderBottomLeftRadius: 24,
                borderBottomRightRadius: 24,
                overflow: 'hidden',
                maxHeight: '90%', // safety
                elevation: 5,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 12,
                paddingTop: headerTopPadding // Apply safe area padding here to container or header
              }}
            >
              {/* HEADER */}
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingBottom: 18, // moved top padding to container
                paddingTop: 12, // small internal top padding
                backgroundColor: '#FDFCF8',
                borderBottomWidth: 1,
                borderBottomColor: '#F1F5F9'
              }}>
                <Text style={{ fontSize: 24, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 }}>
                  Cerca
                </Text>
                <TouchableOpacity
                  onPress={handleClose}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={{
                    width: 36, // Slightly larger visual
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#F1F5F9',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Ionicons name="close" size={22} color="#0F172A" />
                </TouchableOpacity>
              </View>

              {/* Content */}
              <View>

                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
                  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 24 }}>

                    {/* ANNO-MESE */}
                    <View>
                      <Text style={styles.sectionTitle}>PERIODO (MESE)</Text>
                      <Pressable
                        onPress={openYearMonthPicker}
                        disabled={hasDateRangeFilter}
                        style={({ pressed }) => [
                          styles.inputBase,
                          {
                            opacity: hasDateRangeFilter ? 0.5 : pressed ? 0.8 : 1,
                            backgroundColor: hasDateRangeFilter ? "#F3F4F6" : "#FFF",
                          },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Ionicons name="calendar-outline" size={20} color={state.ymLocal ? "#0F172A" : "#94A3B8"} />
                          <Text style={{ fontSize: 16, color: state.ymLocal ? "#0F172A" : "#94A3B8", fontWeight: state.ymLocal ? '600' : '400' }}>
                            {state.ymLocal ? formatMonthYearLabel(state.ymLocal) : "Seleziona mese..."}
                          </Text>
                        </View>
                        {state.ymLocal && (
                          <TouchableOpacity onPress={() => state.setYmLocal('')} hitSlop={10}>
                            <Ionicons name="close-circle" size={18} color="#94A3B8" />
                          </TouchableOpacity>
                        )}
                      </Pressable>
                    </View>

                    {/* INTERVALLO DATE */}
                    <View>
                      <Text style={styles.sectionTitle}>OPPURE INTERVALLO DATE</Text>
                      <View style={{ flexDirection: "row", gap: 12 }}>
                        <Pressable
                          onPress={() => openPicker("from")}
                          disabled={hasYearMonthFilter}
                          style={({ pressed }) => [
                            styles.inputBase,
                            {
                              flex: 1,
                              opacity: hasYearMonthFilter ? 0.5 : pressed ? 0.8 : 1,
                              backgroundColor: hasYearMonthFilter ? "#F3F4F6" : "#FFF",
                            },
                          ]}
                        >
                          <View>
                            <Text style={styles.miniLabel}>DA</Text>
                            <Text style={{ fontSize: 15, color: state.fromLocal ? "#0F172A" : "#94A3B8", fontWeight: state.fromLocal ? '600' : '400', marginTop: 2 }}>
                              {state.fromLocal || "GG/MM/AAAA"}
                            </Text>
                          </View>
                        </Pressable>

                        <Pressable
                          onPress={() => openPicker("to")}
                          disabled={hasYearMonthFilter}
                          style={({ pressed }) => [
                            styles.inputBase,
                            {
                              flex: 1,
                              opacity: hasYearMonthFilter ? 0.5 : pressed ? 0.8 : 1,
                              backgroundColor: hasYearMonthFilter ? "#F3F4F6" : "#FFF",
                            },
                          ]}
                        >
                          <View>
                            <Text style={styles.miniLabel}>A</Text>
                            <Text style={{ fontSize: 15, color: state.toLocal ? "#0F172A" : "#94A3B8", fontWeight: state.toLocal ? '600' : '400', marginTop: 2 }}>
                              {state.toLocal || "GG/MM/AAAA"}
                            </Text>
                          </View>
                        </Pressable>
                      </View>
                    </View>

                    {/* RICERCA TESTO */}
                    <View>
                      <Text style={styles.sectionTitle}>PAROLA CHIAVE</Text>
                      <View style={[styles.inputBase, { paddingHorizontal: 12 }]}>
                        <Ionicons name="search" size={20} color="#94A3B8" style={{ marginRight: 8 }} />
                        <TextInput
                          value={state.textLocal}
                          onChangeText={state.setTextLocal}
                          placeholder="Titolo, luogo, tipo bici..."
                          placeholderTextColor="#94A3B8"
                          style={{ flex: 1, fontSize: 16, color: "#0F172A", height: '100%' }}
                          returnKeyType="search"
                          clearButtonMode="while-editing"
                        />
                      </View>
                    </View>

                    <View style={{ height: 40 }} />

                  </ScrollView>

                  {/* FOOTER ACTIONS */}
                  <View style={{
                    padding: 16,
                    borderTopWidth: 1,
                    borderTopColor: '#F1F5F9',
                    flexDirection: 'row',
                    gap: 12,
                    paddingBottom: Platform.OS === 'ios' ? 32 : 16
                  }}>
                    <TouchableOpacity
                      onPress={handleReset}
                      style={[styles.btnBase, { backgroundColor: '#F1F5F9', flex: 1 }]}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#475569' }}>Azzera Filtri</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleApply}
                      style={[styles.btnBase, { backgroundColor: '#0F172A', flex: 1.5 }]}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFF' }}>Applica Filtri</Text>
                    </TouchableOpacity>
                  </View>
                </KeyboardAvoidingView>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>

      {/* --- MODALS PICKERS --- */}

      {/* Modal iOS DateTimePicker */}
      {Platform.OS === "ios" && iosPickerField && (
        <Modal transparent visible={true} animationType="fade" onRequestClose={() => setIosPickerField(null)}>
          <TouchableWithoutFeedback onPress={() => setIosPickerField(null)}>
            <View style={pickerStyles.overlay} />
          </TouchableWithoutFeedback>
          <View style={pickerStyles.container}>
            <View style={pickerStyles.header}>
              <TouchableOpacity onPress={() => setIosPickerField(null)}>
                <Text style={{ color: '#64748B', fontWeight: '600' }}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmIosPicker}>
                <Text style={{ color: ACTION_GREEN, fontWeight: '700' }}>Conferma</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={iosPickerDate}
              mode="date"
              display="spinner"
              onChange={(_, sel) => sel && setIosPickerDate(sel)}
              locale="it-IT"
              style={{ height: 200 }}
            />
          </View>
        </Modal>
      )}

      {/* Picker Mese/Anno (iOS) */}
      {isIos && monthPickerVisible && (
        <Modal transparent visible={true} animationType="fade" onRequestClose={() => setMonthPickerVisible(false)}>
          <TouchableWithoutFeedback onPress={() => setMonthPickerVisible(false)}>
            <View style={pickerStyles.overlay} />
          </TouchableWithoutFeedback>
          <View style={pickerStyles.container}>
            <View style={pickerStyles.header}>
              <TouchableOpacity onPress={() => setMonthPickerVisible(false)}>
                <Text style={{ color: '#64748B', fontWeight: '600' }}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmYearMonth}>
                <Text style={{ color: ACTION_GREEN, fontWeight: '700' }}>Conferma</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', height: 200 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ textAlign: 'center', fontSize: 12, fontWeight: '700', color: '#94A3B8', marginTop: 10 }}>MESE</Text>
                <Picker
                  selectedValue={selectedMonth}
                  onValueChange={(v) => setSelectedMonth(v)}
                >
                  {monthNames.map((l, i) => <Picker.Item key={l} label={l} value={i + 1} />)}
                </Picker>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ textAlign: 'center', fontSize: 12, fontWeight: '700', color: '#94A3B8', marginTop: 10 }}>ANNO</Text>
                <Picker
                  selectedValue={selectedYear}
                  onValueChange={(v) => setSelectedYear(v)}
                >
                  {yearOptions.map((y) => <Picker.Item key={y} label={String(y)} value={y} />)}
                </Picker>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Android Custom YM Picker */}
      {Platform.OS === "android" && androidYmModalVisible && (
        <Modal transparent visible={true} animationType="fade" onRequestClose={() => setAndroidYmModalVisible(false)}>
          <TouchableWithoutFeedback onPress={() => setAndroidYmModalVisible(false)}>
            <View style={pickerStyles.overlay} />
          </TouchableWithoutFeedback>
          <View style={[pickerStyles.container, { height: 320 }]}>
            <View style={pickerStyles.header}>
              <TouchableOpacity onPress={() => setAndroidYmModalVisible(false)}>
                <Text style={{ color: '#64748B', fontWeight: '600' }}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmYearMonth}>
                <Text style={{ color: ACTION_GREEN, fontWeight: '700' }}>Conferma</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', flex: 1, padding: 16 }}>
              <ScrollView style={{ flex: 1, marginRight: 8 }} showsVerticalScrollIndicator={false}>
                {yearOptions.map(y => (
                  <TouchableOpacity key={y} onPress={() => setSelectedYear(y)} style={{ padding: 12, alignItems: 'center', backgroundColor: selectedYear === y ? '#F0FDF4' : 'transparent', borderRadius: 8 }}>
                    <Text style={{ fontWeight: selectedYear === y ? '700' : '400', color: selectedYear === y ? ACTION_GREEN : '#1E293B' }}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {monthNames.map((m, i) => (
                  <TouchableOpacity key={m} onPress={() => setSelectedMonthIndex(i)} style={{ padding: 12, alignItems: 'center', backgroundColor: selectedMonthIndex === i ? '#F0FDF4' : 'transparent', borderRadius: 8 }}>
                    <Text style={{ fontWeight: selectedMonthIndex === i ? '700' : '400', color: selectedMonthIndex === i ? ACTION_GREEN : '#1E293B' }}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

    </Modal>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 8,
    letterSpacing: 0.5
  },
  inputBase: {
    height: 56,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  miniLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8'
  },
  btnBase: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  }
});

const pickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)'
  },
  container: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 20
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  }
});
