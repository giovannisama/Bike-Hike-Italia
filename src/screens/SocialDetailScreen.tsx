import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
  Linking,
  Alert,
  Platform,
  TouchableOpacity,
  KeyboardAvoidingView,
  Share,
  Switch,
} from "react-native";
import { Screen, UI } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { Ionicons } from "@expo/vector-icons";
import useCurrentProfile from "../hooks/useCurrentProfile";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { auth, db } from "../firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { StatusBadge } from "./calendar/StatusBadge";
import * as Calendar from "expo-calendar";

type SocialEvent = {
  title?: string;
  meetingPlaceText?: string;
  meetingMapUrl?: string | null;
  organizerName?: string | null;
  description?: string | null;
  startAt?: any;
  status?: "active" | "cancelled" | "archived";
  extraServices?: {
    lunch?: { enabled?: boolean; label?: string | null };
    dinner?: { enabled?: boolean; label?: string | null };
  };
};

type ParticipantDoc = {
  id: string;
  uid?: string;
  displayName?: string;
  note?: string | null;
  source?: string;
  services?: { lunch?: "yes" | "no"; dinner?: "yes" | "no" } | null;
};

type Choice = "yes" | "no" | null;

const EXTRA_KEYS = ["lunch", "dinner"] as const;
const SERVICE_LABELS: Record<(typeof EXTRA_KEYS)[number], string> = {
  lunch: "Pranzo",
  dinner: "Cena",
};
const emptySelection = () => ({ lunch: null as Choice, dinner: null as Choice });

