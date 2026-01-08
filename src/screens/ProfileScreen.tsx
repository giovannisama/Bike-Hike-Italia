// src/screens/ProfileScreen.tsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Platform,
  Alert,
  Image,
  Switch,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { auth, db } from "../firebase";
import { doc, setDoc, serverTimestamp, onSnapshot, deleteField, deleteDoc, getDoc } from "firebase/firestore";
import { updateProfile as fbUpdateProfile, deleteUser } from "firebase/auth";
import { Screen, UI } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { DocumentStatusBadge } from "../components/DocumentStatusBadge";
import { RoleBadge } from "../components/RoleBadge";
import { PrimaryButton } from "../components/Button";
import { CardCropperModal } from "../components/CardCropperModal";
import { ZoomableImageModal } from "../components/ZoomableImageModal";
import { Ionicons } from "@expo/vector-icons";
import {
  deviceSupportsBiometrics,
  clearCredentials,
  getBiometricEnabled,
  hasSavedCredentials,
  setBiometricEnabled,
} from "../utils/biometricHelpers";
import { mergeUsersPublic, deleteUsersPublic } from "../utils/usersPublicSync";
import { MedicalCertificateSection } from "./profile/MedicalCertificateSection";
import useMedicalCertificate from "../hooks/useMedicalCertificate";
import { getCertificateStatus } from "../utils/medicalCertificate";
import { saveImageToDevice } from "../utils/saveImageToDevice";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

const SELF_DELETED_SENTINEL = "__self_deleted__";
const CARD_BORDER = "#e5e7eb";
const CARD_BORDER_SOFT = "rgba(241, 245, 249, 1)";
const DEFAULT_PHONE_PREFIX = "39";
const PHONE_PREFIXES: Array<{ label: string; value: string }> = [
  { label: "Italia (+39)", value: "39" },
  { label: "Francia (+33)", value: "33" },
  { label: "Germania (+49)", value: "49" },
  { label: "Svizzera (+41)", value: "41" },
  { label: "Regno Unito (+44)", value: "44" },
  { label: "Spagna (+34)", value: "34" },
  { label: "USA (+1)", value: "1" },
];

const normalizePhoneDigits = (value: string) => value.replace(/\s+/g, "");

const parsePhoneNumberE164 = (raw?: string | null) => {
  if (!raw || typeof raw !== "string") {
    return { prefix: DEFAULT_PHONE_PREFIX, local: "", matched: true };
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith("+")) {
    return { prefix: DEFAULT_PHONE_PREFIX, local: normalizePhoneDigits(trimmed), matched: false };
  }
  const digits = normalizePhoneDigits(trimmed.slice(1));
  if (!digits) {
    return { prefix: DEFAULT_PHONE_PREFIX, local: "", matched: false };
  }
  const prefixValues = [...PHONE_PREFIXES.map((p) => p.value)].sort((a, b) => b.length - a.length);
  const matchedPrefix = prefixValues.find((code) => digits.startsWith(code));
  if (matchedPrefix) {
    return { prefix: matchedPrefix, local: digits.slice(matchedPrefix.length), matched: true };
  }
  return { prefix: DEFAULT_PHONE_PREFIX, local: digits, matched: false };
};

type LocalCard = {
  uri: string;
  mimeType?: string | null;
  base64?: string | null;
  width?: number | null;
  height?: number | null;
};

const PROFILE_TABS: { key: "personal" | "documents" | "security"; label: string }[] = [
  { key: "personal", label: "Dati Personali" },
  { key: "documents", label: "Documenti" },
  { key: "security", label: "Sicurezza" },
];

