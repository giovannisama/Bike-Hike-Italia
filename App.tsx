// App.tsx
// -------------------------------------------------------------
// Flusso completo con Login/Signup + App privata + Face ID/Touch ID.
// - Se NON loggato: stack Auth (Login, Registrati).
// - Se loggato: stack principale (Home, Uscite, Profilo...).
// - Il profilo users/{uid} si crea in Signup o da Profilo se manca.
// - Login rapido con biometria: memorizza credenziali cifrate (previo consenso).
// - In Home: pulsante "Crea Uscita" solo per Admin.
// - In Home: conteggio uscite attive nel tab "Uscite" (non archiviate e non annullate).
// -------------------------------------------------------------

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  ScrollView,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from "@react-navigation/native";
import {
  createNativeStackNavigator,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import * as Notifications from "expo-notifications";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import {
  onAuthStateChanged,
  User,
  signOut,
  updateProfile as fbUpdateProfile,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  collection,
} from "firebase/firestore";
import { auth, db } from "./src/firebase";
import { registerPushToken } from "./src/notifications/registerPushToken";

// 🔐 Face ID / Touch ID
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

// Hook profilo centralizzato
import useCurrentProfile from "./src/hooks/useCurrentProfile";

// Schermate dell'app
import UsciteList from "./src/screens/UsciteList";
import CreateRideScreen from "./src/screens/CreateRideScreen";
import RideDetails from "./src/screens/RideDetails";
import ProfileScreen from "./src/screens/ProfileScreen";
import CalendarScreen from "./src/screens/CalendarScreen";
import AdminScreen from "./src/screens/AdminScreen";
import UserListScreen from "./src/screens/admin/UserListScreen";
import UserDetailScreen from "./src/screens/admin/UserDetailScreen";

// Wrapper: protegge la sezione Amministrazione (solo admin/owner)
function AdminGate() {
  const { isAdmin, loading } = useCurrentProfile();

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12 }}>Verifica permessi...</Text>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "800", marginBottom: 8 }}>Accesso negato</Text>
        <Text style={{ textAlign: "center", color: "#475569" }}>
          Questa sezione è riservata agli amministratori.
        </Text>
      </SafeAreaView>
    );
  }

  return <AdminScreen />;
}

