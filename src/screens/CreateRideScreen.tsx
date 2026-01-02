// src/screens/CreateRideScreen.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  Modal,
  Platform,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TouchableWithoutFeedback,
  Switch,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { auth, db } from "../firebase";
import {
  Timestamp,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  setDoc,
  collection,
  query,
  limit,
} from "firebase/firestore";
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Screen, UI } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import AndroidTimePicker from "../components/AndroidTimePicker";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { RideDoc, UserDoc } from "../types/firestore";
import type { RootStackParamList } from "../navigation/types";
import { Ionicons } from "@expo/vector-icons";
import {
  getCreateRideErrors,
  validateCreateRide,
  type CreateRideForm,
  type ExtraServiceState,
  type FieldErrors,
} from "./rides/createRideValidation";
import { mapCreateRideToFirestore } from "./rides/createRideMapper";

// --- CONSTANTS ---

const BIKE_TYPES = ["BDC", "Gravel", "MTB", "eBike", "Enduro"] as const;
const DIFFICULTY_OPTIONS = [
  "Facile",
  "Medio/Moderato",
  "Difficile/Impegnativo",
  "Estremo",
] as const;

type ExtraServiceKey = "lunch" | "dinner" | "overnight";

const EXTRA_SERVICE_KEYS: ExtraServiceKey[] = ["lunch", "dinner", "overnight"];

const EXTRA_SERVICE_DEFINITIONS: Array<{ key: ExtraServiceKey; label: string; helper: string }> = [
  { key: "lunch", label: "Pranzo", helper: "Richiedi se il partecipante aderisce al pranzo." },
  { key: "dinner", label: "Cena", helper: "Richiedi se il partecipante aderisce alla cena." },
  { key: "overnight", label: "Pernotto", helper: "Richiedi se il partecipante necessita del pernottamento." },
];

const EXTRA_SERVICE_ICONS: Record<ExtraServiceKey, keyof typeof Ionicons.glyphMap> = {
  lunch: "restaurant-outline",
  dinner: "restaurant-outline",
  overnight: "bed-outline",
};

const createDefaultExtraServices = (): Record<ExtraServiceKey, ExtraServiceState> => ({
  lunch: { enabled: false, label: "" },
  dinner: { enabled: false, label: "" },
  overnight: { enabled: false, label: "" },
});

const createEnabledMap = (): Record<ExtraServiceKey, boolean> => ({
  lunch: false,
  dinner: false,
  overnight: false,
});

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
      // fall through to date-fns formatting below
    }
  }
  const raw = format(dateObj, "EEE d MMMM yyyy", { locale: it });
  return capitalizeWords(raw);
};

const extractExtraServices = (raw: any): Record<ExtraServiceKey, ExtraServiceState> => {
  const base = createDefaultExtraServices();
  EXTRA_SERVICE_KEYS.forEach((key) => {
    const node = raw?.[key];
    if (!node) {
      base[key] = { enabled: false, label: "" };
      return;
    }
    base[key] = {
      enabled: !!node.enabled,
      label: typeof node.label === "string" ? node.label : "",
    };
  });
  return base;
};

// Spaziatore verticale
const VSpace = ({ size = "md" as keyof typeof UI.spacing }) => (
  <View style={{ height: UI.spacing[size] }} />
);

