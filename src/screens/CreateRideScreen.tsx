// src/screens/CreateRideScreen.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { auth, db } from "../firebase";
import {
  serverTimestamp,
  Timestamp,
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  setDoc,
  collection,
} from "firebase/firestore";
import { Screen, UI } from "../components/Screen";

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

// Spaziatore verticale
const VSpace = ({ size = "md" as keyof typeof UI.spacing }) => (
  <View style={{ height: UI.spacing[size] }} />
);

// Tipi route (adatta se il tuo RootStack ha nomi diversi)
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
  const [saving, setSaving] = useState(false);
  const [loadingPrefill, setLoadingPrefill] = useState<boolean>(!!rideId);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), feedback.type === "success" ? 2500 : 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  // campi amministrativi (solo in edit)
  const [status, setStatus] = useState<"active" | "cancelled">("active");
  const [archived, setArchived] = useState<boolean>(false);

  // --------- util ---------
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

  const handleDateChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 4)}-${digits.slice(4)}`;
    }
    if (digits.length > 6) {
      formatted = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
    }
    setDate(formatted);
    if (errors.date) setErrors((prev) => ({ ...prev, date: undefined }));
  };

  const handleTimeChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    let formatted = digits;
    if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}:${digits.slice(2)}`;
    }
    setTime(formatted);
    if (errors.time) setErrors((prev) => ({ ...prev, time: undefined }));
  };

  const isEdit = !!rideId;

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
    if (!rideId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "rides", rideId));
        if (!snap.exists()) {
          Alert.alert("Attenzione", "Uscita non trovata.");
          navigation.goBack();
          return;
        }
        const d = snap.data() as any;
        setTitle(d?.title ?? "");
        setGuidaText(
          Array.isArray(d?.guidaNames) && d.guidaNames.length
            ? d.guidaNames.join(", ")
            : (d?.guidaName ?? "")
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
      } catch (e: any) {
        Alert.alert("Errore", e?.message ?? "Impossibile caricare i dati.");
      } finally {
        setLoadingPrefill(false);
      }
    })();
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
      errs.date = "Formato atteso YYYY-MM-DD";
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      errs.time = "Formato atteso HH:MM";
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
    // trim stringhe
    const obj: Record<string, any> = { ...raw };
    const trimIfString = (v: any) => (typeof v === "string" ? v.trim() : v);

    Object.keys(obj).forEach((k) => {
      obj[k] = trimIfString(obj[k]);
    });

    // rimuovi chiavi con null/undefined per non rischiare validazioni inutili
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

    // guidaName (singolo) + guidaNames (lista) dai testi separati da virgola
    const names = guidaText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const guidaName = names.length > 0 ? names[0] : null;
    const guidaNames = names.length > 1 ? names : names.length === 1 ? [names[0]] : null;

    // costruisci payload compatibile rules
    const basePayload: Record<string, any> = {
      title: title.trim(),
      meetingPoint: meetingPoint.trim(),
      description: (description || "").trim() || null,
      bikes: Array.isArray(bikes) ? bikes.slice(0, 20) : [],
      dateTime: Timestamp.fromDate(dt), // ⬅️ OBBLIGATORIO timestamp
      date: Timestamp.fromDate(dt),     // opzionale ma ok come timestamp
      maxParticipants: maxNum,          // null o int >= 0
      createdBy: auth.currentUser.uid,  // ⬅️ string
      createdAt: serverTimestamp(),     // ⬅️ timestamp
      status: "active",                 // ⬅️ "active" | "cancelled"
      archived: false,                  // ⬅️ bool
      participantsCount: 0,             // ⬅️ int >= 0
      link: link.trim() ? link.trim() : null,
      difficulty: difficulty ? difficulty : null,
      guidaName: guidaName ?? null,
      guidaNames: guidaNames ?? null,   // lista o omessa
      // archiveYear/month verranno aggiunti solo in archivio
    };

    const payload = sanitizeCreatePayload(basePayload);

    setSaving(true);
    try {
      if (isEdit) {
        // UPDATE (solo campi ammessi dalle regole)
        await updateDoc(doc(db, "rides", rideId!), {
          ...payload,
          status,   // "active" | "cancelled"
          archived, // true | false
        });
        setFeedback({ type: "success", message: "Uscita aggiornata correttamente." });
      } else {
        // CREATE con setDoc su id generato (invece di addDoc)
        const ridesColl = collection(db, "rides");
        // genera id localmente (usa crypto.randomUUID se disponibile, altrimenti Firestore doc().id)
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
            placeholder="Es. Mario Rossi, Anna Verdi"
            style={styles.input}
          />
          <Text style={styles.helperText}>
            Puoi inserire più nomi separati da virgola. Il primo sarà mostrato come “guida principale”.
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
          <Text style={styles.label}>Data (YYYY-MM-DD) *</Text>
          <TextInput
            value={date}
            onChangeText={handleDateChange}
            placeholder="2025-10-10"
            keyboardType="number-pad"
            inputMode="numeric"
            autoCapitalize="none"
            style={[styles.input, errors.date && styles.inputError]}
          />
          {errors.date && <Text style={styles.errorText}>{errors.date}</Text>}
        </View>

        <View style={styles.formBlock}>
          <Text style={styles.label}>Ora (HH:MM) *</Text>
          <TextInput
            value={time}
            onChangeText={handleTimeChange}
            placeholder="08:30"
            keyboardType="number-pad"
            inputMode="numeric"
            autoCapitalize="none"
            style={[styles.input, errors.time && styles.inputError]}
          />
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
