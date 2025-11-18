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
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { auth, db } from "../firebase";
import {
  serverTimestamp,
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
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { splitGuideInput } from "../utils/guideHelpers";

type FieldErrors = {
  title?: string;
  meetingPoint?: string;
  date?: string;
  time?: string;
  maxParticipants?: string;
  link?: string;
  bikes?: string;
};

const BIKE_TYPES = ["BDC", "Gravel", "MTB", "eBike", "Enduro"] as const;
const DIFFICULTY_OPTIONS = [
  "Facile",
  "Medio/Moderato",
  "Difficile/Impegnativo",
  "Estremo",
] as const;

type ExtraServiceKey = "lunch" | "dinner" | "overnight";

type ExtraServiceState = {
  enabled: boolean;
  label: string;
};

const EXTRA_SERVICE_KEYS: ExtraServiceKey[] = ["lunch", "dinner", "overnight"];

const EXTRA_SERVICE_DEFINITIONS: Array<{ key: ExtraServiceKey; label: string; helper: string }> = [
  { key: "lunch", label: "Pranzo", helper: "Richiedi se il partecipante aderisce al pranzo." },
  { key: "dinner", label: "Cena", helper: "Richiedi se il partecipante aderisce alla cena." },
  { key: "overnight", label: "Pernotto", helper: "Richiedi se il partecipante necessita del pernottamento." },
];

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

// Tipi route
type RootStackParamList = {
  CreateRide: { rideId?: string } | undefined;
};

export default function CreateRideScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "CreateRide">>();
  const rideId = route.params?.rideId;

  // ---------- stato admin ----------
  const [isAdmin, setIsAdmin] = useState(false);

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
      DateTimePickerAndroid.open({
        mode,
        display: mode === "date" ? "calendar" : "spinner",
        value: base,
        is24Hour: true,
        onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
          if (event.type !== "set" || !selectedDate) return;
          const next = new Date(selectedDate);
          if (mode === "time") {
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
        const role = snap.exists() ? (snap.data() as any)?.role : null;
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
        const d = snap.data() as any;
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

  // ---------- validazione semplice ----------
  const validate = useCallback(() => {
    const t = title.trim();
    const mp = meetingPoint.trim();
    const errs: FieldErrors = {};

    if (!t) {
      errs.title = "Inserisci un titolo";
    } else if (t.length > 120) {
      errs.title = "Massimo 120 caratteri";
    }

    if (!mp) {
      errs.meetingPoint = "Indica il luogo di ritrovo";
    } else if (mp.length > 200) {
      errs.meetingPoint = "Massimo 200 caratteri";
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errs.date = "Seleziona una data valida";
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      errs.time = "Seleziona un orario valido";
    }
    const dt = parseDateTime();
    if (!dt) {
      errs.date = errs.date ?? "Data non valida";
      errs.time = errs.time ?? "Ora non valida";
    }

    if (maxParticipants.trim() !== "") {
      const num = Number(maxParticipants);
      if (!Number.isFinite(num) || num < 0) {
        errs.maxParticipants = "Inserisci un numero ≥ 0";
      }
    }

    if (Array.isArray(bikes) && bikes.length > 20) {
      errs.bikes = "Max 20 tipologie";
    }

    if (link.trim() && !/^((https?):\/\/|geo:)/i.test(link.trim())) {
      errs.link = "Inserisci un URL valido (es. https://…)";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [title, meetingPoint, date, time, maxParticipants, bikes, link]);

  // ---------- helper pulizia payload ----------
  function sanitizeCreatePayload(raw: any) {
    const obj: Record<string, any> = { ...raw };
    const trimIfString = (v: any) => (typeof v === "string" ? v.trim() : v);

    Object.keys(obj).forEach((k) => {
      obj[k] = trimIfString(obj[k]);
    });

    Object.keys(obj).forEach((k) => {
      if (obj[k] === null || obj[k] === undefined) delete obj[k];
    });

    return obj;
  }

  // ---------- salva ----------
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
    const maxNum =
      maxParticipants.trim() === ""
        ? null
        : Number.isNaN(Number(maxParticipants))
        ? null
        : Number(maxParticipants);

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

    const names = splitGuideInput(guidaText);
    const guidaName = names.length > 0 ? names[0] : null;
    const guidaNames = names.length > 1 ? names : names.length === 1 ? [names[0]] : null;

    const basePayload: Record<string, any> = {
      title: title.trim(),
      meetingPoint: meetingPoint.trim(),
      description: (description || "").trim() || null,
      bikes: Array.isArray(bikes) ? bikes.slice(0, 20) : [],
      dateTime: Timestamp.fromDate(dt),
      date: Timestamp.fromDate(dt),
      maxParticipants: maxNum,
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      status: "active",
      archived: false,
      participantsCount: 0,
      link: link.trim() ? link.trim() : null,
      difficulty: difficulty ? difficulty : null,
      guidaName: guidaName ?? null,
      guidaNames: guidaNames ?? null,
    };

  const payload = sanitizeCreatePayload(basePayload);
    if (Object.keys(extraServicesPayload).length > 0) {
      payload.extraServices = extraServicesPayload;
    } else if (isEdit) {
      payload.extraServices = null;
    }

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

  return (
    <>
      <Screen
        title={titleScreen}
        subtitle={isAdmin ? "Solo Admin o Owner possono salvare" : "Compila i dettagli dell'uscita"}
        scroll={true}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: UI.spacing.md }}>
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
          {!!adminWarning && (
            <View style={styles.alertBox}>
              <Text style={styles.alertText}>{adminWarning}</Text>
            </View>
          )}

          <View style={styles.formBlock}>
            <Text style={styles.label}>Titolo *</Text>
            <TextInput
              value={title}
              onChangeText={(value) => {
                setTitle(value);
                if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
              }}
              placeholder="Uscita Gravel ai Colli Euganei"
              style={[styles.input, errors.title && styles.inputError]}
              autoCorrect
              autoCapitalize="sentences"
              returnKeyType="next"
              blurOnSubmit={false}
            />
            {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.label}>Guida (testo libero)</Text>
            <TextInput
              value={guidaText}
              onChangeText={setGuidaText}
              placeholder="Es. Mario Rossi; Anna Verdi"
              style={styles.input}
            />
            <Text style={styles.helperText}>
              Separa i nomi con il punto e virgola (;). Il primo sarà mostrato come “guida principale”.
            </Text>
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.label}>Tipo di bici</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsScrollContent}
            >
              {BIKE_TYPES.map((b) => {
                const active = bikes.includes(b);
                return (
                  <Pressable
                    key={b}
                    onPress={() => toggleBike(b)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{b}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {errors.bikes && <Text style={styles.errorText}>{errors.bikes}</Text>}
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.label}>Difficoltà</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsScrollContent}
            >
              {DIFFICULTY_OPTIONS.map((opt) => {
                const active = difficulty === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setDifficulty(active ? "" : opt)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.label}>Data *</Text>
            <Pressable
              onPress={() => openNativePicker("date")}
              style={[styles.input, styles.fakeInput, errors.date && styles.inputError]}
              accessibilityRole="button"
              accessibilityLabel="Seleziona la data dell'uscita"
            >
              <Text style={date ? styles.fakeInputValue : styles.fakeInputPlaceholder}>
                {date ? displayDateValue : "Seleziona data"}
              </Text>
            </Pressable>
            {errors.date && <Text style={styles.errorText}>{errors.date}</Text>}
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.label}>Ora *</Text>
            <Pressable
              onPress={() => openNativePicker("time")}
              style={[styles.input, styles.fakeInput, errors.time && styles.inputError]}
              accessibilityRole="button"
              accessibilityLabel="Seleziona l'orario di partenza"
            >
              <Text style={time ? styles.fakeInputValue : styles.fakeInputPlaceholder}>
                {time || "Seleziona orario"}
              </Text>
            </Pressable>
            {errors.time && <Text style={styles.errorText}>{errors.time}</Text>}
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.label}>Luogo di ritrovo *</Text>
            <TextInput
              value={meetingPoint}
              onChangeText={(value) => {
                setMeetingPoint(value);
                if (errors.meetingPoint) setErrors((prev) => ({ ...prev, meetingPoint: undefined }));
              }}
              placeholder="Piazzale Roma"
              style={[styles.input, errors.meetingPoint && styles.inputError]}
            />
            {errors.meetingPoint && <Text style={styles.errorText}>{errors.meetingPoint}</Text>}
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.label}>Link posizione (opzionale)</Text>
            <TextInput
              value={link}
              onChangeText={(value) => {
                setLink(value);
                if (errors.link) setErrors((prev) => ({ ...prev, link: undefined }));
              }}
              placeholder="Incolla link Google Maps / Apple Maps / geo:"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.input, errors.link && styles.inputError]}
            />
            {errors.link && <Text style={styles.errorText}>{errors.link}</Text>}
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.label}>Descrizione</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Percorso gravel panoramico…"
              style={[styles.input, styles.textArea]}
              multiline
            />
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.label}>Numero massimo partecipanti (opzionale)</Text>
            <TextInput
              value={maxParticipants}
              onChangeText={(value) => {
                setMaxParticipants(value);
                if (errors.maxParticipants) setErrors((prev) => ({ ...prev, maxParticipants: undefined }));
              }}
              placeholder="es. 12 (lascia vuoto per nessun limite)"
              keyboardType="number-pad"
              inputMode="numeric"
              style={[styles.input, errors.maxParticipants && styles.inputError]}
            />
            {errors.maxParticipants && <Text style={styles.errorText}>{errors.maxParticipants}</Text>}
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.label}>Servizi extra</Text>
            <Text style={styles.helperText}>
              Attiva le richieste aggiuntive: i partecipanti dovranno rispondere Sì/No durante la prenotazione.
            </Text>
            {servicesLocked && (
              <Text style={styles.warningText}>
                Non è possibile attivare nuovi servizi perché l'uscita ha già prenotati.
              </Text>
            )}
            <View style={{ gap: UI.spacing.sm, marginTop: UI.spacing.xs }}>
              {EXTRA_SERVICE_DEFINITIONS.map(({ key, label, helper }) => {
                const state = extraServices[key];
                const isToggleLocked = servicesLocked && !initialEnabledServices[key];
                return (
                  <View
                    key={key}
                    style={[
                      styles.serviceToggleBlock,
                      isToggleLocked && styles.serviceToggleDisabled,
                    ]}
                  >
                    <View style={styles.serviceToggleRow}>
                      <Pressable
                        style={{ flex: 1, paddingRight: UI.spacing.sm }}
                        onPress={() => toggleExtraService(key, !state.enabled)}
                        disabled={isToggleLocked}
                        accessibilityRole="switch"
                        accessibilityState={{
                          disabled: isToggleLocked,
                          checked: state.enabled,
                        }}
                      >
                        <Text style={styles.serviceToggleLabel}>{label}</Text>
                        <Text style={styles.serviceToggleHelper}>{helper}</Text>
                      </Pressable>
                      <View style={styles.serviceSwitchWrapper}>
                        <Switch
                          value={state.enabled}
                          onValueChange={(value) => toggleExtraService(key, value)}
                          disabled={isToggleLocked}
                          trackColor={{ false: "#cbd5f5", true: UI.colors.primary }}
                          thumbColor={
                            Platform.OS === "android" ? (state.enabled ? "#fff" : "#f8fafc") : undefined
                          }
                        />
                      </View>
                    </View>
                    {state.enabled && (
                      <TextInput
                        value={state.label}
                        onChangeText={(value) => updateExtraServiceLabel(key, value)}
                        style={styles.serviceLabelInput}
                        placeholder={`Dettagli ${label.toLowerCase()} (facoltativo)`}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          {isEdit && isAdmin && (
            <View style={[styles.formBlock, { gap: UI.spacing.sm }]}>
              <Text style={styles.label}>Azioni amministrative</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: UI.spacing.sm }}>
                <Pressable
                  onPress={toggleCancelled}
                  style={[
                    styles.adminBtn,
                    status === "cancelled" && { backgroundColor: UI.colors.danger },
                  ]}
                >
                  <Text style={styles.adminBtnText}>
                    {status === "cancelled" ? "Riapri" : "Annulla"}
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
                    {archived ? "Ripristina" : "Archivia"}
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.helperText}>
                Stato attuale: {status === "cancelled" ? "ANNULLATA" : "ATTIVA"}
                {archived ? " • ARCHIVIATA" : ""}
              </Text>
            </View>
          )}

          <View style={{ marginTop: UI.spacing.lg }}>
            <TouchableOpacity
              onPress={onSave}
              disabled={saving || !isAdmin || loadingPrefill}
              style={[
                styles.saveBtn,
                (saving || !isAdmin || loadingPrefill) && styles.saveBtnDisabled,
              ]}
            >
              {saving ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.saveBtnText}>{isEdit ? "Aggiorno…" : "Salvataggio…"}</Text>
                </View>
              ) : (
                <Text style={styles.saveBtnText}>
                  {isEdit ? "💾 Salva modifiche" : "💾 Crea uscita"}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.mandatoryNote}>* Campi obbligatori</Text>

          <VSpace size="xl" />
        </View>
      </Screen>

      {Platform.OS === "ios" && (
        <Modal
          transparent
          animationType="slide"
          visible={iosPickerMode !== null}
          onRequestClose={closeIosPicker}
        >
          <View style={styles.pickerWrapper}>
            {/* backdrop cliccabile */}
            <TouchableWithoutFeedback onPress={closeIosPicker}>
              <View style={styles.pickerOverlay} />
            </TouchableWithoutFeedback>

            {/* sheet in basso con header + DateTimePicker */}
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={closeIosPicker} style={styles.pickerHeaderBtn}>
                  <Text style={styles.pickerHeaderText}>Annulla</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmIosPicker} style={styles.pickerHeaderBtn}>
                  <Text style={[styles.pickerHeaderText, styles.pickerHeaderTextPrimary]}>
                    Fatto
                  </Text>
                </TouchableOpacity>
              </View>

              {iosPickerMode === "date" ? (
                <View style={styles.pickerPreviewRow}>
                  <Text style={styles.pickerPreviewLabel}>
                    {formatDisplayDateLabel(formatDateValue(iosPickerValue))}
                  </Text>
                </View>
              ) : null}

              {iosPickerMode && (
                <DateTimePicker
                  value={iosPickerValue}
                  mode={iosPickerMode}
                  display={isIos ? "spinner" : "default"}
                  preferredDatePickerStyle={isIos ? "spinner" : undefined}
                  onChange={(_, selected) => {
                    if (selected) setIosPickerValue(selected);
                  }}
                  minuteInterval={iosPickerMode === "time" ? 1 : undefined}
                  locale="it-IT"
                  style={styles.iosPicker}
                />
              )}
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  formBlock: { gap: UI.spacing.xs },
  label: {
    fontWeight: "700",
    color: UI.colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: UI.radius.md,
    paddingHorizontal: UI.spacing.sm,
    paddingVertical: 12,
    backgroundColor: "#fff",
    fontSize: 16,
    color: UI.colors.text,
  },
  fakeInput: {
    justifyContent: "center",
  },
  fakeInputValue: {
    fontSize: 16,
    color: UI.colors.text,
  },
  fakeInputPlaceholder: {
    fontSize: 16,
    color: "#9ca3af",
  },
  inputError: {
    borderColor: "#f87171",
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 12,
    marginTop: 4,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  helperText: {
    fontSize: 12,
    color: UI.colors.muted,
  },
  warningText: {
    fontSize: 12,
    color: "#b91c1c",
    marginTop: 4,
  },
  chipsScrollContent: {
    flexDirection: "row",
    gap: UI.spacing.sm,
    paddingVertical: 4,
  },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: UI.spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: UI.radius.round,
    paddingHorizontal: UI.spacing.md - 2,
    paddingVertical: UI.spacing.xs - 2,
    backgroundColor: "#fff",
  },
  chipActive: {
    backgroundColor: UI.colors.primary,
    borderColor: UI.colors.primary,
  },
  chipText: { color: UI.colors.text, fontWeight: "600" },
  chipTextActive: { color: "#fff" },

  serviceToggleBlock: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: UI.radius.md,
    padding: UI.spacing.sm,
    backgroundColor: "#f8fafc",
    gap: UI.spacing.xs,
  },
  serviceToggleDisabled: {
    opacity: 0.55,
  },
  serviceToggleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: UI.spacing.sm,
  },
  serviceSwitchWrapper: {
    flexShrink: 0,
    paddingLeft: UI.spacing.sm,
    paddingRight: UI.spacing.xs,
    paddingTop: 2,
    alignItems: "flex-end",
    justifyContent: "flex-start",
    alignSelf: "flex-start",
    ...Platform.select({
      ios: { minWidth: 68 },
      default: { minWidth: 60 },
    }),
  },
  serviceToggleLabel: {
    fontWeight: "700",
    color: UI.colors.text,
  },
  serviceToggleHelper: {
    fontSize: 12,
    color: UI.colors.muted,
    marginTop: 2,
  },
  serviceLabelInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: UI.radius.md,
    paddingHorizontal: UI.spacing.sm,
    paddingVertical: 10,
    backgroundColor: "#fff",
    fontSize: 15,
    color: UI.colors.text,
  },

  // === iOS picker modal ===
  pickerWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  // backdrop prende lo spazio sopra il foglio, non è absolute
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  // sheet in basso con il DateTimePicker
  pickerContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: UI.radius.lg,
    borderTopRightRadius: UI.radius.lg,
    minHeight: 320,
    paddingHorizontal: UI.spacing.md,
    paddingTop: UI.spacing.sm,
    paddingBottom: UI.spacing.md,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: UI.spacing.md,
    paddingVertical: UI.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  pickerHeaderBtn: {
    paddingVertical: UI.spacing.xs,
  },
  pickerHeaderText: {
    fontSize: 16,
    color: UI.colors.text,
  },
  pickerHeaderTextPrimary: {
    color: UI.colors.primary,
    fontWeight: "700",
  },
  pickerPreviewRow: {
    paddingHorizontal: UI.spacing.lg,
    paddingVertical: UI.spacing.xs,
    alignItems: "center",
  },
  pickerPreviewLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: UI.colors.text,
  },
  iosPicker: {
    width: "100%",
    minHeight: 260,
  },

  adminBtn: {
    backgroundColor: UI.colors.primary,
    paddingHorizontal: UI.spacing.md,
    paddingVertical: UI.spacing.xs,
    borderRadius: UI.radius.md,
  },
  adminBtnText: { color: "#fff", fontWeight: "700" },
  alertBox: {
    backgroundColor: UI.colors.warningBg,
    borderColor: UI.colors.warningBorder,
    borderWidth: 1,
    borderRadius: UI.radius.md,
    padding: UI.spacing.sm,
  },
  alertText: {
    color: "#7C2D12",
    fontWeight: "600",
  },
  feedbackBox: {
    paddingHorizontal: UI.spacing.sm,
    paddingVertical: UI.spacing.xs,
    borderRadius: UI.radius.md,
    borderWidth: 1,
  },
  feedbackSuccess: {
    backgroundColor: "#dcfce7",
    borderColor: "#bbf7d0",
  },
  feedbackError: {
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca",
  },
  saveBtn: {
    backgroundColor: UI.colors.accent,
    borderRadius: UI.radius.lg,
    paddingVertical: UI.spacing.sm,
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  mandatoryNote: {
    fontSize: 12,
    color: UI.colors.muted,
    textAlign: "right",
  },
});