// ---- ROUTES ----
export type RootStackParamList = {
  // Auth
  Login: undefined;
  Signup: undefined;

  // App
  Home: undefined;
  Amministrazione: undefined;
  UserList: undefined;
  UserDetail: { uid: string };
  UsciteList: undefined;
  Calendar: undefined;
  CreateRide: undefined;
  Create: undefined; // alias compatibilità
  RideDetails: { rideId: string; title?: string };
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
// Navigation ref per navigare dal tap su notifica
export const navRef = createNavigationContainerRef<RootStackParamList>();

// ---- COLORI ----
const COLOR_PRIMARY = "#1D4ED8";
const COLOR_SECONDARY = "#16A34A";
const COLOR_TEXT = "#0f172a";
const COLOR_MUTED = "#64748b";

// ---- UI THEME (riusabile ovunque) ----
const UI = {
  colors: {
    primary: COLOR_PRIMARY,
    secondary: COLOR_SECONDARY,
    text: "#0f172a",
    muted: "#64748b",
    bg: "#ffffff",
    card: "#ffffff",
    tint: "#ECFEFF",
    danger: "#DC2626",
    warningBg: "#FFF7ED",
    warningBorder: "#FED7AA",
  },
  spacing: { xs: 6, sm: 10, md: 16, lg: 20, xl: 24 },
  radius: { sm: 10, md: 14, lg: 18, xl: 24, round: 999 },
  shadow: {
    card: {
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    hero: {
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
  },
  text: {
    h1Light: { fontSize: 22, fontWeight: "900", color: "#fff" } as const,
    h2Light: { fontSize: 16, fontWeight: "600", color: "#F0F9FF" } as const,
  },
};

// Spaziatore verticale
const VSpace = ({ size = "md" as keyof typeof UI.spacing }) => (
  <View style={{ height: UI.spacing[size] }} />
);
// ---- LOGO ----
const logo = require("./assets/images/logo.jpg");

// ---- TIPO profilo (per typing nella signup) ----
type UserProfile = {
  uid?: string;
  email?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  role?: "admin" | "member";
  approved?: boolean;
  createdAt?: any; // Firestore timestamp
};

// ---- Biometric helpers (locali a App) ----
const BIOMETRIC_EMAIL_KEY = "bh_email";
const BIOMETRIC_PASS_KEY = "bh_pass";

async function deviceSupportsBiometrics() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}
async function saveCredsSecurely(email: string, password: string) {
  await SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, email, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
  await SecureStore.setItemAsync(BIOMETRIC_PASS_KEY, password, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}
async function loadCredsSecurely() {
  const email = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
  const pass = await SecureStore.getItemAsync(BIOMETRIC_PASS_KEY);
  if (email && pass) return { email, password: pass };
  return null;
}
async function clearCredsSecurely() {
  await SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_PASS_KEY);
}

// ------------------------------------------------------------------
// LOGIN (email/password) + reset + Face ID/Touch ID
// ------------------------------------------------------------------
function LoginScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, "Login">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [bioReady, setBioReady] = useState(false);

  useEffect(() => {
    (async () => {
      const ok = await deviceSupportsBiometrics();
      const stored = await loadCredsSecurely();
      setBioReady(ok && !!stored);
    })();
  }, []);

  const doLogin = async () => {
    if (!email || !password) {
      Alert.alert("Attenzione", "Inserisci email e password.");
      return;
    }
    try {
      setBusy(true);
      await signInWithEmailAndPassword(auth, email.trim(), password);

      const ok = await deviceSupportsBiometrics();
      if (ok) {
        Alert.alert(
          "Accesso rapido",
          "Vuoi abilitare l'accesso con Face ID/Touch ID?",
          [
            { text: "No" },
            {
              text: "Sì",
              onPress: async () => {
                try {
                  await saveCredsSecurely(email.trim(), password);
                  setBioReady(true);
                } catch {}
              },
            },
          ]
        );
      }
    } catch (e: any) {
      Alert.alert("Errore login", e?.message ?? "Impossibile effettuare il login");
    } finally {
      setBusy(false);
    }
  };

  const loginWithBiometrics = async () => {
    try {
      const saved = await loadCredsSecurely();
      if (!saved) {
        Alert.alert(
          "Non disponibile",
          "Nessuna credenziale salvata. Accedi una volta con email e password e abilita Face ID."
        );
        setBioReady(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Accedi con Face ID/Touch ID",
        cancelLabel: "Annulla",
        disableDeviceFallback: false,
      });
      if (!result.success) return;

      await signInWithEmailAndPassword(auth, saved.email, saved.password);
    } catch (e: any) {
      Alert.alert("Errore Face ID", e?.message ?? "Impossibile usare l'accesso rapido.");
    }
  };

  const disableBiometrics = async () => {
    await clearCredsSecurely();
    setBioReady(false);
    Alert.alert("Disattivato", "Accesso rapido disabilitato.");
  };

  const doResetPassword = async () => {
    const mail = email.trim();
    if (!mail) {
      Alert.alert("Email mancante", "Inserisci la tua email e riprova.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, mail);
      Alert.alert("Email inviata", "Controlla la casella di posta per reimpostare la password.");
    } catch (e: any) {
      Alert.alert("Errore", e?.message ?? "Impossibile inviare l'email di reset.");
    }
  };

  return (
    <SafeAreaView style={styles.authContainer}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <Image source={logo} style={styles.authLogo} />
          <Text style={styles.authTitle}>Accedi</Text>

          <Text style={styles.inputLabel}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="nome@esempio.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Pressable onPress={doResetPassword} style={{ marginTop: 8, alignItems: "flex-start" }}>
            <Text style={{ color: COLOR_PRIMARY, fontWeight: "600" }}>Password dimenticata?</Text>
          </Pressable>

          <Pressable onPress={doLogin} style={[styles.btnPrimary, { marginTop: 16 }]}>
            <Text style={styles.btnPrimaryText}>{busy ? "Accesso..." : "Accedi"}</Text>
          </Pressable>

          {bioReady && (
            <>
              <Pressable onPress={loginWithBiometrics} style={[styles.btnSecondary, { marginTop: 12 }]}>
                <Text style={styles.btnSecondaryText}>Accedi con Face ID / Touch ID</Text>
              </Pressable>
              <Pressable onPress={disableBiometrics} style={{ marginTop: 8, alignItems: "center" }}>
                <Text style={{ color: "#64748b" }}>Disattiva accesso rapido</Text>
              </Pressable>
            </>
          )}

          <Pressable
            onPress={() => navigation.replace("Signup")}
            style={[styles.btnSecondary, { marginTop: 12 }]}
          >
            <Text style={styles.btnSecondaryText}>Registrati</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ------------------------------------------------------------------
// REGISTRAZIONE (crea users/{uid} + users_public/{uid})
// ------------------------------------------------------------------
function SignupScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, "Signup">) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const doSignup = async () => {
    if (!firstName.trim()) return Alert.alert("Campo mancante", "Inserisci il Nome.");
    if (!lastName.trim()) return Alert.alert("Campo mancante", "Inserisci il Cognome.");
    if (!email.trim()) return Alert.alert("Campo mancante", "Inserisci l'Email.");
    if (!password) return Alert.alert("Campo mancante", "Inserisci la Password.");

    try {
      setBusy(true);
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);

      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      await fbUpdateProfile(cred.user, { displayName: fullName });

      // profilo PRIVATO (users/{uid})
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        email: cred.user.email || "",
        displayName: fullName || (cred.user.email ? cred.user.email.split("@")[0] : ""),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nickname: nickname.trim() || "",
        role: "member",
        approved: false,
        createdAt: serverTimestamp(),
      } as UserProfile);

      // profilo PUBBLICO (users_public/{uid}) — solo campi non sensibili
      await setDoc(doc(db, "users_public", cred.user.uid), {
        displayName:
          fullName || (cred.user.email ? cred.user.email.split("@")[0] : ""),
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        nickname: nickname.trim() || null,
        createdAt: serverTimestamp(),
      });

      Alert.alert("Registrazione completata", "Account creato. Puoi accedere.");
    } catch (e: any) {
      Alert.alert("Errore registrazione", e?.message ?? "Impossibile creare l'account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.authContainer}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <Image source={logo} style={styles.authLogo} />
          <Text style={styles.authTitle}>Registrati</Text>

          <Text style={styles.inputLabel}>Nome *</Text>
          <TextInput style={styles.input} placeholder="Mario" value={firstName} onChangeText={setFirstName} />

          <Text style={styles.inputLabel}>Cognome *</Text>
          <TextInput style={styles.input} placeholder="Rossi" value={lastName} onChangeText={setLastName} />

          <Text style={styles.inputLabel}>Nickname (facoltativo)</Text>
          <TextInput style={styles.input} placeholder="SuperBiker" value={nickname} onChangeText={setNickname} />

          <Text style={styles.inputLabel}>Email *</Text>
          <TextInput
            style={styles.input}
            placeholder="nome@esempio.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.inputLabel}>Password *</Text>
          <TextInput
            style={styles.input}
            placeholder="Minimo 6 caratteri"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Pressable onPress={doSignup} style={[styles.btnPrimary, { marginTop: 16 }]}>
            <Text style={styles.btnPrimaryText}>{busy ? "Creazione account..." : "Crea account"}</Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.replace("Login")}
            style={[styles.btnSecondary, { marginTop: 12 }]}
          >
            <Text style={styles.btnSecondaryText}>Hai già un account? Accedi</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// -------------------------------------------------------------------------------------
// Hook: conta solo archived == false e status !== 'cancelled' (senza indice composito)
// -------------------------------------------------------------------------------------
function useActiveRidesCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "rides"),
      (snap) => {
        let c = 0;
        snap.forEach((docSnap) => {
          const d = docSnap.data() as any;
          const archived = d?.archived === true; // manca -> false
          const status = (d?.status ?? "active") as string;
          if (!archived && status !== "cancelled") c += 1; // attive = non archiviate e non annullate
        });
        setCount(c);
      },
      () => setCount(null)
    );
    return () => unsub();
  }, []);

  return count;
}

