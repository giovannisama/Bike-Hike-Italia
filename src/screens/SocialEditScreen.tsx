import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  Modal,
  Switch,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc, Timestamp } from "firebase/firestore";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Screen, UI } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import AndroidTimePicker from "../components/AndroidTimePicker";
import { auth, db } from "../firebase";
import type { RootStackParamList } from "../navigation/types";
import useCurrentProfile from "../hooks/useCurrentProfile";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

type ExtraKey = "lunch" | "dinner";

type ExtraServiceState = {
  enabled: boolean;
  label: string;
};

const EXTRA_SERVICE_KEYS: ExtraKey[] = ["lunch", "dinner"];

const EXTRA_DEFINITIONS: Array<{ key: ExtraKey; label: string; helper: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "lunch", label: "Pranzo", helper: "Richiedi se il partecipante aderisce al pranzo.", icon: "restaurant-outline" },
  { key: "dinner", label: "Cena", helper: "Richiedi se il partecipante aderisce alla cena.", icon: "restaurant-outline" },
];

const capitalizeWords = (value: string) =>
  value
    .split(" ")
    .map((segment) => (segment ? segment.charAt(0).toLocaleUpperCase("it-IT") + segment.slice(1) : segment))
    .join(" ");

const formatDisplayDateLabel = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  const dateObj = new Date(year, month - 1, day);
  if (Number.isNaN(dateObj.getTime())) return value;
  const hasIntl = typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function";
  if (hasIntl) {
    try {
      const intl = new Intl.DateTimeFormat("it-IT", {
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const intlValue = intl.format(dateObj).replace(/\.$/, "");
      return capitalizeWords(intlValue);
    } catch {
      // fall through
    }
  }
  const raw = format(dateObj, "EEE d MMMM yyyy", { locale: it });
  return capitalizeWords(raw);
};

const createDefaultExtraServices = (): Record<ExtraKey, ExtraServiceState> => ({
  lunch: { enabled: false, label: "" },
  dinner: { enabled: false, label: "" },
});

const createEnabledMap = (): Record<ExtraKey, boolean> => ({
  lunch: false,
  dinner: false,
});

const normalizeExtraServices = (raw: any, legacyExtras?: any): Record<ExtraKey, ExtraServiceState> => {
  const base = createDefaultExtraServices();
  EXTRA_SERVICE_KEYS.forEach((key) => {
    const node = raw?.[key];
    if (node) {
      base[key] = {
        enabled: !!node.enabled,
        label: typeof node.label === "string" ? node.label : "",
      };
      return;
    }
    if (legacyExtras?.[key]) {
      base[key] = { enabled: true, label: "" };
    }
  });
  return base;
};

export default function SocialEditScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<any>();
  const eventId = route.params?.eventId as string | undefined;
  const isEdit = route.params?.mode === "edit" || !!eventId;
  const { isAdmin, isOwner } = useCurrentProfile();
  const canEdit = isAdmin || isOwner;

  const [loading, setLoading] = useState<boolean>(!!eventId);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [meetingPlaceText, setMeetingPlaceText] = useState("");
  const [meetingMapUrl, setMeetingMapUrl] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [status, setStatus] = useState<"active" | "cancelled" | "archived">("active");

  const [extraServices, setExtraServices] = useState<Record<ExtraKey, ExtraServiceState>>(
    () => createDefaultExtraServices()
  );
  const [initialEnabledServices, setInitialEnabledServices] = useState<Record<ExtraKey, boolean>>(
    () => createEnabledMap()
  );
  const [servicesLocked, setServicesLocked] = useState(false);

  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [iosPickerMode, setIosPickerMode] = useState<"date" | "time" | null>(null);
  const [iosPickerValue, setIosPickerValue] = useState<Date>(new Date());
  const [androidTimePickerVisible, setAndroidTimePickerVisible] = useState(false);
  const [androidTimePickerInitialDate, setAndroidTimePickerInitialDate] = useState<Date>(() => new Date());

  const parseDateTime = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return null;
    }
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  };

  const pad2 = (value: number) => String(value).padStart(2, "0");
  const formatDateValue = (value: Date) =>
    `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  const formatTimeValue = (value: Date) => `${pad2(value.getHours())}:${pad2(value.getMinutes())}`;

  const clearError = (field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const applyPickerValue = (mode: "date" | "time", value: Date) => {
    if (mode === "date") {
      setDate(formatDateValue(value));
      clearError("date");
      if (!/^\d{2}:\d{2}$/.test(time)) {
        setTime(formatTimeValue(value));
        clearError("time");
      }
      return;
    }
    setTime(formatTimeValue(value));
    clearError("time");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setDate(formatDateValue(value));
      clearError("date");
    }
  };

  const openNativePicker = (mode: "date" | "time") => {
    const base = parseDateTime() ?? new Date();
    if (mode === "time") {
      base.setSeconds(0, 0);
    }
    if (Platform.OS === "android") {
      if (mode === "time") {
        setAndroidTimePickerInitialDate(new Date(base));
        setAndroidTimePickerVisible(true);
        return;
      }
      DateTimePickerAndroid.open({
        mode,
        display: mode === "date" ? "calendar" : "spinner",
        value: base,
        is24Hour: true,
        onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
          if (event.type !== "set" || !selectedDate) return;
          const next = new Date(selectedDate);
          applyPickerValue(mode, next);
        },
      });
      return;
    }
    setIosPickerValue(base);
    setIosPickerMode(mode);
  };

  const confirmIosPicker = () => {
    if (!iosPickerMode) return;
    applyPickerValue(iosPickerMode, iosPickerValue);
    setIosPickerMode(null);
  };

  useEffect(() => {
    if (!eventId) {
      setInitialEnabledServices(createEnabledMap());
      setServicesLocked(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "social_events", eventId));
        if (!snap.exists()) {
          if (!cancelled) navigation.goBack();
          return;
        }
        const data = snap.data() as any;
        if (cancelled) return;
        setTitle(data?.title ?? "");
        setMeetingPlaceText(data?.meetingPlaceText ?? "");
        setMeetingMapUrl(data?.meetingMapUrl ?? "");
        setOrganizerName(data?.organizerName ?? "");
        setDescription(data?.description ?? "");
        setStatus((data?.status as any) === "cancelled" ? "cancelled" : (data?.status as any) === "archived" ? "archived" : "active");
        const dt = data?.startAt?.toDate?.();
        if (dt) {
          setDate(formatDateValue(dt));
          setTime(formatTimeValue(dt));
        }
        const nextExtras = normalizeExtraServices(data?.extraServices, data?.extras);
        setExtraServices(nextExtras);
        setInitialEnabledServices({
          lunch: nextExtras.lunch.enabled,
          dinner: nextExtras.dinner.enabled,
        });
        setServicesLocked(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, navigation]);

  const toggleExtra = useCallback(
    (key: ExtraKey, enabled: boolean) => {
      if (enabled && servicesLocked && !initialEnabledServices[key]) {
        Alert.alert(
          "Servizio non disponibile",
          "Non puoi attivare nuovi servizi mentre sono già presenti partecipanti prenotati."
        );
        return;
      }
      setExtraServices((prev) => {
        const next = { ...prev };
        const current = prev[key] ?? { enabled: false, label: "" };
        next[key] = { enabled, label: enabled ? current.label : "" };
        return next;
      });
    },
    [initialEnabledServices, servicesLocked]
  );

  const updateExtraLabel = useCallback((key: ExtraKey, value: string) => {
    setExtraServices((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? { enabled: false, label: "" }),
        label: value,
      },
    }));
  }, []);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Inserisci un titolo";
    if (!meetingPlaceText.trim()) errs.meetingPlaceText = "Indica il luogo";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errs.date = "Seleziona una data valida";
    if (!/^\d{2}:\d{2}$/.test(time)) errs.time = "Seleziona un orario valido";
    const dt = parseDateTime();
    if (!dt) {
      errs.date = errs.date ?? "Data non valida";
      errs.time = errs.time ?? "Ora non valida";
    }
    if (meetingMapUrl.trim() && !/^((https?):\/\/|geo:)/i.test(meetingMapUrl.trim())) {
      errs.meetingMapUrl = "Inserisci un URL valido";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!canEdit) {
      Alert.alert("Permessi", "Non hai i permessi per creare o modificare un evento.");
      return;
    }
    if (!title.trim()) {
      Alert.alert("Campi obbligatori", "Inserisci il titolo.");
      return;
    }
    if (!meetingPlaceText.trim()) {
      Alert.alert("Campi obbligatori", "Inserisci il luogo.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      Alert.alert("Campi obbligatori", "Seleziona data e ora.");
      return;
    }
    if (!validate()) return;
    const dt = parseDateTime();
    if (!dt) {
      Alert.alert("Campi obbligatori", "Seleziona data e ora.");
      return;
    }
    setSaving(true);
    try {
      const uid = auth.currentUser?.uid ?? null;
      const extraServicesPayload: Record<string, any> = {};
      EXTRA_SERVICE_KEYS.forEach((key) => {
        const conf = extraServices[key];
        if (conf?.enabled) {
          extraServicesPayload[key] = {
            enabled: true,
            label: conf.label.trim() || null,
          };
        }
      });
      const payload: Record<string, any> = {
        title: title.trim(),
        meetingPlaceText: meetingPlaceText.trim(),
        meetingMapUrl: meetingMapUrl.trim() || null,
        organizerName: organizerName.trim() || null,
        description: description.trim() || null,
        startAt: Timestamp.fromDate(dt),
        status,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      };
      if (Object.keys(extraServicesPayload).length > 0) {
        payload.extraServices = extraServicesPayload;
      } else if (isEdit) {
        payload.extraServices = null;
      }
      if (__DEV__) {
        console.log("[social_events] write", {
          collection: "social_events",
          status: payload.status,
          startAtType: payload.startAt?.constructor?.name,
        });
      }
      if (isEdit && eventId) {
        await updateDoc(doc(db, "social_events", eventId), payload);
      } else {
        const docRef = await addDoc(collection(db, "social_events"), {
          ...payload,
          status: "active",
          createdAt: serverTimestamp(),
          createdBy: uid,
        });
        if (__DEV__) console.log("[social_events] created", docRef.id);
      }
      navigation.goBack();
    } catch (err: any) {
      console.error("[social_events] create failed", err);
      if (err?.code === "permission-denied") {
        Alert.alert("Permessi", "Non hai i permessi per creare un evento.");
      } else {
        Alert.alert("Errore", err?.message ?? "Impossibile creare l'evento.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCancelled = async () => {
    if (!canEdit || !eventId) return;
    const next = status === "cancelled" ? "active" : "cancelled";
    const uid = auth.currentUser?.uid ?? null;
    await updateDoc(doc(db, "social_events", eventId), {
      status: next,
      ...(next === "cancelled"
        ? { cancelledAt: serverTimestamp(), cancelledBy: uid }
        : {}),
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
    setStatus(next);
  };

  const handleToggleArchived = async () => {
    if (!canEdit || !eventId) return;
    const next = status === "archived" ? "active" : "archived";
    await updateDoc(doc(db, "social_events", eventId), {
      status: next,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid ?? null,
    });
    setStatus(next);
  };

  const displayDateValue = useMemo(() => formatDisplayDateLabel(date), [date]);
  const titleScreen = isEdit ? "Modifica Evento" : "Crea Evento";

  return (
    <Screen title={titleScreen} useNativeHeader={false} scroll={false} backgroundColor="#FDFCF8" disableHero={true}>
      <View style={styles.root}>
        <ScreenHeader
          title={titleScreen}

        />
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={UI.colors.primary} />
          </View>
        ) : (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
          >
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {isEdit && canEdit && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Stato Evento</Text>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable
                      onPress={handleToggleCancelled}
                      style={[
                        styles.adminBtn,
                        status === "cancelled" && { backgroundColor: UI.colors.danger },
                      ]}
                    >
                      <Text style={styles.adminBtnText}>
                        {status === "cancelled" ? "Riapri Evento" : "Annulla Evento"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleToggleArchived}
                      style={[
                        styles.adminBtn,
                        status === "archived" && { backgroundColor: UI.colors.muted },
                      ]}
                    >
                      <Text style={styles.adminBtnText}>
                        {status === "archived" ? "Ripristina Evento" : "Archivia"}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.helperText}>
                    Stato attuale: {status === "cancelled" ? "ANNULLATO" : "ATTIVO"}
                    {status === "archived" ? " • ARCHIVIATO" : ""}
                  </Text>
                </View>
              )}

              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="information-circle-outline" size={22} color={UI.colors.action} />
                  <Text style={styles.cardTitle}>Informazioni</Text>
                </View>
                <View style={styles.formBlock}>
                  <Text style={styles.label}>Titolo *</Text>
                  <TextInput
                    value={title}
                    onChangeText={(value) => {
                      setTitle(value);
                      if (errors.title) clearError("title");
                    }}
                    placeholder="Titolo evento"
                    placeholderTextColor="#94a3b8"
                    style={[styles.input, errors.title && styles.inputError]}
                  />
                  {!!errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
                </View>
                <View style={styles.formBlock}>
                  <Text style={styles.label}>Organizzatore</Text>
                  <TextInput
                    value={organizerName}
                    onChangeText={setOrganizerName}
                    placeholder="Nome organizzatore"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="calendar-outline" size={22} color={UI.colors.action} />
                  <Text style={styles.cardTitle}>Quando e Dove</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={styles.label}>Data *</Text>
                    <Pressable
                      onPress={() => openNativePicker("date")}
                      style={[styles.input, styles.fakeInput, errors.date && styles.inputError]}
                    >
                      <Text style={date ? styles.fakeInputValue : styles.fakeInputPlaceholder}>
                        {date ? displayDateValue : "Seleziona"}
                      </Text>
                    </Pressable>
                    {!!errors.date && <Text style={styles.errorText}>{errors.date}</Text>}
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={styles.label}>Ora *</Text>
                    <Pressable
                      onPress={() => openNativePicker("time")}
                      style={[styles.input, styles.fakeInput, errors.time && styles.inputError]}
                    >
                      <Text style={time ? styles.fakeInputValue : styles.fakeInputPlaceholder}>
                        {time || "Seleziona"}
                      </Text>
                    </Pressable>
                    {!!errors.time && <Text style={styles.errorText}>{errors.time}</Text>}
                  </View>
                </View>
                <View style={styles.formBlock}>
                  <Text style={styles.label}>Luogo *</Text>
                  <TextInput
                    value={meetingPlaceText}
                    onChangeText={(value) => {
                      setMeetingPlaceText(value);
                      if (errors.meetingPlaceText) clearError("meetingPlaceText");
                    }}
                    placeholder="Es. Piazzale Roma"
                    placeholderTextColor="#94a3b8"
                    style={[styles.input, errors.meetingPlaceText && styles.inputError]}
                  />
                  {!!errors.meetingPlaceText && <Text style={styles.errorText}>{errors.meetingPlaceText}</Text>}
                </View>
                <View style={styles.formBlock}>
                  <Text style={styles.label}>Link posizione (Google Maps)</Text>
                  <TextInput
                    value={meetingMapUrl}
                    onChangeText={(value) => {
                      setMeetingMapUrl(value);
                      if (errors.meetingMapUrl) clearError("meetingMapUrl");
                    }}
                    placeholder="https://maps.app.goo.gl/..."
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                    keyboardType="url"
                    style={[styles.input, errors.meetingMapUrl && styles.inputError]}
                  />
                  {!!errors.meetingMapUrl && <Text style={styles.errorText}>{errors.meetingMapUrl}</Text>}
                </View>
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="document-text-outline" size={22} color={UI.colors.action} />
                  <Text style={styles.cardTitle}>Descrizione</Text>
                </View>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Descrizione evento"
                  placeholderTextColor="#94a3b8"
                  style={[styles.input, styles.textArea]}
                  multiline
                />
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="fast-food-outline" size={22} color={UI.colors.action} />
                  <Text style={styles.cardTitle}>Extra</Text>
                </View>
                <Text style={styles.helperText}>
                  Attiva se richiesti (es. prenotazione ristorante). I partecipanti potranno indicare Sì/No.
                </Text>
                {servicesLocked && (
                  <View style={styles.alertBox}>
                    <Text style={styles.alertText}>Servizi bloccati: ci sono già prenotazioni.</Text>
                  </View>
                )}
                <View style={styles.serviceList}>
                  {EXTRA_DEFINITIONS.map(({ key, label, helper, icon }, index) => {
                    const state = extraServices[key];
                    const isToggleLocked = servicesLocked && !initialEnabledServices[key];
                    const showDivider = index < EXTRA_DEFINITIONS.length - 1;
                    return (
                      <View
                        key={key}
                        style={[
                          styles.serviceItem,
                          showDivider && styles.serviceItemDivider,
                          isToggleLocked && styles.serviceToggleDisabled,
                        ]}
                      >
                        <Pressable
                          onPress={() => toggleExtra(key, !state.enabled)}
                          disabled={isToggleLocked}
                          style={({ pressed }) => [
                            styles.serviceToggleRow,
                            pressed && { backgroundColor: "rgba(0,0,0,0.02)" },
                          ]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <View style={styles.serviceRowLeft}>
                            <View style={styles.serviceIconWrap}>
                              <Ionicons name={icon} size={18} color={UI.colors.action} />
                            </View>
                            <View style={styles.serviceToggleText}>
                              <Text style={styles.serviceToggleLabel}>{label}</Text>
                              <Text style={styles.serviceToggleHelper}>{helper}</Text>
                            </View>
                          </View>
                          <View style={styles.serviceSwitchWrapper}>
                            <Switch
                              value={state.enabled}
                              onValueChange={(value) => toggleExtra(key, value)}
                              trackColor={{ false: UI.colors.tint, true: UI.colors.action }}
                            />
                          </View>
                        </Pressable>
                        {state.enabled && (
                          <View style={styles.serviceLabelRow}>
                            <TextInput
                              value={state.label}
                              onChangeText={(value) => updateExtraLabel(key, value)}
                              style={styles.serviceLabelInput}
                              placeholder={`Dettagli ${label.toLowerCase()} (facoltativo)`}
                              placeholderTextColor="#94a3b8"
                            />
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        )
        }

        {
          !loading && (
            <View style={styles.footerContainer}>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving || !canEdit}
                style={[
                  styles.saveBtn,
                  (saving || !canEdit) && styles.saveBtnDisabled,
                ]}
                activeOpacity={0.8}
              >
                {saving ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.saveBtnText}>{isEdit ? "Aggiorno..." : "Salvataggio..."}</Text>
                  </View>
                ) : (
                  <Text style={styles.saveBtnText}>{isEdit ? "Salva Modifiche" : "Crea Evento"}</Text>
                )}
              </TouchableOpacity>
            </View>
          )
        }
      </View >

      {
        Platform.OS === "ios" && (
          <Modal
            transparent
            animationType="fade"
            visible={iosPickerMode !== null}
            onRequestClose={() => setIosPickerMode(null)}
          >
            <View style={styles.pickerWrapper}>
              <Pressable style={styles.pickerOverlay} onPress={() => setIosPickerMode(null)} />
              <View style={styles.pickerContainer}>
                <View style={styles.pickerHeader}>
                  <Pressable onPress={() => setIosPickerMode(null)}>
                    <Text style={styles.pickerHeaderText}>Annulla</Text>
                  </Pressable>
                  <Pressable onPress={confirmIosPicker}>
                    <Text style={styles.pickerHeaderTextPrimary}>Fatto</Text>
                  </Pressable>
                </View>
                {iosPickerMode === "date" && (
                  <View style={styles.pickerPreviewRow}>
                    <Text style={styles.pickerPreviewLabel}>{formatDisplayDateLabel(formatDateValue(iosPickerValue))}</Text>
                  </View>
                )}
                {iosPickerMode && (
                  <DateTimePicker
                    value={iosPickerValue}
                    mode={iosPickerMode}
                    display="spinner"
                    onChange={(_, selected) => {
                      if (selected) setIosPickerValue(selected);
                    }}
                    minuteInterval={iosPickerMode === "time" ? 5 : undefined}
                    locale="it-IT"
                    style={styles.iosPicker}
                  />
                )}
              </View>
            </View>
          </Modal>
        )
      }

      < AndroidTimePicker
        visible={androidTimePickerVisible}
        initialDate={androidTimePickerInitialDate}
        onCancel={() => setAndroidTimePickerVisible(false)}
        onConfirm={(value) => {
          setAndroidTimePickerVisible(false);
          applyPickerValue("time", value);
        }}
      />
    </Screen >
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FDFCF8",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 16 : 8,
    paddingBottom: 16,
    backgroundColor: "#FDFCF8",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  backButton: {
    marginRight: 8,
    padding: 4,
    marginTop: 2,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1E293B",
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    gap: 20,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    gap: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
  },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
    fontSize: 16,
    color: "#0F172A",
  },
  inputError: {
    borderColor: "#EF4444",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
    marginTop: 4,
  },
  fakeInput: {
    justifyContent: "center",
  },
  fakeInputPlaceholder: {
    fontSize: 16,
    color: "#9CA3AF",
  },
  fakeInputValue: {
    fontSize: 16,
    color: "#0F172A",
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  formBlock: { gap: 6 },
  adminBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: UI.colors.action,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  adminBtnText: {
    color: "#fff",
    fontWeight: "700",
    textAlign: "center",
  },
  helperText: {
    marginTop: 8,
    fontSize: 13,
    color: "#64748B",
    lineHeight: 18,
  },
  alertBox: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
    marginTop: 10,
  },
  alertText: {
    fontSize: 13,
    color: "#92400E",
    fontWeight: "600",
  },
  serviceList: {
    marginTop: 8,
  },
  serviceItem: {
    paddingVertical: 12,
  },
  serviceItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  serviceToggleDisabled: {
    opacity: 0.6,
  },
  serviceToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  serviceRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  serviceIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  serviceToggleText: {
    flex: 1,
    minWidth: 0,
  },
  serviceToggleLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
  },
  serviceToggleHelper: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
    paddingRight: 8,
  },
  serviceSwitchWrapper: {
    alignSelf: "center",
    marginLeft: 12,
    minWidth: 68,
    alignItems: "flex-end",
  },
  serviceLabelRow: {
    marginTop: 10,
    marginLeft: 46,
  },
  serviceLabelInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    fontSize: 14,
    color: "#0F172A",
  },
  footerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
    backgroundColor: "#FDFCF8",
  },
  saveBtn: {
    backgroundColor: UI.colors.action,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  pickerWrapper: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  pickerOverlay: {
    flex: 1,
  },
  pickerContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  pickerHeaderText: {
    fontSize: 16,
    color: UI.colors.text,
    fontWeight: "600",
  },
  pickerHeaderTextPrimary: {
    fontSize: 16,
    color: UI.colors.primary,
    fontWeight: "700",
  },
  pickerPreviewRow: {
    paddingVertical: 8,
  },
  pickerPreviewLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: UI.colors.text,
  },
  iosPicker: {
    width: "100%",
    height: 200,
  },
});