export default function CreateRideScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "CreateRide">>();
  const rideId = route.params?.rideId;

  // ---------- stato admin ----------
  const [isAdmin, setIsAdmin] = useState(false);

  // INVENTORY A: default state / initial values (unchanged)
  // ---------- campi uscita ----------
  const [title, setTitle] = useState("");
  const [guidaText, setGuidaText] = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [link, setLink] = useState(""); // opzionale
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(""); // YYYY-MM-DD
  const [time, setTime] = useState(""); // HH:MM
  const [bikes, setBikes] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<string>(""); // opzionale
  const [maxParticipants, setMaxParticipants] = useState<string>("");
  const [extraServices, setExtraServices] = useState<Record<ExtraServiceKey, ExtraServiceState>>(
    () => createDefaultExtraServices()
  );
  const [initialEnabledServices, setInitialEnabledServices] = useState<Record<ExtraServiceKey, boolean>>(
    () => createEnabledMap()
  );
  const [servicesLocked, setServicesLocked] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [loadingPrefill, setLoadingPrefill] = useState<boolean>(!!rideId);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [iosPickerMode, setIosPickerMode] = useState<"date" | "time" | null>(null);
  const [iosPickerValue, setIosPickerValue] = useState<Date>(new Date());
  const [androidTimePickerVisible, setAndroidTimePickerVisible] = useState(false);
  const [androidTimePickerInitialDate, setAndroidTimePickerInitialDate] = useState<Date>(() => new Date());
  const isIos = Platform.OS === "ios";

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), feedback.type === "success" ? 2500 : 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  // campi amministrativi (solo in edit)
  const [status, setStatus] = useState<"active" | "cancelled">("active");
  const [archived, setArchived] = useState<boolean>(false);

  // --------- util ---------
  const toggleExtraService = useCallback(
    (key: ExtraServiceKey, enabled: boolean) => {
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
        next[key] = {
          enabled,
          label: enabled ? current.label : "",
        };
        return next;
      });
    },
    [initialEnabledServices, servicesLocked]
  );

  const updateExtraServiceLabel = useCallback((key: ExtraServiceKey, value: string) => {
    setExtraServices((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? { enabled: false, label: "" }),
        label: value,
      },
    }));
  }, []);

  const toggleBike = (b: string) => {
    setBikes((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
    if (errors.bikes) setErrors((prev) => ({ ...prev, bikes: undefined }));
  };

  const parseDateTime = (): Date | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
      return null;
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
    return isNaN(dt.getTime()) ? null : dt;
  };

  const pad2 = (value: number) => String(value).padStart(2, "0");
  const formatDateValue = (value: Date) =>
    `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  const formatTimeValue = (value: Date) => `${pad2(value.getHours())}:${pad2(value.getMinutes())}`;

  const clearError = (field: keyof FieldErrors) => {
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
          if ((mode as string) === "time") {
            next.setSeconds(0, 0);
          }
          applyPickerValue(mode, next);
        },
      });
      return;
    }
    setIosPickerValue(base);
    setIosPickerMode(mode);
  };

  const closeIosPicker = () => setIosPickerMode(null);
  const confirmIosPicker = () => {
    if (!iosPickerMode) return;
    applyPickerValue(iosPickerMode, iosPickerValue);
    setIosPickerMode(null);
  };

  const isEdit = !!rideId;
  const displayDateValue = formatDisplayDateLabel(date);

  // ---------- leggi ruolo utente ----------
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const role = snap.exists() ? (snap.data() as UserDoc | undefined)?.role : null;
        setIsAdmin(role === "admin" || role === "owner");
      },
      () => setIsAdmin(false)
    );
    return () => unsub();
  }, []);

  // ---------- prefill in modalità EDIT ----------
  useEffect(() => {
    if (!rideId) {
      setInitialEnabledServices(createEnabledMap());
      setServicesLocked(false);
      return;
    }
    let cancelled = false;
    setInitialEnabledServices(createEnabledMap());
    setServicesLocked(false);
    (async () => {
      try {
        const snap = await getDoc(doc(db, "rides", rideId));
        if (!snap.exists()) {
          Alert.alert("Attenzione", "Uscita non trovata.");
          navigation.goBack();
          return;
        }
        const d = snap.data() as RideDoc | undefined;
        if (cancelled) return;
        setTitle(d?.title ?? "");
        const storedGuides =
          Array.isArray(d?.guidaNames) && d.guidaNames.length
            ? d.guidaNames
            : d?.guidaName
              ? [d.guidaName]
              : [];
        setGuidaText(
          storedGuides
            .map((name: string) => (name ?? "").toString().trim())
            .filter(Boolean)
            .join("; ")
        );
        setMeetingPoint(d?.meetingPoint ?? "");
        setLink(d?.link ?? "");
        setDescription(d?.description ?? "");
        setBikes(Array.isArray(d?.bikes) ? d.bikes : []);
        setDifficulty(d?.difficulty ?? "");
        // date/time
        const dt = (d?.dateTime || d?.date) as Timestamp | undefined;
        if (dt?.toDate) {
          const _d = dt.toDate();
          const yyyy = String(_d.getFullYear());
          const mm = String(_d.getMonth() + 1).padStart(2, "0");
          const dd = String(_d.getDate()).padStart(2, "0");
          const HH = String(_d.getHours()).padStart(2, "0");
          const MM = String(_d.getMinutes()).padStart(2, "0");
          setDate(`${yyyy}-${mm}-${dd}`);
          setTime(`${HH}:${MM}`);
        }
        setMaxParticipants(
          typeof d?.maxParticipants === "number" ? String(d.maxParticipants) : ""
        );
        setStatus((d?.status as any) === "cancelled" ? "cancelled" : "active");
        setArchived(!!d?.archived);
        const servicesFromDb = extractExtraServices(d?.extraServices);
        setExtraServices(servicesFromDb);
        setInitialEnabledServices({
          lunch: servicesFromDb.lunch.enabled,
          dinner: servicesFromDb.dinner.enabled,
          overnight: servicesFromDb.overnight.enabled,
        });
        const manualCount = Array.isArray(d?.manualParticipants) ? d.manualParticipants.length : 0;
        const bookedCount =
          typeof d?.participantsCount === "number" && !Number.isNaN(d.participantsCount)
            ? d.participantsCount
            : 0;
        let hasParticipants = (manualCount ?? 0) > 0 || bookedCount > 0;
        if (!hasParticipants) {
          try {
            const participantsSnap = await getDocs(
              query(collection(db, "rides", rideId, "participants"), limit(1))
            );
            hasParticipants = !participantsSnap.empty;
          } catch (err) {
            console.warn("Impossibile verificare i partecipanti prenotati:", err);
          }
        }
        if (!cancelled) {
          setServicesLocked(hasParticipants);
        }
      } catch (e: any) {
        Alert.alert("Errore", e?.message ?? "Impossibile caricare i dati.");
      } finally {
        if (!cancelled) {
          setLoadingPrefill(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rideId, navigation]);

  // INVENTORY B: validazione (estratta in helper)
  const validate = useCallback(() => {
    const form: CreateRideForm = {
      title,
      meetingPoint,
      description,
      bikes,
      date,
      time,
      maxParticipants,
      link,
      difficulty,
      guidaText,
      extraServices,
    };
    const validation = validateCreateRide(form);
    const errs = getCreateRideErrors(form);
    setErrors(errs);
    return validation.ok;
  }, [
    title,
    meetingPoint,
    description,
    bikes,
    date,
    time,
    maxParticipants,
    link,
    difficulty,
    guidaText,
    extraServices,
  ]);

  // ---------- salva ----------
  // INVENTORY C: mapping payload + submit (estratto in helper)
  const onSave = async () => {
    if (!isAdmin) {
      setFeedback({ type: "error", message: "Solo Admin o Owner possono salvare." });
      return;
    }
    if (!auth.currentUser) {
      setFeedback({ type: "error", message: "Autenticazione in corso…" });
      return;
    }
    if (!validate()) {
      setFeedback({ type: "error", message: "Controlla i campi evidenziati." });
      return;
    }

    const dt = parseDateTime();
    if (!dt) return;

    if (servicesLocked) {
      const newlyEnabledKeys = EXTRA_SERVICE_KEYS.filter(
        (key) => extraServices[key]?.enabled && !initialEnabledServices[key]
      );
      if (newlyEnabledKeys.length > 0) {
        Alert.alert(
          "Servizio non disponibile",
          "Non puoi attivare nuovi servizi mentre sono già presenti partecipanti prenotati."
        );
        return;
      }
    }
    const form: CreateRideForm = {
      title,
      meetingPoint,
      description,
      bikes,
      date,
      time,
      maxParticipants,
      link,
      difficulty,
      guidaText,
      extraServices,
    };
    const payload = mapCreateRideToFirestore(form, {
      uid: auth.currentUser.uid,
      dateTime: dt,
      isEdit,
    });

    setSaving(true);
    try {
      if (isEdit) {
        await updateDoc(doc(db, "rides", rideId!), {
          ...payload,
          status,
          archived,
        });
        setFeedback({ type: "success", message: "Uscita aggiornata correttamente." });
      } else {
        const ridesColl = collection(db, "rides");
        const newId = (globalThis as any).crypto?.randomUUID?.() ?? doc(ridesColl).id;
        await setDoc(doc(db, "rides", newId), payload);
        setFeedback({ type: "success", message: "Uscita creata!" });
      }
      setTimeout(() => navigation.goBack(), 400);
    } catch (e: any) {
      console.error("Errore creazione/modifica ride:", e);
      setFeedback({
        type: "error",
        message:
          e?.message?.includes("Missing or insufficient permissions")
            ? "Permessi insufficienti oppure dati non validi. Controlla i campi e riprova."
            : e?.message ?? "Impossibile salvare l'uscita.",
      });
    } finally {
      setSaving(false);
    }
  };

  // ---------- azioni rapide admin ----------
  const toggleCancelled = async () => {
    if (!isEdit || !rideId) return;
    if (!isAdmin) return;
    try {
      const next = status === "active" ? "cancelled" : "active";
      await updateDoc(doc(db, "rides", rideId), { status: next });
      setStatus(next);
      Alert.alert("Fatto", next === "cancelled" ? "Uscita annullata." : "Uscita riaperta.");
    } catch (e: any) {
      Alert.alert("Errore", e?.message ?? "Impossibile aggiornare lo stato.");
    }
  };

  const toggleArchived = async () => {
    if (!isEdit || !rideId) return;
    if (!isAdmin) return;
    try {
      const next = !archived;
      const dateObj = parseDateTime() ?? new Date();
      const y = dateObj.getFullYear();
      const m = dateObj.getMonth() + 1;
      await updateDoc(doc(db, "rides", rideId), {
        archived: next,
        ...(next ? { archiveYear: y, archiveMonth: m } : { archiveYear: null, archiveMonth: null }),
      });
      setArchived(next);
      Alert.alert("Fatto", next ? "Uscita archiviata." : "Uscita ripristinata.");
    } catch (e: any) {
      Alert.alert("Errore", e?.message ?? "Impossibile aggiornare l'archivio.");
    }
  };

  // ---------- UI ----------
  const titleScreen = isEdit ? "Modifica Uscita" : "Crea Uscita";
  const adminWarning = !isAdmin ? "Solo Admin o Owner possono salvare o modificare un’uscita." : null;

  // TODO: sezione UI principale molto ampia; valutare estrazione in sottocomponenti (es. form principale, feedback, warning).
  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case "Facile": return UI.colors.action;
      case "Medio/Moderato": return "#f97316";
      case "Difficile/Impegnativo": return "#ef4444";
      case "Estremo": return "#000000";
      default: return "#94a3b8";
    }
  };

  return (
    <Screen
      title={titleScreen}
      useNativeHeader={false}
      scroll={false}
      backgroundColor="#FDFCF8"
      disableHero={true}
    >
      <View style={styles.root}>
        <ScreenHeader title={titleScreen} />
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
            {feedback && (
              <View
                style={[
                  styles.feedbackBox,
                  feedback.type === "success" ? styles.feedbackSuccess : styles.feedbackError,
                ]}
              >
                <Text
                  style={{
                    color: feedback.type === "success" ? "#14532d" : "#7f1d1d",
                    fontWeight: "700",
                  }}
                >
                  {feedback.message}
                </Text>
              </View>
            )}

            {isEdit && isAdmin && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Stato Uscita</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={toggleCancelled}
                    style={[
                      styles.adminBtn,
                      status === "cancelled" && { backgroundColor: UI.colors.danger },
                    ]}
                  >
                    <Text style={styles.adminBtnText}>
                      {status === "cancelled" ? "Riapri Uscita" : "Annulla Uscita"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={toggleArchived}
                    style={[
                      styles.adminBtn,
                      archived && { backgroundColor: UI.colors.muted },
                    ]}
                  >
                    <Text style={styles.adminBtnText}>
                      {archived ? "Ripristina Uscita" : "Archivia"}
                    </Text>
                  </Pressable>
                </View>
                <Text style={styles.helperText}>
                  Stato attuale: {status === "cancelled" ? "ANNULLATA" : "ATTIVA"}
                  {archived ? " • ARCHIVIATA" : ""}
                </Text>
              </View>
            )}

            {/* CARD 1: INFO GENERALI */}
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
                    if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
                  }}
                  placeholder="Es. Uscita Gravel Colli Euganei"
                  placeholderTextColor="#94a3b8"
                  style={[styles.input, errors.title && styles.inputError]}
                />
                {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
              </View>

              <View style={styles.formBlock}>
                <Text style={styles.label}>Guida</Text>
                <TextInput
                  value={guidaText}
                  onChangeText={setGuidaText}
                  placeholder="Es. Mario Rossi; Anna Verdi"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                />
                <Text style={styles.helperText}>
                  Separa i nomi con punto e virgola (;).
                </Text>
              </View>
            </View>

            {/* CARD 2: TIPO & DIFFICOLTÀ */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="bicycle-outline" size={22} color={UI.colors.action} />
                <Text style={styles.cardTitle}>Tipologia</Text>
              </View>

              <View style={styles.formBlock}>
                <Text style={styles.label}>Tipo Bici (Multi-selezione)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScrollContent}>
                  {BIKE_TYPES.map((b) => {
                    const active = bikes.includes(b);
                    return (
                      <Pressable
                        key={b}
                        onPress={() => toggleBike(b)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        {active && <Ionicons name="checkmark" size={16} color={UI.colors.action} />}
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{b}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {errors.bikes && <Text style={styles.errorText}>{errors.bikes}</Text>}
              </View>

              <View style={styles.formBlock}>
                <Text style={styles.label}>Difficoltà</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScrollContent}>
                  {DIFFICULTY_OPTIONS.map((opt) => {
                    const active = difficulty === opt;
                    const dotColor = getDifficultyColor(opt);
                    return (
                      <Pressable
                        key={opt}
                        onPress={() => setDifficulty(active ? "" : opt)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <View style={[styles.dot, { backgroundColor: dotColor }]} />
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            {/* CARD 3: DATA & DOVE */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="calendar-outline" size={22} color={UI.colors.action} />
                <Text style={styles.cardTitle}>Quando e Dove</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
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
                  {errors.date && <Text style={styles.errorText}>{errors.date}</Text>}
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
                  {errors.time && <Text style={styles.errorText}>{errors.time}</Text>}
                </View>
              </View>

              <View style={styles.formBlock}>
                <Text style={styles.label}>Luogo di ritrovo *</Text>
                <TextInput
                  value={meetingPoint}
                  onChangeText={(value) => {
                    setMeetingPoint(value);
                    if (errors.meetingPoint) setErrors((prev) => ({ ...prev, meetingPoint: undefined }));
                  }}
                  placeholder="Es. Piazzale Roma"
                  placeholderTextColor="#94a3b8"
                  style={[styles.input, errors.meetingPoint && styles.inputError]}
                />
                {errors.meetingPoint && <Text style={styles.errorText}>{errors.meetingPoint}</Text>}
              </View>

              <View style={styles.formBlock}>
                <Text style={styles.label}>Link posizione (Google Maps)</Text>
                <TextInput
                  value={link}
                  onChangeText={(value) => {
                    setLink(value);
                    if (errors.link) setErrors((prev) => ({ ...prev, link: undefined }));
                  }}
                  placeholder="https://maps.app.goo.gl/..."
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  keyboardType="url"
                  style={[styles.input, errors.link && styles.inputError]}
                />
                {errors.link && <Text style={styles.errorText}>{errors.link}</Text>}
              </View>
            </View>

            {/* CARD 4: DESCRIZIONE */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="document-text-outline" size={22} color={UI.colors.action} />
                <Text style={styles.cardTitle}>Descrizione</Text>
              </View>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Descrivi il percorso, il dislivello, e altre info utili..."
                placeholderTextColor="#94a3b8"
                style={[styles.input, styles.textArea]}
                multiline
              />
            </View>

            {/* CARD 5: PARTECIPAZIONE */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="people-outline" size={22} color={UI.colors.action} />
                <Text style={styles.cardTitle}>Partecipazione</Text>
              </View>
              <View style={styles.formBlock}>
                <Text style={styles.label}>Max Partecipanti (opzionale)</Text>
                <TextInput
                  value={maxParticipants}
                  onChangeText={(value) => {
                    setMaxParticipants(value);
                    if (errors.maxParticipants) setErrors((prev) => ({ ...prev, maxParticipants: undefined }));
                  }}
                  placeholder="Es. 15 (lascia vuoto per illimitati)"
                  placeholderTextColor="#94a3b8"
                  keyboardType="number-pad"
                  style={[styles.input, errors.maxParticipants && styles.inputError]}
                />
                {errors.maxParticipants && <Text style={styles.errorText}>{errors.maxParticipants}</Text>}
              </View>
            </View>

            {/* CARD 6: SERVIZI EXTRA */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="fast-food-outline" size={22} color={UI.colors.action} />
                <Text style={styles.cardTitle}>Servizi Extra</Text>
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
                {EXTRA_SERVICE_DEFINITIONS.map(({ key, label, helper }, index) => {
                  const state = extraServices[key];
                  const isToggleLocked = servicesLocked && !initialEnabledServices[key];
                  const showDivider = index < EXTRA_SERVICE_DEFINITIONS.length - 1;
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
                        onPress={() => toggleExtraService(key, !state.enabled)}
                        disabled={isToggleLocked}
                        style={({ pressed }) => [
                          styles.serviceToggleRow,
                          pressed && { backgroundColor: "rgba(0,0,0,0.02)" } // Subtle feedback
                        ]}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <View style={styles.serviceRowLeft}>
                          <View style={styles.serviceIconWrap}>
                            <Ionicons name={EXTRA_SERVICE_ICONS[key]} size={18} color={UI.colors.action} />
                          </View>
                          <View style={styles.serviceToggleText}>
                            <Text style={styles.serviceToggleLabel}>{label}</Text>
                            <Text style={styles.serviceToggleHelper}>{helper}</Text>
                          </View>
                        </View>
                        <View style={styles.serviceSwitchWrapper}>
                          <Switch
                            value={state.enabled}
                            onValueChange={(value) => toggleExtraService(key, value)}
                            disabled={isToggleLocked}
                            trackColor={{ false: "#cbd5f5", true: UI.colors.action }}
                            ios_backgroundColor="#cbd5f5"
                            thumbColor={Platform.OS === "android" ? "#fff" : undefined}
                          />
                        </View>
                      </Pressable>
                      {state.enabled && (
                        <View style={styles.serviceLabelRow}>
                          <TextInput
                            value={state.label}
                            onChangeText={(value) => updateExtraServiceLabel(key, value)}
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

            {/* Added extra padding for scroll content to clear sticky footer */}
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* STICKY CTA */}
        <View style={styles.footerContainer}>
          <TouchableOpacity
            onPress={onSave}
            disabled={saving || !isAdmin || loadingPrefill}
            style={[
              styles.saveBtn,
              (saving || !isAdmin || loadingPrefill) && styles.saveBtnDisabled,
            ]}
            activeOpacity={0.8}
          >
            {saving ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.saveBtnText}>{isEdit ? "Aggiorno..." : "Salvataggio..."}</Text>
              </View>
            ) : (
              <Text style={styles.saveBtnText}>
                {isEdit ? "Salva Modifiche" : "Crea Uscita"}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={styles.mandatoryNote}>* Campi obbligatori</Text>
        </View>
      </View >

      {/* iOS Modal DatePicker */}
      {
        Platform.OS === "ios" && (
          <Modal
            transparent
            animationType="fade"
            visible={iosPickerMode !== null}
            onRequestClose={closeIosPicker}
          >
            <View style={styles.pickerWrapper}>
              <TouchableWithoutFeedback onPress={closeIosPicker}>
                <View style={styles.pickerOverlay} />
              </TouchableWithoutFeedback>

              <View style={styles.pickerContainer}>
                <View style={styles.pickerHeader}>
                  <TouchableOpacity onPress={closeIosPicker} style={styles.pickerHeaderBtn}>
                    <Text style={styles.pickerHeaderText}>Annulla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmIosPicker} style={styles.pickerHeaderBtn}>
                    <Text style={styles.pickerHeaderTextPrimary}>
                      Fatto
                    </Text>
                  </TouchableOpacity>
                </View>

                {iosPickerMode === "date" && (
                  <View style={styles.pickerPreviewRow}>
                    <Text style={styles.pickerPreviewLabel}>
                      {formatDisplayDateLabel(formatDateValue(iosPickerValue))}
                    </Text>
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
                    textColor="#000000"
                  />
                )}
              </View>
            </View>
          </Modal>
        )
      }

      {/* Android TimePicker Helper */}
      <AndroidTimePicker
        visible={androidTimePickerVisible}
        initialDate={androidTimePickerInitialDate}
        onCancel={() => setAndroidTimePickerVisible(false)}
        onConfirm={(date) => {
          applyPickerValue("time", date);
          setAndroidTimePickerVisible(false);
        }}
      />
    </Screen >
  );
}

const styles = StyleSheet.create({
  // ROOT
  root: {
    flex: 1,
    backgroundColor: "#FDFCF8", // Background light off-white
  },

  // HEADER
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
    marginTop: 2, // Optical alignment with text line-height
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1E293B",
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748B",
    marginTop: 2,
  },

  // CARD LAYOUT
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 100, // space for sticky footer
    gap: 20, // Vertical spacing between cards
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    // Soft shadow
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
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
  },

  // FORM ELEMENTS
  formBlock: { gap: 6 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 4,
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
  inputFocus: {
    borderColor: UI.colors.action, // We manually apply this if we can track focus, or just rely on default
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
    marginTop: 4,
  },
  helperText: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 18,
  },
  fakeInput: {
    justifyContent: "center",
  },
  fakeInputValue: {
    fontSize: 16,
    color: "#0F172A",
  },
  fakeInputPlaceholder: {
    fontSize: 16,
    color: "#9CA3AF",
  },

  // CHIPS
  chipsScrollContent: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 2,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipActive: {
    backgroundColor: "rgba(34, 197, 94, 0.08)", // UI.colors.action with opacity
    borderColor: UI.colors.action,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  chipTextActive: {
    color: UI.colors.action,
  },

  // DIFFICULTY DOTS
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // EXTRAS
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

  // FEEDBACK / ALERTS
  feedbackBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  feedbackSuccess: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  feedbackError: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  alertBox: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  alertText: {
    color: "#9A3412",
    fontWeight: "600",
    fontSize: 13,
  },

  adminBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: UI.colors.action,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  adminBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    textAlign: "center",
  },

  // STICKY FOOTER
  footerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(253, 252, 248, 0.9)", // matches root bg with Blur effect if possible, but solid is safer
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === "ios" ? 32 : 16,
  },
  saveBtn: {
    backgroundColor: UI.colors.action,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: UI.colors.action,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  saveBtnDisabled: {
    opacity: 0.6,
    shadowOpacity: 0.1,
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 17,
  },
  mandatoryNote: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 12,
  },

  // PICKERS
  pickerWrapper: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end" },
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  pickerContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 320,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingBottom: 12,
  },
  pickerHeaderBtn: { padding: 8 },
  pickerHeaderText: { fontSize: 16, color: "#475569" },
  pickerHeaderTextPrimary: { color: UI.colors.action, fontWeight: "700" },
  pickerPreviewRow: { alignItems: "center", paddingBottom: 16 },
  pickerPreviewLabel: { fontSize: 20, fontWeight: "700", color: "#1E293B" },
  iosPicker: { width: "100%", height: 200 },
});