// ------------------------------------------------------------------
// Home: HERO + Menu (+ CTA Admin "Crea Uscita") + Contatore uscite attive
// ------------------------------------------------------------------
type HomeProps = NativeStackScreenProps<RootStackParamList, "Home">;
// ---- COMPONENTE: Screen (template grafico globale) ----
function Screen({
  title,
  subtitle,
  headerRight,
  children,
  scroll = true,
}: {
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
}) {
  const Content = () => (
    <View style={{ flex: 1, backgroundColor: UI.colors.bg }}>
      {/* Header */}
      <LinearGradient
        colors={[UI.colors.primary, UI.colors.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: UI.spacing.lg, paddingTop: UI.spacing.lg, paddingBottom: UI.spacing.lg + 4 }}
      >
        <SafeAreaView edges={["top"]}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1, paddingRight: UI.spacing.sm }}>
              {!!title && <Text style={UI.text.h1Light}>{title}</Text>}
              {!!subtitle && <Text style={[UI.text.h2Light, { marginTop: 4 }]}>{subtitle}</Text>}
            </View>
            {!!headerRight && <View style={{ marginLeft: UI.spacing.sm }}>{headerRight}</View>}
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Corpo con angoli arrotondati */}
      <View
        style={{
          flex: 1,
          marginTop: -UI.radius.xl,
          backgroundColor: UI.colors.bg,
          borderTopLeftRadius: UI.radius.xl,
          borderTopRightRadius: UI.radius.xl,
          padding: UI.spacing.lg,
        }}
      >
        {children}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: UI.colors.primary }}>
      <StatusBar barStyle="light-content" />
      {scroll ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <Content />
        </ScrollView>
      ) : (
        <Content />
      )}
    </View>
  );
}