export default function SocialDetailScreen() {
  const { isAdmin, isOwner, displayName } = useCurrentProfile();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<any>();
  const eventId = route.params?.eventId as string | undefined;
  const canEdit = isAdmin || isOwner;
  const [event, setEvent] = useState<SocialEvent | null>(null);
  const [participants, setParticipants] = useState<ParticipantDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinSaving, setJoinSaving] = useState(false);
  const [isSavingJoinLeave, setIsSavingJoinLeave] = useState(false);
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: string; displayName?: string } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualSaving, setManualSaving] = useState(false);
  const [joinServices, setJoinServices] = useState<Record<"lunch" | "dinner", Choice>>(() => emptySelection());
  const [manualServices, setManualServices] = useState<Record<"lunch" | "dinner", Choice>>(() => emptySelection());

  useEffect(() => {
    if (!eventId) return;
    const eventRef = doc(db, "social_events", eventId);
    const unsub = onSnapshot(
      eventRef,
      (snap) => {
        if (snap.exists()) {
          setEvent(snap.data() as SocialEvent);
        } else {
          setEvent(null);
        }
        setLoading(false);
      },
      (err) => {
        console.warn("SocialDetail fetch error", err);
        setLoading(false);
      }
    );
    return () => {
      try {
        unsub();
      } catch { }
    };
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    const q = query(
      collection(db, "social_events", eventId, "participants")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: ParticipantDoc[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const legacyServices = data?.extrasChoice ?? null;
          next.push({
            id: docSnap.id,
            uid: data?.uid,
            displayName: data?.displayName ?? data?.name ?? "Utente",
            note: data?.note ?? null,
            source: data?.source ?? "self",
            services: data?.services ?? legacyServices ?? null,
          });
        });
        setParticipants(next);
      },
      () => setParticipants([])
    );
    return () => {
      try {
        unsub();
      } catch { }
    };
  }, [eventId]);

  const userId = auth.currentUser?.uid ?? null;
  const userParticipant = useMemo(
    () => participants.find((p) => p.uid === userId),
    [participants, userId]
  );

  const orderedParticipants = useMemo(() => {
    const registered = participants
      .filter((p) => p.source !== "manual")
      .map((p) => ({ ...p }))
      .sort((a, b) => {
        const timeA = (a as any).joinedAt?.toDate?.()?.getTime?.() ?? (a as any).createdAt?.toDate?.()?.getTime?.() ?? 0;
        const timeB = (b as any).joinedAt?.toDate?.()?.getTime?.() ?? (b as any).createdAt?.toDate?.()?.getTime?.() ?? 0;
        return timeA - timeB;
      });

    const manual = participants.filter((p) => p.source === "manual");
    return [...registered, ...manual];
  }, [participants]);

  const legacyExtras = (event as any)?.extras ?? {};
  const extraLunchEnabled = !!event?.extraServices?.lunch?.enabled || !!legacyExtras?.lunch;
  const extraDinnerEnabled = !!event?.extraServices?.dinner?.enabled || !!legacyExtras?.dinner;
  const extrasEnabled = {
    lunch: extraLunchEnabled,
    dinner: extraDinnerEnabled,
  };
  const status = (event?.status as "active" | "cancelled" | "archived") ?? "active";
  const isInactive = status !== "active";
  const isCancelled = status === "cancelled";
  const canModifyParticipation = status === "active";

  const buildSelectionFromServices = useCallback(
    (services?: ParticipantDoc["services"] | null) => {
      return {
        lunch: extraLunchEnabled ? (services?.lunch ?? "no") : null,
        dinner: extraDinnerEnabled ? (services?.dinner ?? "no") : null,
      };
    },
    [extraLunchEnabled, extraDinnerEnabled]
  );

  useEffect(() => {
    if (userParticipant) {
      setJoinServices(buildSelectionFromServices(userParticipant.services ?? null));
    }
  }, [userParticipant, buildSelectionFromServices]);

  const stats = useMemo(() => {
    const base = {
      lunch: { yes: 0, no: 0 },
      dinner: { yes: 0, no: 0 },
    };
    participants.forEach((p) => {
      const lunch = p.services?.lunch;
      const dinner = p.services?.dinner;
      if (lunch === "yes") base.lunch.yes += 1;
      if (lunch === "no") base.lunch.no += 1;
      if (dinner === "yes") base.dinner.yes += 1;
      if (dinner === "no") base.dinner.no += 1;
    });
    return base;
  }, [participants]);

  const formatDate = (dt?: any) => {
    const dateObj = dt?.toDate?.();
    if (!dateObj) return "Data da definire";
    return format(dateObj, "EEE d MMM • HH:mm", { locale: it });
  };
  const dateObj = event?.startAt?.toDate?.();
  const dateLabel = dateObj ? format(dateObj, "EEE d MMMM yyyy", { locale: it }) : "";
  const timeLabel = dateObj ? format(dateObj, "HH:mm") : "";

  const openJoinModal = useCallback(() => {
    setEditTarget(null);
    setNoteText("");
    setJoinServices(buildSelectionFromServices());
    setNoteModalVisible(true);
  }, [buildSelectionFromServices]);

  const closeNoteModal = useCallback(() => {
    if (joinSaving || isSavingJoinLeave) return;
    setNoteModalVisible(false);
    setEditTarget(null);
    setJoinServices(emptySelection());
  }, [isSavingJoinLeave, joinSaving]);

  const openEditModal = useCallback(
    (target: ParticipantDoc) => {
      if (!canModifyParticipation) return;
      setEditTarget({ id: target.id, displayName: target.displayName });
      setNoteText(target.note ?? "");
      setJoinServices(buildSelectionFromServices(target.services ?? null));
      setNoteModalVisible(true);
    },
    [buildSelectionFromServices, canModifyParticipation]
  );

  const setServiceValue = useCallback(
    (
      key: "lunch" | "dinner",
      nextValue: boolean,
      setState: React.Dispatch<React.SetStateAction<Record<"lunch" | "dinner", Choice>>>
    ) => {
      setState((prev) => ({ ...prev, [key]: nextValue ? "yes" : "no" }));
    },
    []
  );

  const hasMissingChoices = useMemo(() => {
    if (extrasEnabled.lunch && !joinServices.lunch) return true;
    if (extrasEnabled.dinner && !joinServices.dinner) return true;
    return false;
  }, [joinServices, extrasEnabled]);

  const handleUpdateParticipation = async () => {
    if (!eventId || !editTarget) return;
    if (!canModifyParticipation) return;
    setJoinSaving(true);
    setIsSavingJoinLeave(true);
    try {
      const safeNote = noteText ? noteText.trim().slice(0, 500) : null;
      const cleanServices: Record<string, "yes" | "no"> = {};
      if (joinServices.lunch) cleanServices.lunch = joinServices.lunch;
      if (joinServices.dinner) cleanServices.dinner = joinServices.dinner;
      await updateDoc(doc(db, "social_events", eventId, "participants", editTarget.id), {
        note: safeNote,
        ...(Object.keys(cleanServices).length > 0 ? { services: cleanServices } : {}),
      });
    } finally {
      setJoinSaving(false);
      setIsSavingJoinLeave(false);
      setNoteModalVisible(false);
      setEditTarget(null);
    }
  };

  const handleJoin = async () => {
    if (!eventId || !userId) return;
    if (isSavingJoinLeave) return;
    if (isInactive) return;
    if (isCancelled) {
      Alert.alert("Evento annullato", "Le iscrizioni sono disabilitate.");
      return;
    }
    if (hasMissingChoices) {
      const missing = EXTRA_KEYS.filter((key) => extrasEnabled[key] && !joinServices[key]);
      const labels = missing
        .map((k) => event?.extraServices?.[k]?.label || SERVICE_LABELS[k])
        .join(", ");
      Alert.alert("Scelta obbligatoria", `Devi indicare SI o NO per: ${labels}`);
      return;
    }
    setJoinSaving(true);
    setIsSavingJoinLeave(true);
    try {
      const userRef = doc(db, "social_events", eventId, "participants", userId);
      const snap = await getDoc(userRef);
      const safeNote = noteText ? noteText.trim().slice(0, 500) : null;
      const cleanServices: Record<string, "yes" | "no"> = {};
      if (joinServices.lunch) cleanServices.lunch = joinServices.lunch;
      if (joinServices.dinner) cleanServices.dinner = joinServices.dinner;
      if (snap.exists()) {
        const updatePayload: any = {};
        updatePayload.note = safeNote;
        if (Object.keys(cleanServices).length > 0) updatePayload.services = cleanServices;
        await updateDoc(userRef, updatePayload);
      } else {
        await setDoc(userRef, {
          uid: userId,
          displayName: displayName || auth.currentUser?.displayName || "Utente",
          joinedAt: serverTimestamp(),
          note: safeNote,
          services: Object.keys(cleanServices).length > 0 ? cleanServices : null,
          source: "self",
        });
      }
      Alert.alert("Partecipazione confermata", "Ti sei iscritto all'uscita!");
    } finally {
      setJoinSaving(false);
      setIsSavingJoinLeave(false);
      setNoteModalVisible(false);
      setJoinServices(emptySelection());
    }
  };

  const handleSaveParticipation = async () => {
    if (editTarget) return handleUpdateParticipation();
    return handleJoin();
  };

  const handleLeave = async () => {
    if (!eventId || !userId) return;
    if (isSavingJoinLeave) return;
    if (isInactive) return;
    if (isCancelled) {
      Alert.alert("Evento annullato", "Le iscrizioni sono disabilitate.");
      return;
    }
    const displayName = userParticipant?.displayName || "te";
    Alert.alert(
      "Rimuovere partecipante?",
      `Confermi la rimozione di ${displayName} dall’evento?`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Rimuovi",
          style: "destructive",
          onPress: async () => {
            setJoinSaving(true);
            setIsSavingJoinLeave(true);
            try {
              await deleteDoc(doc(db, "social_events", eventId, "participants", userId));
              setJoinServices(emptySelection());
              Alert.alert("Fatto", "Non sei più tra i partecipanti.");
            } catch (err: any) {
              console.error("[social_events] leave failed", err);
              if (err?.code === "permission-denied") {
                Alert.alert("Errore", "Permessi insufficienti.");
              } else {
                Alert.alert("Errore", err?.message ?? "Impossibile annullare iscrizione.");
              }
            } finally {
              setJoinSaving(false);
              setIsSavingJoinLeave(false);
            }
          },
        },
      ]
    );
  };

  const handleAddManual = () => {
    if (!canModifyParticipation) return;
    setManualName("");
    setManualNote("");
    setManualServices(buildSelectionFromServices());
    setManualModalVisible(true);
  };

  const handleConfirmManual = async () => {
    if (!eventId) return;
    if (!canModifyParticipation) return;
    if (!manualName.trim()) {
      Alert.alert("Errore", "Inserisci almeno il nome.");
      return;
    }
    if (extrasEnabled.lunch || extrasEnabled.dinner) {
      const missing = EXTRA_KEYS.filter((key) => extrasEnabled[key] && !manualServices[key]);
      if (missing.length > 0) {
        const labels = missing.map((k) => event?.extraServices?.[k]?.label || SERVICE_LABELS[k]).join(", ");
        Alert.alert("Scelta obbligatoria", `Devi indicare SI o NO per i servizi: ${labels}`);
        return;
      }
    }
    setManualSaving(true);
    try {
      const manualId = `manual_${Date.now()}`;
      await setDoc(doc(db, "social_events", eventId, "participants", manualId), {
        uid: manualId,
        displayName: manualName.trim(),
        note: manualNote.trim() || null,
        services: Object.keys(manualServices).some((key) => manualServices[key as "lunch" | "dinner"])
          ? {
            ...(manualServices.lunch ? { lunch: manualServices.lunch } : {}),
            ...(manualServices.dinner ? { dinner: manualServices.dinner } : {}),
          }
          : null,
        joinedAt: serverTimestamp(),
        source: "manual",
      });
      setManualModalVisible(false);
    } finally {
      setManualSaving(false);
    }
  };

  const handleRemoveParticipant = async (id: string) => {
    if (!eventId || !canEdit) return;
    if (!canModifyParticipation) return;
    const target = participants.find((p) => p.id === id);
    const displayName = target?.displayName || "partecipante";
    Alert.alert(
      "Rimuovere partecipante?",
      `Confermi la rimozione di ${displayName} dall’evento?`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Rimuovi",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "social_events", eventId, "participants", id));
            } catch (err: any) {
              console.error("[social_events] remove participant failed", err);
              if (err?.code === "permission-denied") {
                Alert.alert("Errore", "Permessi insufficienti.");
              } else {
                Alert.alert("Errore", err?.message ?? "Impossibile rimuovere il partecipante.");
              }
            }
          },
        },
      ]
    );
  };

  const handleCancelEvent = async () => {
    if (!eventId || !canEdit) return;
    Alert.alert(
      "Annulla Evento",
      "Sei sicuro di voler ANNULLARE questo evento? I partecipanti saranno avvisati.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sì, Annulla",
          style: "destructive",
          onPress: async () => {
            const uid = auth.currentUser?.uid ?? null;
            await updateDoc(doc(db, "social_events", eventId), {
              status: "cancelled",
              cancelledAt: serverTimestamp(),
              cancelledBy: uid,
              updatedAt: serverTimestamp(),
              updatedBy: uid,
            });
          },
        },
      ]
    );
  };

  const handleRestoreEvent = async () => {
    if (!eventId || !canEdit) return;
    const uid = auth.currentUser?.uid ?? null;
    await updateDoc(doc(db, "social_events", eventId), {
      status: "active",
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
    Alert.alert("Evento Ripristinato");
  };

  const handleArchiveEvent = async () => {
    if (!eventId || !canEdit) return;
    Alert.alert(
      "Archivia Evento",
      "Vuoi davvero archiviare questo evento?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sì, Archivia",
          style: "destructive",
          onPress: async () => {
            const uid = auth.currentUser?.uid ?? null;
            await updateDoc(doc(db, "social_events", eventId), {
              status: "archived",
              updatedAt: serverTimestamp(),
              updatedBy: uid,
            });
          },
        },
      ]
    );
  };

  const handleRestoreArchive = async () => {
    if (!eventId || !canEdit) return;
    Alert.alert(
      "Ripristina Evento",
      "Vuoi ripristinare questo evento?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sì, Ripristina",
          onPress: async () => {
            const uid = auth.currentUser?.uid ?? null;
            await updateDoc(doc(db, "social_events", eventId), {
              status: "active",
              updatedAt: serverTimestamp(),
              updatedBy: uid,
            });
          },
        },
      ]
    );
  };

  const handleDeleteEvent = async () => {
    if (!eventId || !canEdit) return;
    Alert.alert("Elimina Definitive", "Questa azione è irreversibile!", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Elimina",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "social_events", eventId));
            navigation.goBack();
          } catch (e) {
            console.error("[social_events] delete failed", e);
            Alert.alert("Errore", "Impossibile eliminare l'evento. Controlla i permessi.");
          }
        },
      },
    ]);
  };

  const handleShare = async () => {
    try {
      const dateStr = formatDate(event?.startAt);
      const place = event?.meetingPlaceText || "";
      const mapUrl = event?.meetingMapUrl ? `\n🗺️ ${event.meetingMapUrl}` : "";
      const msg = `🎉 Evento BHI: ${event?.title ?? ""}\n📅 ${dateStr}\n📍 ${place}${mapUrl}\n\nPartecipa sull'app!`;
      await Share.share({ message: msg });
    } catch (error) {
      // ignore
    }
  };

  const handleAddToCalendar = async () => {
    try {
      const { status: permissionStatus } = await Calendar.requestCalendarPermissionsAsync();
      if (permissionStatus === "granted") {
        const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
        const defaultCalendar = calendars.find((cal) => cal.isPrimary) || calendars[0];
        if (defaultCalendar) {
          const startDate = event?.startAt?.toDate?.();
          if (!startDate) {
            Alert.alert("Errore", "Data non valida.");
            return;
          }
          const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
          await Calendar.createEventAsync(defaultCalendar.id, {
            title: `🎉 ${event?.title ?? "Evento"}`,
            startDate,
            endDate,
            location: event?.meetingPlaceText || "",
            notes: event?.description || "",
          });
          Alert.alert("Successo", "Evento aggiunto al calendario!");
        } else {
          Alert.alert("Errore", "Nessun calendario trovato.");
        }
      } else {
        Alert.alert("Permesso negato", "Impossibile accedere al calendario.");
      }
    } catch (e) {
      Alert.alert("Errore", "Impossibile aggiungere evento.");
    }
  };

  return (
    <Screen useNativeHeader scroll={false} backgroundColor="#FDFCF8">
      <ScreenHeader
        title={event?.title ?? "Evento"}
        disableUppercase={true}
        titleNumberOfLines={2}
        titleAllowShrink={true}
        titleMinScale={0.7}
        subtitle={
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
            <Ionicons name="calendar-outline" size={14} color="#64748B" style={{ marginRight: 4 }} />
            <Text style={{ fontSize: 14, fontWeight: "500", color: "#64748B" }}>
              {dateLabel} • {timeLabel}
            </Text>
          </View>
        }
        showBack={true}
        rightAction={
          canEdit && eventId ? (
            <TouchableOpacity onPress={() => navigation.navigate("SocialEdit", { mode: "edit", eventId })}>
              <Ionicons name="pencil" size={20} color="#1E293B" />
            </TouchableOpacity>
          ) : null
        }
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={UI.colors.primary} />
        </View>
      ) : !event ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 16, color: "#64748B" }}>Evento non trovato o rimosso.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          <View style={styles.topCard}>
            <View style={styles.banner}>
              <View style={styles.badgesRow}>
                <StatusBadge status={status === "archived" ? "archived" : status === "cancelled" ? "cancelled" : "active"} />
              </View>
            </View>

            <View style={{ padding: 16 }}>
              <View style={styles.infoGrid}>
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={18} color={UI.colors.action} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoText}>{event?.meetingPlaceText ?? "Luogo da definire"}</Text>
                    {!!event?.meetingMapUrl && (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(event.meetingMapUrl as string)}
                        style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}
                      >
                        <Text style={{ color: UI.colors.action, fontWeight: "700", fontSize: 13 }}>Apri mappa</Text>
                        <Ionicons name="open-outline" size={14} color={UI.colors.action} style={{ marginLeft: 2 }} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                {!!event?.organizerName && (
                  <View style={styles.infoRow}>
                    <Ionicons name="person-outline" size={18} color={UI.colors.action} />
                    <Text style={styles.infoText}>
                      Organizzatore: <Text style={{ fontWeight: "600" }}>{event.organizerName}</Text>
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {!!event?.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Descrizione</Text>
              {Platform.OS === "ios" ? (
                <TextInput
                  value={event.description}
                  editable={false}
                  multiline
                  scrollEnabled={false}
                  dataDetectorTypes={["link"]}
                  style={[styles.descriptionText, { padding: 0, color: "#475569" }]}
                />
              ) : (
                <Text style={styles.descriptionText} selectable>
                  {event.description}
                </Text>
              )}
            </View>
          )}

          {(extrasEnabled.lunch || extrasEnabled.dinner) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Riepilogo Servizi</Text>
              <View style={styles.summaryCard}>
                {EXTRA_KEYS.map((key) => {
                  if (!extrasEnabled[key]) return null;
                  const stat = stats[key];
                  const displayLabel = SERVICE_LABELS[key];
                  return (
                    <View key={key} style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{displayLabel}</Text>
                      <View style={styles.summaryBadges}>
                        <View style={[styles.summaryBadge, { backgroundColor: "#dcfce7" }]}>
                          <Text style={[styles.summaryBadgeText, { color: "#166534" }]}>SI: {stat.yes}</Text>
                        </View>
                        <View style={[styles.summaryBadge, { backgroundColor: "#f1f5f9" }]}>
                          <Text style={[styles.summaryBadgeText, { color: "#64748b" }]}>NO: {stat.no}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {userParticipant && (
            <View style={styles.sectionTight}>
              <View style={styles.bookingCard}>
                <View style={styles.bookingHeader}>
                  <Ionicons name="checkmark-circle" size={24} color={UI.colors.action} />
                  <View>
                    <Text style={styles.bookingTitle}>Sei prenotato come:</Text>
                    <Text style={styles.bookingSubtitle}>
                      {userParticipant.displayName} {userParticipant.uid === userId && "(Tu)"}
                    </Text>
                  </View>
                </View>

                <View style={styles.bookingNoteBox}>
                  <Text style={styles.bookingNoteLabel}>NOTA</Text>
                  <Text style={[styles.bookingNoteText, !userParticipant.note && styles.bookingNotePlaceholder]}>
                    {userParticipant.note ? userParticipant.note.trim() : "Nessuna nota"}
                  </Text>

                  {(extrasEnabled.lunch || extrasEnabled.dinner) && (
                    <View style={styles.bookingServices}>
                      {EXTRA_KEYS.filter((k) => extrasEnabled[k]).map((key) => {
                        const val = userParticipant.services?.[key] === "yes" ? "Sì" : "No";
                        const label = event?.extraServices?.[key]?.label || SERVICE_LABELS[key];
                        return (
                          <Text key={key} style={styles.bookingServiceItem}>
                            {label}: {val}
                          </Text>
                        );
                      })}
                    </View>
                  )}
                </View>

                <View style={styles.bookingActions}>
                  {canModifyParticipation && (
                    <Pressable onPress={() => openEditModal(userParticipant)} style={styles.bookingActionBtn}>
                      <Text style={styles.bookingActionText}>Modifica nota e servizi</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={handleLeave}
                    style={[styles.bookingActionBtn, styles.bookingActionDestructive]}
                    disabled={joinSaving || isSavingJoinLeave || !canModifyParticipation}
                  >
                    <Text style={styles.bookingActionDestructiveText}>Non partecipo</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          <View style={styles.section}>
            {status !== "archived" && !userParticipant && (
              <View style={{ marginBottom: 16 }}>
                <Pressable
                  style={[styles.bigButton, { backgroundColor: UI.colors.action }]}
                  onPress={openJoinModal}
                  disabled={joinSaving || isSavingJoinLeave || !canModifyParticipation}
                >
                  {joinSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.bigButtonText}>Partecipa all'evento</Text>}
                </Pressable>
              </View>
            )}

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Partecipanti ({orderedParticipants.length})</Text>
              {canEdit && canModifyParticipation && (
                <Pressable onPress={handleAddManual} style={styles.addManualBtn}>
                  <Ionicons name="add-circle" size={20} color={UI.colors.action} />
                  <Text style={styles.addManualText}>Aggiungi</Text>
                </Pressable>
              )}
            </View>
            {orderedParticipants.length === 0 ? (
              <Text style={styles.emptyText}>Nessun partecipante ancora.</Text>
            ) : (
              orderedParticipants.map((p, idx) => (
                <View
                  key={p.id}
                  style={[styles.participantCard, idx === orderedParticipants.length - 1 && styles.participantCardLast]}
                >
                  <View style={styles.participantRow}>
                    <View style={styles.participantAvatar}>
                      <View style={styles.avatarPlaceholder}>
                        <Ionicons name={p.source === "manual" ? "person-add-outline" : "person"} size={14} color="#64748b" />
                      </View>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.participantName}>
                        {p.displayName} {p.uid === userId && "(Tu)"}
                      </Text>
                      {p.note && (
                        <Text style={[styles.participantSub, { color: "#334155", fontStyle: "italic" }]}>
                          "{p.note}"
                        </Text>
                      )}
                      {p.services && (
                        <View style={{ flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                          {Object.keys(p.services).map((key) => {
                            const val = (p.services as any)[key];
                            if (val !== "yes") return null;
                            const label = SERVICE_LABELS[key as "lunch" | "dinner"] || key;
                            return (
                              <View key={key} style={{ backgroundColor: "#dcfce7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ fontSize: 12, color: "#166534", fontWeight: "700" }}>{label}</Text>
                              </View>
                            );
                          })}
                        </View>
                      )}
                      {p.source === "manual" && !p.note && !p.services && (
                        <Text style={styles.participantSub}>Registrato manualmente</Text>
                      )}
                    </View>
                    <View style={styles.participantActions}>
                      {canEdit && canModifyParticipation && (
                        <Pressable onPress={() => openEditModal(p)} hitSlop={10} style={styles.editIconBtn}>
                          <Ionicons name="pencil" size={18} color={UI.colors.action} />
                        </Pressable>
                      )}
                      {(canEdit || p.uid === userId) && (
                        <Pressable
                          onPress={() => (p.uid === userId ? handleLeave() : handleRemoveParticipant(p.id))}
                          style={{ padding: 4 }}
                          disabled={!canModifyParticipation}
                        >
                          <Ionicons name="close-circle-outline" size={20} color="#ef4444" />
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.actionGrid}>
            <TouchableOpacity style={styles.actionTile} onPress={handleShare}>
              <Ionicons name="share-social-outline" size={22} color={UI.colors.primary} />
              <Text style={styles.actionTileText}>Condividi</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionTile} onPress={handleAddToCalendar}>
              <Ionicons name="calendar-outline" size={22} color={UI.colors.primary} />
              <Text style={styles.actionTileText}>Salva in Calendario</Text>
            </TouchableOpacity>
          </View>

          {canEdit && (
            <View style={styles.adminZone}>
              <Text style={styles.adminTitle}>Gestione Amministratore</Text>
              {status === "cancelled" && (
                <Pressable style={styles.adminRow} onPress={handleRestoreEvent}>
                  <Ionicons name="refresh-circle" size={20} color="#f59e0b" />
                  <Text style={[styles.adminRowText, { color: "#f59e0b" }]}>Riapri Evento</Text>
                </Pressable>
              )}
              {status === "archived" && (
                <Pressable style={styles.adminRow} onPress={handleRestoreArchive}>
                  <Ionicons name="refresh-circle" size={20} color="#f59e0b" />
                  <Text style={[styles.adminRowText, { color: "#f59e0b" }]}>Ripristina Evento</Text>
                </Pressable>
              )}
              {canEdit && (
                <Pressable style={styles.adminRow} onPress={handleDeleteEvent}>
                  <Ionicons name="trash" size={20} color="#991b1b" />
                  <Text style={[styles.adminRowText, { color: "#991b1b" }]}>Elimina Definitivamente</Text>
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      )}

      <Modal
        visible={noteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeNoteModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
          style={styles.modalWrap}
        >
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={[styles.modalCard, { gap: 12 }]}>
              <Text style={styles.modalTitle}>{editTarget ? "Modifica iscrizione" : "Partecipa all'Evento"}</Text>
              <Text style={styles.modalSubtitle}>
                {editTarget ? "Aggiorna nota e servizi extra." : "Vuoi aggiungere una nota per la guida?"}
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Es. Arrivo in ritardo, sono vegano..."
                value={noteText}
                onChangeText={setNoteText}
                multiline
                numberOfLines={3}
              />
              {EXTRA_KEYS.map((key) => {
                if (!extrasEnabled[key]) return null;
                const label = event?.extraServices?.[key]?.label || SERVICE_LABELS[key];
                const isOn = joinServices[key] === "yes";
                return (
                  <View key={key} style={styles.toggleRow}>
                    <Pressable
                      onPress={() => setServiceValue(key, !isOn, setJoinServices)}
                      hitSlop={10}
                      style={styles.toggleLabelPress}
                    >
                      <Text style={styles.toggleLabel}>{label}</Text>
                    </Pressable>
                    <View style={styles.toggleSwitchWrap}>
                      <Switch
                        value={isOn}
                        onValueChange={(nextValue) => setServiceValue(key, nextValue, setJoinServices)}
                        trackColor={{ false: "#CBD5E1", true: UI.colors.action }}
                        ios_backgroundColor="#CBD5E1"
                      />
                    </View>
                  </View>
                );
              })}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={closeNoteModal}
                  style={styles.modalActionSecondary}
                >
                  <Text style={styles.modalActionSecondaryText}>Annulla</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveParticipation}
                  style={styles.modalActionPrimary}
                >
                  <Text style={styles.modalActionPrimaryText}>{editTarget ? "Salva" : "Conferma"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={manualModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setManualModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
          style={styles.modalWrap}
        >
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={[styles.modalCard, { gap: 12 }]}>
              <Text style={styles.modalTitle}>Aggiungi Partecipante</Text>
              <Text style={styles.label}>Nome e Cognome *</Text>
              <TextInput
                style={styles.input}
                placeholder="Nome e cognome"
                value={manualName}
                onChangeText={setManualName}
              />
              <Text style={[styles.label, { marginTop: 12 }]}>Note (Opzionale)</Text>
              <TextInput
                style={styles.input}
                placeholder="Note..."
                value={manualNote}
                onChangeText={setManualNote}
              />
              {EXTRA_KEYS.map((key) => {
                if (!extrasEnabled[key]) return null;
                const label = event?.extraServices?.[key]?.label || SERVICE_LABELS[key];
                const isOn = manualServices[key] === "yes";
                return (
                  <View key={key} style={styles.toggleRow}>
                    <Pressable
                      onPress={() => setServiceValue(key, !isOn, setManualServices)}
                      hitSlop={10}
                      style={styles.toggleLabelPress}
                    >
                      <Text style={styles.toggleLabel}>{label}</Text>
                    </Pressable>
                    <View style={styles.toggleSwitchWrap}>
                      <Switch
                        value={isOn}
                        onValueChange={(nextValue) => setServiceValue(key, nextValue, setManualServices)}
                        trackColor={{ false: "#CBD5E1", true: UI.colors.action }}
                        ios_backgroundColor="#CBD5E1"
                      />
                    </View>
                  </View>
                );
              })}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => {
                    setManualModalVisible(false);
                    setManualName("");
                    setManualNote("");
                  }}
                  style={styles.modalActionSecondary}
                  disabled={manualSaving}
                >
                  <Text style={styles.modalActionSecondaryText}>Annulla</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleConfirmManual}
                  style={styles.modalActionPrimary}
                  disabled={manualSaving}
                >
                  <Text style={styles.modalActionPrimaryText}>Aggiungi</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Top Card
  topCard: {
    margin: 16,
    marginBottom: 20,
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
    overflow: "hidden",
  },
  banner: { paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  topCardContent: { paddingVertical: 24, paddingHorizontal: 22 },
  badgesRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%", paddingHorizontal: 4 },
  title: { fontSize: 24, fontWeight: "800", color: "#0F172A", marginBottom: 16, lineHeight: 30 },
  infoGrid: { gap: 12 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoText: { fontSize: 16, color: "#334155", fontWeight: "500", flex: 1 },

  // Sections
  section: { paddingHorizontal: 20, marginTop: 24 },
  sectionTight: { paddingHorizontal: 20, marginTop: 12 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: "#1E293B" },
  descriptionText: { fontSize: 16, lineHeight: 24, color: "#475569" },
  editLink: { padding: 4 },
  editLinkText: { color: UI.colors.action, fontWeight: "700", fontSize: 13 },
  selfCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#e2e8f0", gap: 10 },
  selfRow: { flexDirection: "row", gap: 10 },
  selfLabel: { fontSize: 14, fontWeight: "700", color: "#475569", width: 120 },
  selfValue: { flex: 1, fontSize: 14, color: "#334155", fontWeight: "500" },
  selfServices: { flex: 1, gap: 4 },

  // Participants
  addManualBtn: { flexDirection: "row", alignItems: "center", gap: 4, padding: 4 },
  addManualText: { color: UI.colors.action, fontWeight: "700", fontSize: 13 },
  participantCard: {
    backgroundColor: UI.colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI.colors.borderMuted,
    padding: 12,
    marginBottom: 8,
    ...UI.shadow.card,
  },
  participantCardLast: {
    marginBottom: 0,
  },
  participantRow: { flexDirection: "row", alignItems: "center" },
  participantAvatar: {},
  avatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#e2e8f0", alignItems: "center", justifyContent: "center" },
  participantName: { fontSize: 15, fontWeight: "600", color: "#334155" },
  participantSub: { fontSize: 12, color: "#94a3b8" },
  emptyText: { color: "#94a3b8", fontStyle: "italic", marginTop: 4 },
  participantActions: { gap: 6, alignItems: "center" },
  editIconBtn: { padding: 4 },

  // Buttons
  bigButton: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
    shadowColor: UI.colors.action,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  bigButtonText: { color: "#ffffff", fontWeight: "800", fontSize: 16 },

  // Action Grid
  actionGrid: { flexDirection: "row", gap: 12, paddingHorizontal: 16, marginTop: 24 },
  actionTile: { flex: 1, height: 92, backgroundColor: "#f8fafc", padding: 16, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "#e2e8f0" },
  actionTileText: { fontWeight: "600", color: "#475569", fontSize: 13, textAlign: "center" },

  // Admin
  adminZone: { marginTop: 40, padding: 20, backgroundColor: "#fef2f2", borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  adminTitle: { fontSize: 14, fontWeight: "800", color: "#991b1b", marginBottom: 16, textTransform: "uppercase" },
  adminRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(153, 27, 27, 0.1)" },
  adminRowText: { fontSize: 15, fontWeight: "700" },

  // Modals
  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 16,
  },
  modalScroll: { flex: 1, width: "100%" },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  modalSubtitle: { fontSize: 15, color: "#64748b", marginBottom: 8 },
  modalInput: { backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, fontSize: 16, color: "#334155", textAlignVertical: "top", minHeight: 80 },
  label: { fontSize: 14, fontWeight: "700", color: "#475569", marginBottom: 6 },
  input: { backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, fontSize: 16, color: "#334155" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 4,
  },
  modalActionSecondary: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#e2e8f0",
  },
  modalActionSecondaryText: { color: "#1f2937", fontWeight: "700" },
  modalActionPrimary: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: UI.colors.primary,
  },
  modalActionPrimaryText: { color: "#fff", fontWeight: "800" },

  // Services
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#f8fafc", padding: 12, borderRadius: 12, marginTop: 10 },
  toggleLabelPress: { flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: "600", color: "#334155" },
  toggleSwitchWrap: { width: 52, alignItems: "flex-end" },

  // Summary
  summaryCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginTop: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  summaryLabel: { fontSize: 15, fontWeight: "600", color: "#334155" },
  summaryBadges: { flexDirection: "row", gap: 8 },
  summaryBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  summaryBadgeText: { fontSize: 12, fontWeight: "700" },

  bookingCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderLeftWidth: 6,
    borderLeftColor: UI.colors.eventSocial,
    padding: 16,
  },
  bookingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  bookingTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  bookingSubtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#334155",
    marginTop: 2,
  },
  bookingNoteBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    marginBottom: 16,
  },
  bookingNoteLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  bookingNoteText: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 20,
    fontStyle: "italic",
  },
  bookingNotePlaceholder: {
    color: "#94A3B8",
  },
  bookingServices: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    gap: 4,
  },
  bookingServiceItem: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "500",
  },
  bookingActions: {
    flexDirection: "row",
    gap: 12,
  },
  bookingActionBtn: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  bookingActionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    textAlign: "center",
  },
  bookingActionDestructive: {
    backgroundColor: "#FEF2F2",
  },
  bookingActionDestructiveText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#DC2626",
    textAlign: "center",
  },
});