export default function ProfileScreen() {
  const user = auth.currentUser;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isMounted = useRef(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [phonePrefix, setPhonePrefix] = useState(DEFAULT_PHONE_PREFIX);
  const [phoneLocal, setPhoneLocal] = useState("");
  const [iosPhonePickerVisible, setIosPhonePickerVisible] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const phoneOriginalRef = useRef<string | null>(null);
  const phoneUnmatchedRef = useRef(false);
  const phoneInitialPrefixRef = useRef(DEFAULT_PHONE_PREFIX);
  const phoneInitialLocalRef = useRef("");

  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [cardImageRemote, setCardImageRemote] = useState<string | null>(null);
  const [cardImageLocal, setCardImageLocal] = useState<LocalCard | null>(null);
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [cropSource, setCropSource] = useState<LocalCard | null>(null);
  const [removingCard, setRemovingCard] = useState(false);
  const [cardPreviewLoading, setCardPreviewLoading] = useState(false);
  const [exportingCard, setExportingCard] = useState(false);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<"personal" | "documents" | "security">("personal");
  const [expandedDocument, setExpandedDocument] = useState<"membership" | "certificate" | null>(null);
  const [roleLabel, setRoleLabel] = useState<string | null>(null);
  const medicalCertificateHook = useMedicalCertificate();
  const certificateStatus = useMemo(
    () => getCertificateStatus(medicalCertificateHook.certificate),
    [medicalCertificateHook.certificate]
  );
  const certificateBadgeText = useMemo(() => {
    if (certificateStatus.kind === "missing") return "Non caricato";
    if (certificateStatus.kind === "valid") return "Attivo";
    if (certificateStatus.kind === "warning") {
      const days = Math.max(0, certificateStatus.daysRemaining ?? 0);
      const label = days === 1 ? "1 giorno" : `${days} giorni`;
      return `In Scadenza:\n${label}`;
    }
    if (certificateStatus.kind === "expired") {
      const days = Math.abs(certificateStatus.daysRemaining ?? 0);
      const label = days === 1 ? "1 giorno" : `${days} giorni`;
      return `Scaduto da:\n${label}`;
    }
    return "Attivo";
  }, [certificateStatus]);

  const base64ToShow = cardImageLocal?.base64 ?? cardImageRemote;
  const cardUri = base64ToShow ? `data:image/jpeg;base64,${base64ToShow}` : null;
  const membershipActive = !!cardUri;
  const phonePrefixLabel =
    PHONE_PREFIXES.find((item) => item.value === phonePrefix)?.label ?? `+${phonePrefix}`;

  const showToast = useCallback((message: string, tone: "success" | "error") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, tone });
    setToastVisible(true);
    toastTimer.current = setTimeout(() => {
      setToastVisible(false);
      setToast(null);
    }, 3200);
  }, []);

  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      setHasProfile(snap.exists());
      const data = snap.data() || {};
      setFirstName(data.firstName || "");
      setLastName(data.lastName || "");
      setNickname(data.nickname || "");
      setRoleLabel(typeof data.role === "string" ? data.role : null);
      const phoneRaw = typeof data.phoneNumber === "string" ? data.phoneNumber : "";
      const parsedPhone = parsePhoneNumberE164(phoneRaw);
      phoneOriginalRef.current = phoneRaw || null;
      phoneUnmatchedRef.current = !parsedPhone.matched;
      phoneInitialPrefixRef.current = parsedPhone.prefix;
      phoneInitialLocalRef.current = parsedPhone.local;
      setPhonePrefix(parsedPhone.prefix);
      setPhoneLocal(parsedPhone.local);

      if (data.membershipCard && typeof data.membershipCard === "object") {
        const base64 = data.membershipCard.base64;
        setCardImageRemote(typeof base64 === "string" ? base64 : null);
      } else if (typeof data.membershipCard === "string") {
        setCardImageRemote(data.membershipCard);
      } else {
        setCardImageRemote(null);
      }
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    (async () => {
      const [ok, enabled, stored] = await Promise.all([
        deviceSupportsBiometrics(),
        getBiometricEnabled(),
        hasSavedCredentials(),
      ]);
      setBioAvailable(ok);
      setBioEnabled(ok && enabled && stored);
    })();
  }, []);
  // TODO: logica Face ID / Touch ID potrebbe diventare hook condiviso (riutilizzabile anche nella LoginScreen).
  const onToggleBiometrics = async (next: boolean) => {
    const ready = await deviceSupportsBiometrics();
    if (!ready) {
      setBioAvailable(false);
      setBioEnabled(false);
      Alert.alert("Non supportato", "Questo dispositivo non supporta Face ID / Touch ID.");
      return;
    }
    setBioAvailable(true);
    if (next) {
      const stored = await hasSavedCredentials();
      if (!stored) {
        setBioEnabled(false);
        Alert.alert(
          "Come abilitare",
          "Per usare Face ID/Touch ID: effettua un login con email e password e, quando richiesto, scegli 'Sì' per salvare le credenziali."
        );
        return;
      }
      await setBiometricEnabled(true);
      setBioEnabled(true);
      Alert.alert("Attivato", "Accesso rapido abilitato.");
    } else {
      await clearCredentials();
      setBioEnabled(false);
      Alert.alert("Disattivato", "Accesso rapido disabilitato.");
    }
  };

  const handleExportCard = useCallback(async () => {
    if (!cardUri && !cardImageLocal?.uri && !cardImageLocal?.base64 && !cardImageRemote) {
      Alert.alert("Nessuna tessera", "Carica o scansiona una tessera prima di salvarla sul dispositivo.");
      return;
    }

    try {
      setExportingCard(true);
      await saveImageToDevice({
        base64: cardImageLocal?.base64 ?? cardImageRemote,
        uri: cardUri ?? cardImageLocal?.uri ?? null,
        mimeType: cardImageLocal?.mimeType ?? "image/jpeg",
        suggestedFileName: "tessera-associato",
      });
      showToast("Tessera salvata sul dispositivo.", "success");
    } catch (err: any) {
      const message = err?.message ?? "Impossibile salvare la tessera sul dispositivo.";
      showToast(message, "error");
    } finally {
      setExportingCard(false);
    }
  }, [cardImageLocal?.base64, cardImageLocal?.mimeType, cardImageLocal?.uri, cardImageRemote, cardUri, showToast]);

  const ensureCameraPermission = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permesso necessario",
        "Per scansionare la tessera devi consentire l'accesso alla fotocamera."
      );
      return false;
    }
    return true;
  };

  const ensureLibraryPermission = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permesso necessario",
        "Per selezionare una foto devi consentire l'accesso alla libreria immagini."
      );
      return false;
    }
    return true;
  };

  const normalizeForCrop = useCallback(async (uri: string) => {
    try {
      const normalized = await ImageManipulator.manipulateAsync(
        uri,
        [{ rotate: 0 }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      return {
        uri: normalized.uri,
        width: normalized.width,
        height: normalized.height,
      };
    } catch (e) {
      console.warn("normalizeForCrop", e);
      return { uri, width: null, height: null };
    }
  }, []);

  const handleCaptureCard = async () => {
    const allowed = await ensureCameraPermission();
    if (!allowed) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
      exif: false,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      const normalized = await normalizeForCrop(asset.uri);
      setCropSource({
        uri: normalized.uri,
        mimeType: asset.mimeType,
        width: normalized.width ?? asset.width ?? null,
        height: normalized.height ?? asset.height ?? null,
      });
    }
  };

  const handlePickCard = async () => {
    const allowed = await ensureLibraryPermission();
    if (!allowed) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
      exif: false,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      const normalized = await normalizeForCrop(asset.uri);
      setCropSource({
        uri: normalized.uri,
        mimeType: asset.mimeType,
        width: normalized.width ?? asset.width ?? null,
        height: normalized.height ?? asset.height ?? null,
      });
    }
  };

  const handleRemoveCard = () => {
    const hasLocal = !!cardImageLocal;
    const hasRemote = !!cardImageRemote;
    if (!hasLocal && !hasRemote) return;

    if (hasLocal) {
      Alert.alert(
        "Scartare la nuova tessera?",
        "La foto selezionata ma non ancora salvata verrà rimossa.",
        [
          { text: "Annulla", style: "cancel" },
          {
            text: "Scarta",
            style: "destructive",
            onPress: () => {
              setCardModalVisible(false);
              setCardImageLocal(null);
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      "Rimuovere la tessera salvata?",
      "La tessera salvata sul tuo profilo sarà eliminata.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Rimuovi",
          style: "destructive",
          onPress: async () => {
            if (!user?.uid) {
              Alert.alert("Non sei loggato", "Effettua il login per gestire la tessera.");
              return;
            }
            try {
              setRemovingCard(true);
              setCardModalVisible(false);
              await setDoc(
                doc(db, "users", user.uid),
                { membershipCard: deleteField() },
                { merge: true }
              );
              setCardImageRemote(null);
              showToast("Tessera rimossa dal profilo.", "success");
            } catch (err: any) {
              showToast(
                err?.message ?? "Impossibile rimuovere la tessera in questo momento.",
                "error"
              );
            } finally {
              setRemovingCard(false);
            }
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    if (saving) return;

    try {
      if (!user) {
        Alert.alert("Non sei loggato", "Effettua il login per salvare il profilo.");
        return;
      }
      setSaving(true);
      const uid = user.uid;
      const email = user.email || "";
      const cleanFirst = firstName.trim();
      const cleanLast = lastName.trim();
      const cleanNick = nickname.trim();
      const rawPhone = phoneLocal.trim();
      const normalizedPhone = normalizePhoneDigits(rawPhone);
      const displayName = `${cleanLast}${cleanLast && cleanFirst ? ", " : ""}${cleanFirst}`.trim();
      let phoneNumberToSave: string | null = null;

      if (rawPhone) {
        if (rawPhone.startsWith("00") || rawPhone.startsWith("+")) {
          showToast("Inserisci il numero senza prefisso internazionale (+ o 00).", "error");
          setSaving(false);
          return;
        }
        if (!/^[0-9 ]+$/.test(rawPhone)) {
          showToast("Il numero può contenere solo cifre e spazi.", "error");
          setSaving(false);
          return;
        }
        if (!/^[0-9]+$/.test(normalizedPhone)) {
          showToast("Numero di telefono non valido.", "error");
          setSaving(false);
          return;
        }
        if (normalizedPhone.length < 6 || normalizedPhone.length > 15) {
          showToast("Numero di telefono non valido.", "error");
          setSaving(false);
          return;
        }
        const composed = `+${phonePrefix}${normalizedPhone}`;
        if (composed.length < 8 || composed.length > 16) {
          showToast("Numero di telefono non valido.", "error");
          setSaving(false);
          return;
        }
        if (
          phoneUnmatchedRef.current &&
          phoneOriginalRef.current &&
          phonePrefix === phoneInitialPrefixRef.current &&
          normalizedPhone === phoneInitialLocalRef.current
        ) {
          phoneNumberToSave = phoneOriginalRef.current;
        } else {
          phoneNumberToSave = composed;
        }
      }

      if (!hasProfile) {
        // CREATE: rispetta validUserCreateSelf (uid/email/role/approved/createdAt)
        await setDoc(
          doc(db, "users", uid),
          {
            uid,
            email,
            displayName,
            firstName: cleanFirst || null,
            lastName: cleanLast || null,
            nickname: cleanNick || null,
            phoneNumber: phoneNumberToSave,
            role: "member",
            approved: false,
            disabled: false,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        // UPDATE: rispetta validUserUpdateSelf (solo questi campi)
        await setDoc(
          doc(db, "users", uid),
          {
            displayName,
            firstName: cleanFirst || null,
            lastName: cleanLast || null,
            nickname: cleanNick || null,
            phoneNumber: phoneNumberToSave,
          },
          { merge: true }
        );
      }

      // PUBBLICO: aggiorna l'indice (mergeUsersPublic ignora permission-denied lato client)
      const publicRef = doc(db, "users_public", uid);
      const publicSnap = await getDoc(publicRef);
      const publicPayload: Record<string, unknown> = {
        displayName: displayName || null,
        firstName: cleanFirst || null,
        lastName: cleanLast || null,
        nickname: cleanNick || null,
      };
      if (!publicSnap.exists()) {
        publicPayload.createdAt = serverTimestamp();
      }
      await mergeUsersPublic(uid, publicPayload, "ProfileScreen.saveProfile");

      await fbUpdateProfile(user, { displayName });

      if (cardImageLocal?.base64) {
        await setDoc(
          doc(db, "users", uid),
          {
            membershipCard: {
              base64: cardImageLocal.base64,
              updatedAt: serverTimestamp(),
            },
          },
          { merge: true }
        );
        setCardImageRemote(cardImageLocal.base64);
        setCardImageLocal(null);
      }

      showToast("Profilo aggiornato correttamente.", "success");
    } catch (e: any) {
      showToast(e?.message ?? "Operazione non riuscita.", "error");
    } finally {
      setSaving(false);
    }
  };
  const handleDeleteAccount = () => {
    if (!user?.uid) {
      Alert.alert("Non sei loggato", "Effettua il login per gestire l'account.");
      return;
    }
    Alert.alert(
      "Eliminare l'account?",
      "Questa operazione eliminerà definitivamente il tuo profilo e non potrà essere annullata.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina",
          style: "destructive",
          onPress: async () => {
            try {
              setDeleting(true);
              const uid = user.uid;
              const userRef = doc(db, "users", uid);

              try {
                await deleteDoc(userRef);
              } catch (fireErr: any) {
                if (fireErr?.code === "permission-denied") {
                  const fullCleanup = {
                    displayName: SELF_DELETED_SENTINEL,
                    firstName: null,
                    lastName: null,
                    nickname: null,
                    membershipCard: deleteField(),
                    approved: false,
                    disabled: true,
                    selfDeleted: true,
                    selfDeletedAt: serverTimestamp(),
                  } as const;

                  try {
                    await setDoc(userRef, fullCleanup, { merge: true });
                  } catch (fallbackErr: any) {
                    if (fallbackErr?.code === "permission-denied") {
                      try {
                        await setDoc(
                          userRef,
                          {
                            displayName: SELF_DELETED_SENTINEL,
                            firstName: null,
                            lastName: null,
                            nickname: null,
                            membershipCard: deleteField(),
                          },
                          { merge: true }
                        );
                      } catch (innerErr: any) {
                        if (innerErr?.code !== "permission-denied") {
                          throw innerErr;
                        }
                      }
                    } else {
                      throw fallbackErr;
                    }
                  }
                } else if (fireErr?.code !== "not-found") {
                  throw fireErr;
                }
              }

              const publicDeleted = await deleteUsersPublic(uid, "ProfileScreen.deleteAccount");
              if (!publicDeleted) {
                await mergeUsersPublic(
                  uid,
                  {
                    displayName: SELF_DELETED_SENTINEL,
                    firstName: null,
                    lastName: null,
                    nickname: null,
                    email: user.email ?? null,
                    disabled: true,
                    approved: false,
                    selfDeleted: true,
                    selfDeletedAt: serverTimestamp(),
                  },
                  "ProfileScreen.deleteAccountFallback"
                );
              }
              await clearCredentials();

              try {
                await deleteUser(user);
              } catch (authErr: any) {
                if (authErr?.code === "auth/requires-recent-login") {
                  Alert.alert(
                    "Conferma richiesta",
                    "Per motivi di sicurezza effettua di nuovo l'accesso e riprova a cancellare l'account."
                  );
                  return;
                }
                throw authErr;
              }

              Alert.alert(
                "Account eliminato",
                "Il tuo account è stato cancellato. Tornerai alla schermata di login."
              );
            } catch (err: any) {
              Alert.alert(
                "Errore eliminazione",
                err?.message ?? "Impossibile eliminare l'account in questo momento."
              );
            } finally {
              if (isMounted.current) {
                setDeleting(false);
              }
            }
          },
        },
      ]
    );
  };
  const displayName =
    [lastName, firstName].filter(Boolean).join(lastName && firstName ? ", " : "") ||
    user?.displayName ||
    "Utente";
  const roleKey = (roleLabel || "member").toLowerCase();
  const roleDisplay = roleLabel ? roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1) : "Membro";

  useEffect(() => {
    if (!cardUri) {
      setCardPreviewLoading(false);
      return;
    }
    setCardPreviewLoading(true);
    const fallback = setTimeout(() => {
      setCardPreviewLoading(false);
    }, 2000);
    return () => clearTimeout(fallback);
  }, [cardUri]);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  return (
    <Screen useNativeHeader scroll={false} backgroundColor="#FDFCF8">
      <ScreenHeader
        title="PROFILO"
        subtitle="Gestione account"
        showBack={false}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: UI.spacing.lg,
            paddingTop: UI.spacing.lg,
            paddingBottom: 100
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.profileSummaryCard}>
            <View style={styles.profileSummaryRow}>
              <Text style={styles.profileSummaryName}>{displayName}</Text>
              <RoleBadge role={(["owner", "admin"].includes(roleKey) ? roleKey : "member") as "owner" | "admin" | "member"} />
            </View>
          </View>

          {/* TODO: tab bar + contenuti potrebbero essere estratti in sottocomponenti per le tre sezioni (personal/documents/security). */}
          <View style={styles.tabBar}>
            {PROFILE_TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={[styles.tabButton, active && styles.tabButtonActive]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {activeTab === "personal" && (
            <View style={styles.formCard}>
              <Text style={styles.label}>Nome</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Mario"
              />

              <Text style={styles.label}>Cognome</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Rossi"
              />

              <Text style={styles.label}>Nickname</Text>
              <TextInput
                style={styles.input}
                value={nickname}
                onChangeText={setNickname}
                placeholder="SuperBiker"
              />

              <Text style={styles.label}>Numero di telefono</Text>
              <View style={styles.phoneRow}>
                <View style={styles.phonePrefix}>
                  {Platform.OS === "ios" ? (
                    <Pressable
                      style={styles.phonePrefixPressable}
                      onPress={() => setIosPhonePickerVisible(true)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.phonePrefixText} numberOfLines={1} ellipsizeMode="tail">
                        {phonePrefixLabel}
                      </Text>
                    </Pressable>
                  ) : (
                    <Picker
                      selectedValue={phonePrefix}
                      onValueChange={(value) => setPhonePrefix(String(value))}
                      style={[styles.phonePicker, styles.phonePickerAndroid]}
                      mode="dropdown"
                    >
                      {PHONE_PREFIXES.map((item) => (
                        <Picker.Item key={item.value} label={item.label} value={item.value} />
                      ))}
                    </Picker>
                  )}
                </View>
                <TextInput
                  style={[styles.input, styles.phoneInput]}
                  value={phoneLocal}
                  onChangeText={setPhoneLocal}
                  placeholder="333 123 4567"
                  keyboardType="phone-pad"
                  autoCorrect={false}
                />
              </View>
              {Platform.OS === "ios" && (
                <Modal
                  transparent
                  visible={iosPhonePickerVisible}
                  animationType="fade"
                  onRequestClose={() => setIosPhonePickerVisible(false)}
                >
                  <View style={styles.phonePickerModal}>
                    <Pressable style={styles.phonePickerBackdrop} onPress={() => setIosPhonePickerVisible(false)} />
                    <View style={styles.phonePickerSheet}>
                      <View style={styles.phonePickerHeader}>
                        <Text style={styles.phonePickerTitle}>Prefisso</Text>
                        <Pressable onPress={() => setIosPhonePickerVisible(false)}>
                          <Text style={styles.phonePickerButtonText}>Chiudi</Text>
                        </Pressable>
                      </View>
                      <Picker
                        selectedValue={phonePrefix}
                        onValueChange={(value) => setPhonePrefix(String(value))}
                        style={styles.phonePickerWheel}
                        itemStyle={styles.phonePickerItem}
                      >
                        {PHONE_PREFIXES.map((item) => (
                          <Picker.Item key={item.value} label={item.label} value={item.value} />
                        ))}
                      </Picker>
                    </View>
                  </View>
                </Modal>
              )}
            </View>
          )}

          {activeTab === "documents" && (
            <>
              {/* TODO: sezione documenti (tessera + certificato) potrebbe essere suddivisa in componenti dedicati. */}
              <View style={styles.documentHighlightStack}>
                <View>
                  <Pressable
                    onPress={() =>
                      setExpandedDocument((prev) => (prev === "membership" ? null : "membership"))
                    }
                    style={[
                      styles.documentHighlightCard,
                      styles.membershipHighlight,
                      expandedDocument === "membership" && styles.documentHighlightActive,
                    ]}
                    accessibilityRole="button"
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.documentHighlightTitle}>Tessera Associato</Text>
                      <Text style={styles.documentHighlightSubtitle}>
                        Visualizza e aggiorna la tessera associativa digitale.
                      </Text>
                    </View>
                    <DocumentStatusBadge
                      status={membershipActive ? "valid" : "missing"}
                      label={membershipActive ? "Attivo" : "Non caricato"}
                    />
                  </Pressable>

                  {expandedDocument === "membership" && (
                    <View style={styles.documentInlineCard}>
                      <Text style={styles.label}>Tessera associato</Text>
                      <Text style={styles.helperText}>
                        Centra la tessera e poi utilizza l’editor per ritagliarla con precisione lungo i bordi.
                      </Text>
                      <Pressable
                        style={styles.cardPreviewWrapper}
                        onPress={() => {
                          if (cardUri) setCardModalVisible(true);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Anteprima tessera associato"
                      >
                        <View style={styles.cardPreviewInner}>
                          {cardUri ? (
                            <>
                              <Image
                                source={{ uri: cardUri }}
                                style={styles.cardPreview}
                                onLoad={() => setCardPreviewLoading(false)}
                                onLoadEnd={() => setCardPreviewLoading(false)}
                                onError={() => setCardPreviewLoading(false)}
                              />
                              {cardPreviewLoading && (
                                <View style={styles.cardLoadingOverlay}>
                                  <ActivityIndicator size="small" color="#0B3D2E" />
                                  <Text style={styles.cardLoadingText}>Caricamento tessera…</Text>
                                </View>
                              )}
                            </>
                          ) : (
                            <View style={styles.cardPlaceholder}>
                              <Text style={styles.placeholderText}>Nessuna tessera caricata</Text>
                              <Text style={styles.placeholderHint}>Scatta una foto per aggiungerla</Text>
                            </View>
                          )}
                        </View>
                      </Pressable>
                      {cardUri && (
                        <Text style={styles.cardHint}>Tocca la foto per visualizzarla a tutto schermo.</Text>
                      )}
                      {cardUri && (
                        <Pressable
                          onPress={handleExportCard}
                          style={[styles.secondaryButton, styles.secondaryStandalone, (saving || exportingCard) && { opacity: 0.6 }]}
                          accessibilityRole="button"
                          disabled={saving || exportingCard}
                        >
                          {exportingCard ? (
                            <ActivityIndicator size="small" color="#0B3D2E" />
                          ) : (
                            <Text style={styles.secondaryButtonText}>Salva sul dispositivo</Text>
                          )}
                        </Pressable>
                      )}
                      {cardImageLocal && (
                        <Text style={styles.helperTextSmall}>Nuova tessera pronta: ricordati di premere "Salva".</Text>
                      )}
                      <View style={styles.cardActions}>
                        <Pressable
                          onPress={handleCaptureCard}
                          style={[styles.primaryButton, { marginRight: 10 }]}
                          accessibilityRole="button"
                        >
                          <Text style={styles.primaryButtonText}>Scansiona tessera</Text>
                        </Pressable>
                        <Pressable
                          onPress={handlePickCard}
                          style={[styles.secondaryButton, { marginLeft: 10 }]}
                          accessibilityRole="button"
                        >
                          <Text style={styles.secondaryButtonText}>Carica da galleria</Text>
                        </Pressable>
                      </View>
                      {cardUri && (
                        <Pressable
                          onPress={handleRemoveCard}
                          style={[
                            styles.removeButton,
                            (saving || removingCard) && { opacity: 0.6 },
                          ]}
                          disabled={saving || removingCard}
                          accessibilityRole="button"
                        >
                          <Text style={styles.removeButtonText}>
                            {removingCard
                              ? "Rimozione in corso..."
                              : cardImageLocal
                                ? "Scarta nuova tessera"
                                : "Rimuovi tessera"}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
                <Pressable
                  onPress={() =>
                    setExpandedDocument((prev) => (prev === "certificate" ? null : "certificate"))
                  }
                  style={[
                    styles.documentHighlightCard,
                    styles.certificateHighlight,
                    expandedDocument === "certificate" && styles.documentHighlightActive,
                  ]}
                  accessibilityRole="button"
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.documentHighlightTitle}>Certificato Medico</Text>
                    <Text style={styles.documentHighlightSubtitle}>
                      Carica, gestisci e tieni sotto controllo il certificato medico.
                    </Text>
                  </View>
                  <DocumentStatusBadge
                    status={certificateStatus.kind as "missing" | "valid" | "warning" | "expired"}
                    label={certificateBadgeText}
                  />
                </Pressable>
              </View>

              {expandedDocument === "certificate" && (
                <View style={styles.documentInlineCard}>
                  <MedicalCertificateSection showToast={showToast} hookProps={medicalCertificateHook} />
                </View>
              )}
            </>
          )}

          {activeTab === "security" && (
            <View style={styles.securityCard}>
              <View style={styles.securityPanel}>
                <Pressable
                  style={({ pressed }) => [styles.securityRow, pressed && styles.securityRowPressed]}
                  onPress={() => onToggleBiometrics(!bioEnabled)}
                  disabled={!bioAvailable}
                  accessibilityRole="button"
                  accessibilityLabel="Abilita accesso rapido con Face ID o Touch ID"
                  hitSlop={{ top: 6, bottom: 6 }}
                >
                  <View style={styles.securityRowText}>
                    <Text style={[styles.label, styles.securityLabel]}>Face ID / Touch ID</Text>
                    <Text style={styles.securityHelper}>
                      {bioAvailable
                        ? bioEnabled
                          ? "Accederai più velocemente usando le credenziali salvate sul dispositivo."
                          : "Salva le credenziali durante il prossimo login per attivare l'accesso rapido."
                        : "Il dispositivo non supporta Face ID / Touch ID."}
                    </Text>
                  </View>
                  <View style={styles.securitySwitchWrapper}>
                    <Switch
                      value={bioEnabled}
                      onValueChange={onToggleBiometrics}
                      disabled={!bioAvailable}
                      accessibilityRole="switch"
                      accessibilityLabel="Abilita accesso rapido con Face ID o Touch ID"
                    />
                  </View>
                </Pressable>
              </View>

              <View style={styles.securityPanel}>
                <Pressable
                  onPress={() => navigation.navigate("NotificationSettings")}
                  style={({ pressed }) => [
                    styles.securityRow,
                    pressed && styles.securityRowPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Apri le impostazioni delle notifiche"
                >
                  <View style={styles.securityRowText}>
                    <Text style={[styles.label, styles.securityLabel]}>Notifiche</Text>
                    <Text style={styles.securityHelper}>
                      Gestisci le notifiche push per le nuove uscite.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
                </Pressable>
              </View>

              <View style={[styles.securityPanel, styles.securityPanelWarning]}>
                <View style={styles.securityRowText}>
                  <Text style={styles.label}>Cancellazione account</Text>
                  <Text style={styles.securityHelper}>
                    Una volta eliminato, dovrai registrarti nuovamente per utilizzare l'app.
                  </Text>
                </View>
                <Pressable
                  onPress={handleDeleteAccount}
                  style={[
                    styles.deleteAccountButton,
                    (saving || deleting) && { opacity: 0.6 },
                  ]}
                  disabled={saving || deleting}
                  accessibilityRole="button"
                >
                  <Text style={styles.deleteAccountText}>
                    {deleting ? "Eliminazione in corso..." : "Elimina account"}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {(activeTab === "personal" || activeTab === "documents") && (
            <PrimaryButton
              label="Salva"
              onPress={handleSave}
              loading={saving}
              disabled={deleting}
              style={{
                marginTop: 24,
                marginBottom: 16,
                backgroundColor: saving || deleting ? undefined : UI.colors.action,
                borderColor: saving || deleting ? undefined : UI.colors.action,
              }}
            />
          )}

          <ZoomableImageModal
            visible={cardModalVisible}
            uri={cardUri}
            onClose={() => setCardModalVisible(false)}
          />

          <CardCropperModal
            visible={!!cropSource}
            imageUri={cropSource?.uri}
            imageWidth={cropSource?.width ?? undefined}
            imageHeight={cropSource?.height ?? undefined}
            onCancel={() => setCropSource(null)}
            onConfirm={(result) => {
              if (result?.uri) {
                setCardImageLocal({
                  uri: result.uri,
                  mimeType: cropSource?.mimeType ?? "image/jpeg",
                  base64: result.base64 ?? null,
                  width: result.width ?? null,
                  height: result.height ?? null,
                });
              }
              setCropSource(null);
            }}
          />
          {toastVisible && toast && (
            <View
              pointerEvents="none"
              style={[
                styles.toastBase,
                toast.tone === "error" ? styles.toastError : styles.toastSuccess,
              ]}
              accessibilityLiveRegion="polite"
            >
              <Text style={styles.toastText}>{toast.message}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileSummaryCard: {
    marginTop: 6,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: UI.colors.card,
    borderWidth: 1,
    borderColor: UI.colors.card,
    ...UI.shadow.card,
  },
  profileSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  profileSummaryName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: UI.colors.card,
    borderRadius: 999,
    padding: 4,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: UI.colors.action,
  },
  tabButtonText: { color: UI.colors.muted, fontWeight: "600" },
  tabButtonTextActive: { color: "#fff" },
  label: { marginTop: 12, fontWeight: "600", color: "#374151" },
  input: {
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    backgroundColor: "#fff",
  },
  phoneRow: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: UI.spacing.sm,
    width: "100%",
  },
  phonePrefix: {
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 10,
    backgroundColor: UI.colors.card,
    width: "100%",
  },
  phonePrefixPressable: {
    height: Platform.select({ ios: 44, android: 48 }),
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  phonePrefixText: {
    color: UI.colors.text,
    fontWeight: "600",
  },
  phonePicker: {
    width: "100%",
    height: Platform.select({ ios: 44, android: 52 }),
  },
  phonePickerAndroid: {
    height: 52,
    paddingVertical: 0,
    paddingHorizontal: 8,
  },
  phoneInput: {
    width: "100%",
  },
  phonePickerBackdrop: {
    flex: 1,
    backgroundColor: UI.colors.borderMuted,
    opacity: 0.6,
  },
  phonePickerModal: {
    flex: 1,
    justifyContent: "flex-end",
  },
  phonePickerSheet: {
    backgroundColor: UI.colors.card,
    paddingTop: 12,
    paddingBottom: Platform.select({ ios: 18, android: 12 }),
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: UI.colors.borderMuted,
  },
  phonePickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  phonePickerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: UI.colors.text,
  },
  phonePickerButtonText: {
    color: UI.colors.action,
    fontWeight: "700",
  },
  phonePickerWheel: {
    width: "100%",
    height: 200,
  },
  phonePickerItem: {
    fontSize: 16,
    color: UI.colors.text,
  },
  formCard: {
    backgroundColor: UI.colors.card,
    borderRadius: UI.radius.xl,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: UI.spacing.lg,
    gap: UI.spacing.sm,
    ...UI.shadow.card,
  },
  cardSection: { marginTop: 24 },
  cardPreviewWrapper: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER_SOFT,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#f8fafc",
    height: 140,
  },
  cardPreviewInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  cardPreview: { width: "100%", height: "100%", resizeMode: "contain" },
  cardPlaceholder: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  placeholderText: { fontWeight: "600", color: "#475569" },
  placeholderHint: { fontSize: 12, color: "#94a3b8", marginTop: 4, textAlign: "center" },
  cardLoadingOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(248,250,252,0.88)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 8,
  },
  cardLoadingText: { fontSize: 12, fontWeight: "600", color: "#0B3D2E" },
  cardHint: { marginTop: 8, fontSize: 12, color: "#64748b" },
  helperText: { marginTop: 4, fontSize: 13, color: "#6b7280" },
  helperTextSmall: { marginTop: 6, fontSize: 12, color: "#64748b" },
  documentHighlightStack: {
    gap: 12,
    marginBottom: 12,
  },
  documentHighlightCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    backgroundColor: "#fff",
    borderColor: CARD_BORDER_SOFT,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  documentInlineCard: {
    marginTop: 8,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER_SOFT,
    backgroundColor: "#fff",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  documentHighlightActive: {
    borderWidth: 2,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  membershipHighlight: {
    backgroundColor: "#fff",
    borderColor: CARD_BORDER_SOFT,
  },
  certificateHighlight: {
    backgroundColor: "#fff",
    borderColor: CARD_BORDER_SOFT,
  },
  documentHighlightTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0B3D2E",
  },
  documentHighlightSubtitle: {
    marginTop: 4,
    color: "#475569",
    fontSize: 13,
  },
  cardActions: {
    flexDirection: "row",
    marginTop: 12,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: UI.colors.action,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  primaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: UI.colors.action,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.colors.action,
  },
  primaryButtonText: { color: "#fff", fontWeight: "700" },
  secondaryStandalone: {
    marginTop: 12,
    width: "100%",
    flex: undefined,
    alignSelf: "stretch",
  },
  secondaryButtonText: { color: UI.colors.action, fontWeight: "700" },
  removeButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  removeButtonText: { color: "#dc2626", fontWeight: "700" },
  deleteAccountButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#b91c1c",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  deleteAccountText: { color: "#b91c1c", fontWeight: "700" },
  securityCard: {
    gap: 16,
    marginTop: 12,
  },
  securityPanel: {
    backgroundColor: UI.colors.card,
    borderRadius: UI.radius.xl,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: UI.spacing.lg,
    ...UI.shadow.card,
  },
  securityPanelWarning: {
    backgroundColor: UI.colors.warningBg,
    borderColor: UI.colors.warningBorder,
  },
  securityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: UI.spacing.sm,
    borderRadius: UI.radius.md,
  },
  securityRowPressed: {
    backgroundColor: "#F8FAFC",
    borderRadius: UI.radius.md,
  },
  securityRowText: {
    flex: 1,
    paddingRight: UI.spacing.md,
  },
  securityHelper: {
    marginTop: 4,
    fontSize: 12,
    color: UI.colors.muted,
  },
  securityLabel: {
    flex: 1,
    marginTop: 0,
    paddingRight: 12,
  },
  securitySwitchWrapper: {
    flexShrink: 0,
    minWidth: 68,
    marginTop: -2,
    paddingRight: 4,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingLeft: UI.spacing.md,
  },
  toastBase: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 30,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  toastSuccess: {
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#4ade80",
  },
  toastError: {
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#f87171",
  },
  toastText: { textAlign: "center", fontWeight: "700", color: "#1f2937" },
});