// ---- COMPONENTE: Tile (card/menu standard) ----
function Tile({
  title,
  subtitle,
  icon,
  onPress,
  badgeCount,
  danger = false,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onPress: () => void;
  badgeCount?: number | null;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: "100%",
          backgroundColor: UI.colors.card,
          borderRadius: UI.radius.lg,
          padding: UI.spacing.md,
          flexDirection: "row",
          alignItems: "center",
          gap: UI.spacing.sm,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        UI.shadow.card,
      ]}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: UI.radius.md,
          backgroundColor: UI.colors.tint,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: danger ? UI.colors.danger : UI.colors.text }}>
            {title}
          </Text>
          {typeof badgeCount === "number" && (
            <View
              style={{
                minWidth: 22,
                height: 22,
                paddingHorizontal: 6,
                borderRadius: 11,
                backgroundColor: UI.colors.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12, lineHeight: 12 }}>
                {badgeCount}
              </Text>
            </View>
          )}
        </View>
        {!!subtitle && <Text style={{ marginTop: 2, color: UI.colors.muted }}>{subtitle}</Text>}
      </View>

      <Ionicons name="chevron-forward" size={22} />
    </Pressable>
  );
}

function HomeScreen({ navigation }: HomeProps) {
  const user = auth.currentUser;
  const { profile, isAdmin, loading } = useCurrentProfile();
  const activeCount = useActiveRidesCount();

  const firstName = (profile?.firstName ?? "").trim();
  const lastName = (profile?.lastName ?? "").trim();
  const nickname = (profile?.nickname ?? "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  const fallbackDisplay =
    user?.displayName?.trim() ||
    (user?.email ? user.email.split("@")[0] : "") ||
    "Ciclista";

  const saluto = fullName || fallbackDisplay;
  const nickPart = nickname ? ` (${nickname})` : "";
  const headerSubtitle = loading ? "Caricamento profilo..." : `Ciao, ${saluto}${nickPart}`;


  return (
    <Screen
      title="Bike & Hike Italia"
      subtitle={headerSubtitle}
      headerRight={
        isAdmin ? (
          <View
            style={{
              backgroundColor: "#FDE68A",
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: UI.radius.round,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "800", color: "#92400E" }}>ADMIN</Text>
          </View>
        ) : undefined
      }
    >
      {/* Hero compatto (logo + icona) */}
      <View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            gap: UI.spacing.md,
            backgroundColor: UI.colors.card,
            padding: UI.spacing.md,
            borderRadius: UI.radius.xl,
          },
          UI.shadow.hero,
        ]}
      >
        <Image
          source={logo}
          style={{
            width: 72,
            height: 72,
            borderRadius: UI.radius.md,
            resizeMode: "contain",
            backgroundColor: "#fff",
          }}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "900", color: "#0f172a" }}>Benvenuto!</Text>
          <Text style={{ marginTop: 4, color: "#475569" }}>Pronto per la prossima uscita?</Text>
        </View>
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: UI.radius.round,
            padding: 10,
            ...UI.shadow.card,
          }}
        >
          <MaterialCommunityIcons name="bike-fast" size={28} color={UI.colors.primary} />
        </View>
      </View>

      <VSpace size="lg" />

      {/* Suggerimento profilo incompleto */}
      {!loading && !(firstName || lastName || nickname) && (
        <Pressable
          onPress={() => navigation.navigate("Profile")}
          style={({ pressed }) => [
            {
              padding: 12,
              borderRadius: UI.radius.md,
              backgroundColor: UI.colors.warningBg,
              borderWidth: 1,
              borderColor: UI.colors.warningBorder,
              opacity: pressed ? 0.95 : 1,
            },
          ]}
        >
          <Text style={{ fontWeight: "700", color: "#7C2D12" }}>Completa il tuo profilo</Text>
          <Text style={{ color: "#7C2D12", marginTop: 4 }}>
            Aggiungi Nome, Cognome e (opzionale) Nickname per personalizzare il saluto.
          </Text>
        </Pressable>
      )}

      <VSpace size="md" />

      {/* GRID MENU */}
      <View style={{ gap: UI.spacing.sm }}>
        <Tile
          title="Uscite"
          subtitle={isAdmin ? "Crea, gestisci e partecipa" : "Elenco uscite e prenotazioni"}
          badgeCount={activeCount ?? undefined}
          onPress={() => navigation.navigate("UsciteList")}
          icon={<Ionicons name="calendar-outline" size={28} color={UI.colors.primary} />}
        />

        {isAdmin && (
          <Tile
            title="Crea nuova uscita"
            subtitle="Solo per amministratori"
            onPress={() => navigation.navigate("CreateRide")}
            icon={<Ionicons name="add-circle-outline" size={28} color={UI.colors.primary} />}
          />
        )}

        {isAdmin && (
          <Tile
            title="Amministrazione"
            subtitle="Gestisci utenti e permessi"
            onPress={() => navigation.navigate("Amministrazione")}
            icon={<Ionicons name="shield-checkmark-outline" size={28} color={UI.colors.primary} />}
          />
        )}

        <Tile
          title="Calendario"
          subtitle="Visualizza uscite per giorno"
          onPress={() => navigation.navigate("Calendar")}
          icon={<Ionicons name="calendar" size={28} color={UI.colors.primary} />}
        />

        <Tile
          title="Profilo"
          subtitle="Gestisci i tuoi dati"
          onPress={() => navigation.navigate("Profile")}
          icon={<Ionicons name="person-circle-outline" size={28} color={UI.colors.primary} />}
        />

        <Tile
          title="Esci"
          subtitle="Chiudi la sessione"
          onPress={() => signOut(auth)}
          icon={<Ionicons name="exit-outline" size={28} color={UI.colors.danger} />}
          danger
        />
      </View>

      <VSpace size="xl" />
    </Screen>
  );
}

