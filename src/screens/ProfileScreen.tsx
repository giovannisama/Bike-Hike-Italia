// src/screens/ProfileScreen.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
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
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { auth, db } from "../firebase";
import { doc, setDoc, serverTimestamp, onSnapshot, deleteField, deleteDoc, getDoc } from "firebase/firestore";
import { updateProfile as fbUpdateProfile, deleteUser } from "firebase/auth";
import { Screen } from "../components/Screen";
import { PrimaryButton } from "../components/Button";
import { CardCropperModal } from "../components/CardCropperModal";
import {
  deviceSupportsBiometrics,
  loadCredsSecurely,
  clearCredsSecurely,
} from "../utils/biometricHelpers";
import { mergeUsersPublic, deleteUsersPublic } from "../utils/usersPublicSync";

const logo = require("../../assets/images/logo.jpg");
const SELF_DELETED_SENTINEL = "__self_deleted__";

type LocalCard = {
  uri: string;
  mimeType?: string | null;
  base64?: string | null;
  width?: number | null;
  height?: number | null;
};

export default function ProfileScreen() {
  const user = auth.currentUser;
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

  useEffect(() => {
    return () => {
      isMounted.current = false;
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
              Alert.alert("Tessera rimossa", "La tessera è stata eliminata dal profilo.");
            } catch (err: any) {
              Alert.alert("Errore rimozione", err?.message ?? "Impossibile rimuovere la tessera.");
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

      Alert.alert("Fatto!", "Profilo aggiornato correttamente.");
    } catch (e: any) {
      Alert.alert("Errore salvataggio", e?.message ?? "Operazione non riuscita.");
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
  const base64ToShow = cardImageLocal?.base64 ?? cardImageRemote;
  const cardUri = base64ToShow ? `data:image/jpeg;base64,${base64ToShow}` : null;

  return (
    <Screen title="Profilo" subtitle="Gestisci i tuoi dati">
      <View style={styles.header}>
        <Image source={logo} style={styles.logo} />
        <View>
          <Text style={styles.title}>Bike & Hike Italia</Text>
          <Text style={styles.subtitle}>Account</Text>
        </View>
      </View>

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

      <View style={styles.cardSection}>
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
          {cardUri ? (
            <Image source={{ uri: cardUri }} style={styles.cardPreview} />
          ) : (
            <View style={styles.cardPlaceholder}>
              <Text style={styles.placeholderText}>Nessuna tessera caricata</Text>
              <Text style={styles.placeholderHint}>Scatta una foto per aggiungerla</Text>
            </View>
          )}
        </Pressable>
        {cardUri && (
          <Text style={styles.cardHint}>Tocca la foto per visualizzarla a tutto schermo.</Text>
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

      <View style={{ marginTop: 24 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.label}>Face ID / Touch ID</Text>
          <Switch value={bioEnabled} onValueChange={onToggleBiometrics} disabled={!bioAvailable} />
        </View>
      </View>
      <PrimaryButton
        label="Salva"
        onPress={handleSave}
        loading={saving}
        disabled={deleting}
        style={{ marginTop: 24, marginBottom: 16 }}
      />
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
      <Text style={styles.deleteAccountHint}>
        Una volta eliminato, dovrai registrarti nuovamente per utilizzare l'app.
      </Text>

      <Modal
        visible={cardModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCardModalVisible(false)}
      >
        <Pressable
          style={styles.cardModalBackdrop}
          onPress={() => setCardModalVisible(false)}
          accessibilityRole="button"
          accessibilityLabel="Chiudi anteprima tessera"
        >
          {cardUri && (
            <Image source={{ uri: cardUri }} style={styles.cardModalImage} resizeMode="contain" />
          )}
        </Pressable>
      </Modal>

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  logo: { width: 64, height: 64, marginRight: 12, borderRadius: 12 },
  title: { fontSize: 20, fontWeight: "700" },
  subtitle: { fontSize: 14, color: "#666" },
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
    height: 180,
    justifyContent: "center",
    alignItems: "center",
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
  cardHint: { marginTop: 8, fontSize: 12, color: "#64748b" },
  helperText: { marginTop: 4, fontSize: 13, color: "#6b7280" },
  helperTextSmall: { marginTop: 6, fontSize: 12, color: "#64748b" },
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
  cardModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  cardModalImage: { width: "100%", height: "80%" },
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
  deleteAccountHint: { marginTop: 8, fontSize: 12, color: "#64748b", textAlign: "center" },
});
