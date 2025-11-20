import React, { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";

const MINUTE_STEP = 5;
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => index * MINUTE_STEP);
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => index);

export type AndroidTimePickerProps = {
  visible: boolean;
  initialDate: Date;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
};

function alignMinuteToStep(value: number) {
  const rounded = Math.round(value / MINUTE_STEP) * MINUTE_STEP;
  const clamped = Math.max(0, Math.min(55, rounded));
  return clamped;
}

export default function AndroidTimePicker({
  visible,
  initialDate,
  onConfirm,
  onCancel,
}: AndroidTimePickerProps) {
  if (Platform.OS !== "android") {
    return null;
  }

  const [selectedHour, setSelectedHour] = useState(initialDate.getHours());
  const [selectedMinuteIndex, setSelectedMinuteIndex] = useState(
    () => MINUTE_OPTIONS.indexOf(alignMinuteToStep(initialDate.getMinutes()))
  );

  useEffect(() => {
    if (!visible) return;
    setSelectedHour(initialDate.getHours());
    const aligned = alignMinuteToStep(initialDate.getMinutes());
    setSelectedMinuteIndex(MINUTE_OPTIONS.indexOf(aligned));
  }, [visible, initialDate]);

  const handleConfirm = () => {
    const minute = MINUTE_OPTIONS[selectedMinuteIndex] ?? 0;
    const next = new Date(initialDate);
    next.setHours(selectedHour, minute, 0, 0);
    onConfirm(next);
  };

  const formatOption = (value: number) => value.toString().padStart(2, "0");

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onCancel}>
          <View style={{ flex: 1 }} />
        </TouchableWithoutFeedback>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Pressable onPress={onCancel}>
              <Text style={styles.cancelText}>Annulla</Text>
            </Pressable>
            <Text style={styles.title}>Seleziona orario</Text>
            <Pressable onPress={handleConfirm}>
              <Text style={styles.confirmText}>Fatto</Text>
            </Pressable>
          </View>
          <View style={styles.columns}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={[styles.column, styles.columnLeft]}
            >
              {HOUR_OPTIONS.map((hour) => (
                <Pressable
                  key={hour}
                  onPress={() => setSelectedHour(hour)}
                  style={styles.option}
                >
                  <Text
                    style={[
                      styles.optionText,
                      selectedHour === hour && styles.optionTextSelected,
                    ]}
                  >
                    {formatOption(hour)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.column}>
              {MINUTE_OPTIONS.map((minute) => (
                <Pressable
                  key={minute}
                  onPress={() => setSelectedMinuteIndex(minute / MINUTE_STEP)}
                  style={styles.option}
                >
                  <Text
                    style={[
                      styles.optionText,
                      selectedMinuteIndex === minute / MINUTE_STEP && styles.optionTextSelected,
                    ]}
                  >
                    {formatOption(minute)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    maxHeight: 360,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  title: {
    fontWeight: "700",
    color: "#111827",
    fontSize: 16,
  },
  columns: {
    flexDirection: "row",
    marginTop: 12,
    height: 240,
  },
  column: {
    flex: 1,
  },
  columnLeft: {
    marginRight: 8,
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