// ------------------------------------------------------------------
// APP ROOT: decide quale stack mostrare (Auth vs App)
// ------------------------------------------------------------------
// Schermata di attesa approvazione/disabilitazione (blocca l'app)
function AttesaApprovazioneScreen() {
  return (
    <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Text style={{ fontSize: 20, fontWeight: "900", marginBottom: 8 }}>Account in attesa</Text>
      <Text style={{ textAlign: "center", color: "#475569" }}>
        Il tuo account è in attesa di approvazione oppure è stato disattivato da un amministratore.
        Potrai accedere all'app appena verrai abilitato.
      </Text>
      <Pressable onPress={() => signOut(auth)} style={[{ marginTop: 16 }, styles.btnSecondary]}>
        <Text style={styles.btnSecondaryText}>Esci</Text>
      </Pressable>
    </SafeAreaView>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const { profile, loading: profileLoading } = useCurrentProfile();

  const approvedOk =
    !!profile &&
    (((profile as any).approved === true) ||
      ((profile as any).approved === "true") ||
      ((profile as any).approved === 1));

  const disabledOn =
    !!profile &&
    (((profile as any).disabled === true) ||
      ((profile as any).disabled === "true") ||
      ((profile as any).disabled === 1));

  // 1) Ascolta lo stato di autenticazione
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      const isAnonymous = !!(firebaseUser as any)?.isAnonymous;
      const hasNoProviders = (firebaseUser?.providerData?.length ?? 0) === 0;
      const isNotPasswordProvider =
        !!firebaseUser && firebaseUser.providerData?.[0]?.providerId !== "password";
      const missingEmail = !firebaseUser?.email;

      if (
        firebaseUser &&
        (isAnonymous || hasNoProviders || isNotPasswordProvider || missingEmail)
      ) {
        try {
          await signOut(auth);
        } catch {}
        setUser(null);
        return;
      }

      setUser(firebaseUser ?? null);
    });

    return () => unsub();
  }, []);

  // 2) Registra/aggiorna il token push quando l'utente è autenticato
  useEffect(() => {
    if (user) {
      registerPushToken();
    }
  }, [user]);

  // 3) Tap su notifica → apri Dettagli Uscita
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      try {
        const data: any = response.notification.request.content.data;
        if (data?.type === "ride_created" && data?.rideId && navRef.isReady()) {
          navRef.navigate("RideDetails", { rideId: data.rideId });
        }
      } catch {
        // ignora
      }
    });
    return () => sub.remove();
  }, []);

  // 4) Schermata di caricamento mentre verifichiamo auth o profilo
  if (user === undefined || (user && profileLoading)) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12 }}>Verifica accesso...</Text>
      </SafeAreaView>
    );
  }

  // 5) Navigator
  return (
    <NavigationContainer theme={AppTheme} ref={navRef}>
      {user === null ? (
        // ---------- STACK AUTH ----------
        <Stack.Navigator screenOptions={{ headerTitleAlign: "center" }}>
          <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Accedi" }} />
          <Stack.Screen name="Signup" component={SignupScreen} options={{ title: "Registrati" }} />
        </Stack.Navigator>
      ) : (
        // ---------- BLOCCO SE NON APPROVATO/DISABILITATO ----------
        (profile && (!approvedOk || disabledOn)) ? (
          <Stack.Navigator screenOptions={{ headerTitleAlign: "center" }}>
            <Stack.Screen
              name="Attesa"
              component={AttesaApprovazioneScreen}
              options={{ title: "In attesa", headerShown: false }}
            />
          </Stack.Navigator>
        ) : (
          // ---------- STACK APP ----------
          <Stack.Navigator
            screenOptions={{ headerShadowVisible: false, headerTitleAlign: "center" }}
          >
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: "Home", headerTransparent: true, headerTintColor: "#fff" }}
            />
            <Stack.Screen
              name="Amministrazione"
              component={AdminGate}
              options={{ title: "Amministrazione" }}
            />
            <Stack.Screen name="UserList" component={UserListScreen} options={{ title: "Gestione Utenti" }} />
            <Stack.Screen name="UserDetail" component={UserDetailScreen} options={{ title: "Dettagli Utente" }} />
            <Stack.Screen name="UsciteList" component={UsciteList} options={{ title: "Uscite" }} />
            <Stack.Screen
              name="Calendar"
              component={CalendarScreen}
              options={{ title: "Calendario" }}
            />
            <Stack.Screen
              name="CreateRide"
              component={CreateRideScreen}
              options={{ title: "Crea Uscita" }}
            />
            <Stack.Screen
              name="Create"
              component={CreateRideScreen}
              options={{ title: "Crea Uscita" }}
            />
            <Stack.Screen
              name="RideDetails"
              component={RideDetails}
              options={({ route }) => ({ title: route.params?.title || "Dettagli Uscita" })}
            />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Profilo" }} />
          </Stack.Navigator>
        )
      )}
    </NavigationContainer>
  );
}

