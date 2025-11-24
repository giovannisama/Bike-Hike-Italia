// src/screens/ProfileScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { auth, db } from "../firebase";
import { doc, setDoc, serverTimestamp, onSnapshot, deleteField, deleteDoc, getDoc } from "firebase/firestore";
import { updateProfile as fbUpdateProfile, deleteUser } from "firebase/auth";
import { Screen } from "../components/Screen";
import { PrimaryButton } from "../components/Button";
import { CardCropperModal } from "../components/CardCropperModal";
import { ZoomableImageModal } from "../components/ZoomableImageModal";
import { Ionicons } from "@expo/vector-icons";
import {
  deviceSupportsBiometrics,
  loadCredsSecurely,
  clearCredsSecurely,
} from "../utils/biometricHelpers";
import { mergeUsersPublic, deleteUsersPublic } from "../utils/usersPublicSync";
import { MedicalCertificateSection } from "./profile/MedicalCertificateSection";
import useMedicalCertificate from "../hooks/useMedicalCertificate";
import { getCertificateStatus } from "../utils/medicalCertificate";
import { saveImageToDevice } from "../utils/saveImageToDevice";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

const logo = require("../../assets/images/logo.jpg");
const SELF_DELETED_SENTINEL = "__self_deleted__";

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
  const [hasProfile, setHasProfile] = useState(false);

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
      const ok = await deviceSupportsBiometrics();
      const stored = await loadCredsSecurely();
      setBioAvailable(ok);
      setBioEnabled(!!stored);
    })();
  }, []);
  // TODO: logica Face ID / Touch ID potrebbe diventare hook condiviso (riutilizzabile anche nella LoginScreen).
  const onToggleBiometrics = async (next: boolean) => {
    if (!bioAvailable) {
      Alert.alert("Non supportato", "Questo dispositivo non supporta Face ID / Touch ID.");
      return;
    }
    if (next) {
      const stored = await loadCredsSecurely();
      if (!stored) {
        setBioEnabled(false);
        Alert.alert(
          "Come abilitare",
          "Per usare Face ID/Touch ID: effettua un login con email e password e, quando richiesto, scegli 'Sì' per salvare le credenziali."
        );
        return;
      }
      setBioEnabled(true);
      Alert.alert("Attivato", "Accesso rapido abilitato.");
    } else {
      await clearCredsSecurely();
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
      const displayName = `${cleanLast}${cleanLast && cleanFirst ? ", " : ""}${cleanFirst}`.trim();

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
              await clearCredsSecurely();

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
  const roleDisplay = roleLabel ? roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1) : "Membro";
  const headerContent = (
    <View style={styles.heroHeader}>
      <Image source={logo} style={styles.heroLogo} />
      <View style={styles.heroText}>
        <Text style={styles.heroTitle}>Profilo Utente di</Text>
        <Text style={styles.heroName}>{displayName}</Text>
        <Text style={styles.heroRole}>{roleDisplay}</Text>
      </View>
    </View>
  );

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

  return (
    <Screen headerContent={headerContent}>

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
        <>
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
        </>
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
                <View style={styles.documentBadge}>
                  <Text style={styles.documentBadgeText}>{membershipActive ? "Attivo" : "Non caricato"}</Text>
                </View>
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
                      style={[styles.secondaryButton, { marginRight: 10 }]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.secondaryButtonText}>Scansiona tessera</Text>
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
              <View
                style={[
                  styles.documentBadge,
                  certificateStatus.kind === "warning"
                    ? styles.documentBadgeWarning
                    : certificateStatus.kind === "expired"
                    ? styles.documentBadgeDanger
                    : styles.documentBadgeSuccess,
                ]}
              >
                <Text style={styles.documentBadgeText}>{certificateBadgeText}</Text>
              </View>
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
              <Text style={[styles.label, styles.securityLabel]}>Face ID / Touch ID</Text>
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
            <Text style={styles.helperTextSmall}>
              {bioAvailable
                ? bioEnabled
                  ? "Accederai più velocemente usando le credenziali salvate sul dispositivo."
                  : "Salva le credenziali durante il prossimo login per attivare l'accesso rapido."
                : "Il dispositivo non supporta Face ID / Touch ID."}
            </Text>
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
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, styles.securityLabel]}>Notifiche</Text>
                <Text style={styles.helperTextSmall}>
                  Gestisci le notifiche push per le nuove uscite.
                </Text>
              </View>
              <Ionicons name="notifications-outline" size={22} color="#0B3D2E" />
            </Pressable>
          </View>

          <View style={styles.securityPanel}>
            <Text style={styles.label}>Cancellazione account</Text>
            <Text style={styles.helperTextSmall}>
              Una volta eliminato, dovrai registrarti nuovamente per utilizzare l'app.
            </Text>
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
          style={{ marginTop: 24, marginBottom: 16 }}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  heroLogo: { width: 60, height: 60, borderRadius: 16 },
  heroText: { flex: 1 },
  heroTitle: { fontSize: 16, fontWeight: "700", color: "#fff", letterSpacing: 0.4 },
  heroName: { fontSize: 22, fontWeight: "900", color: "#fff", marginTop: 2 },
  heroRole: { fontSize: 16, fontWeight: "700", color: "#F7B32B", marginTop: 2 },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#E5F3EB",
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
    backgroundColor: "#0B3D2E",
  },
  tabButtonText: { color: "#0B3D2E", fontWeight: "600" },
  tabButtonTextActive: { color: "#fff" },
  label: { marginTop: 12, fontWeight: "600", color: "#374151" },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    backgroundColor: "#fff",
  },
  cardSection: { marginTop: 24 },
  cardPreviewWrapper: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
  },
  documentInlineCard: {
    marginTop: 8,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
  },
  documentHighlightActive: {
    borderWidth: 2,
    shadowColor: "#0B3D2E",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  membershipHighlight: {
    backgroundColor: "#DBEAFE",
    borderColor: "#93C5FD",
  },
  certificateHighlight: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
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
  documentBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#0B3D2E",
    alignItems: "center",
  },
  documentBadgeText: { color: "#fff", fontWeight: "700", textAlign: "center" },
  documentBadgeSuccess: { backgroundColor: "#16a34a" },
  documentBadgeWarning: { backgroundColor: "#f59e0b" },
  documentBadgeDanger: { backgroundColor: "#dc2626" },
  cardActions: {
    flexDirection: "row",
    marginTop: 12,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#0B3D2E",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  secondaryStandalone: {
    marginTop: 12,
    width: "100%",
    flex: undefined,
    alignSelf: "stretch",
  },
  secondaryButtonText: { color: "#0B3D2E", fontWeight: "700" },
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
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#fff",
  },
  securityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  securityRowPressed: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
  },
  securityLabel: {
    flex: 1,
    marginTop: 0,
    paddingRight: 12,
  },
  securitySwitchWrapper: {
    flexShrink: 0,
    paddingLeft: 12,
    paddingRight: 4,
    alignItems: "flex-end",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: Platform.select({ ios: -20, android: 0 }), // alza leggermente lo switch della build iOS per allinearlo al testo
    ...Platform.select({
      ios: { minWidth: 68 },
      default: { minWidth: 60 },
    }),
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