// ---- TEMA ----
const AppTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: "#ffffff" },
};

// ---- STILI ----
const styles = StyleSheet.create({
  gradient: { flex: 1 },
  homeContainer: { paddingHorizontal: 18, paddingTop: 12 },

  // HERO
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: COLOR_PRIMARY,
    padding: 20,
    borderRadius: 24,
    marginTop: 20,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  heroLogo: {
    width: 72,
    height: 72,
    borderRadius: 16,
    resizeMode: "contain",
    backgroundColor: "#fff",
  },
  heroTitle: { fontSize: 22, fontWeight: "900", color: "#fff" },
  heroSubtitle: { fontSize: 16, fontWeight: "600", color: "#F0F9FF", marginTop: 4 },
  heroBadge: {
    marginLeft: "auto",
    backgroundColor: "#fff",
    borderRadius: 999,
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },

  // Callout profilo incompleto
  profileCallout: {
    marginHorizontal: 18,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  profileCalloutTitle: { fontWeight: "700", color: "#7C2D12" },
  profileCalloutText: { color: "#7C2D12", marginTop: 4 },

  // Cards
  grid: { gap: 12, marginTop: 4 },
  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#ECFEFF",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: COLOR_TEXT },
  cardSubtitle: { marginTop: 2, color: COLOR_MUTED },

  // Schermate AUTH
  authContainer: { flex: 1, backgroundColor: "#f9fafb" },
  authScroll: {
    padding: 20,
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 60,
  },
  authLogo: {
    width: 120,
    height: 120,
    resizeMode: "contain",
    alignSelf: "center",
    marginBottom: 16,
  },
  authTitle: { fontSize: 24, fontWeight: "800", marginBottom: 20, textAlign: "center" },
  btnPrimary: {
    backgroundColor: COLOR_PRIMARY,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "800" },
  btnSecondary: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnSecondaryText: { color: COLOR_TEXT, fontWeight: "700" },

  // Loading e profilo
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },

  // Input
  inputGroup: { marginTop: 12, paddingHorizontal: 4 },
  inputLabel: { marginBottom: 6, fontWeight: "600", color: "#374151" },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    backgroundColor: "#fff",
  },

  // Riga titolo + badge tondo
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badgeCount: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: COLOR_PRIMARY,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeCountText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
    lineHeight: 12,
  },
});
