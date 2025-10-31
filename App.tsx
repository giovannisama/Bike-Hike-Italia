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
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from "@react-navigation/native";
import {
  createNativeStackNavigator,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import appConfig from "./app.json";

import {
  onAuthStateChanged,
  User,
  signOut,
  updateProfile as fbUpdateProfile,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
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
          Questa sezione è riservata agli Admin e agli Owner.
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
  UserDetail: { uid: string; meRole?: string | null };
  UsciteList: undefined;
  Calendar: undefined;
  CreateRide: undefined;
  Create: undefined; // alias compatibilità
  RideDetails: { rideId: string; title?: string };
  Profile: undefined;
  Attesa: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
// Navigation ref per future esigenze (es. deep link)
export const navRef = createNavigationContainerRef<RootStackParamList>();

// ---- COLORI ----
const COLOR_PRIMARY = "#0B3D2E";     // verde scuro logo
const COLOR_SECONDARY = "#1FA36B";   // verde brillante logo
const COLOR_ACCENT = "#C1275A";      // magenta logo
const COLOR_ACCENT_WARM = "#F7B32B"; // giallo logo
const COLOR_TEXT = "#102A43";
const COLOR_MUTED = "#5B6B7F";

// ---- UI THEME (riusabile ovunque) ----
const UI = {
  colors: {
    primary: COLOR_PRIMARY,
    secondary: COLOR_SECONDARY,
    accent: COLOR_ACCENT,
    accentWarm: COLOR_ACCENT_WARM,
    text: COLOR_TEXT,
    muted: COLOR_MUTED,
    bg: "#ffffff",
    card: "#ffffff",
    tint: "#E6F4ED",
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

const APP_VERSION_LABEL = (() => {
  const platformKey = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : Platform.OS;
  const staticExtra =
    (((appConfig as any)?.expo?.extra?.version as Record<string, string> | undefined) ?? {})[platformKey] ?? null;
  if (staticExtra) return `v. ${staticExtra}`;

  const staticVersion = (appConfig as any)?.expo?.version ?? null;
  try {
    const constantsAny: Record<string, any> = Constants as any;
    const updatesExtra =
      (Updates?.manifest as any)?.extra?.version?.[platformKey] ??
      null;
    if (updatesExtra) return `v. ${updatesExtra}`;

    const runtimeExtra =
      constantsAny?.expoConfig?.extra?.version?.[platformKey] ??
      constantsAny?.manifest?.extra?.version?.[platformKey] ??
      null;
    if (runtimeExtra) return `v. ${runtimeExtra}`;

    const configVersion =
      constantsAny?.expoConfig?.version ??
      constantsAny?.manifest?.version ??
      null;
    const nativeVersion = Constants?.nativeAppVersion ?? null;
    const resolved = configVersion ?? staticVersion ?? nativeVersion ?? null;
    return resolved ? `v. ${resolved}` : null;
  } catch {
    return staticVersion ? `v. ${staticVersion}` : null;
  }
})();

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
  disabled?: boolean;
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
      let message = e?.message ?? "Impossibile effettuare il login";
      if (e?.code === "auth/network-request-failed") {
        message =
          "Connessione assente. Per accedere a Bike & Hike è necessaria una connessione Internet. Controlla la rete e riprova.";
      } else if (e?.code === "auth/invalid-email") {
        message = "Email non valida. Controlla il formato dell'indirizzo.";
      } else if (
        e?.code === "auth/invalid-credential" ||
        e?.code === "auth/user-not-found" ||
        e?.code === "auth/wrong-password"
      ) {
        message =
          "Credenziali non valide. Se hai cancellato l'account, registrati nuovamente per accedere.";
      }
      Alert.alert("Errore login", message);
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
      let message = e?.message ?? "Impossibile usare l'accesso rapido.";
      if (e?.code === "auth/network-request-failed") {
        message =
          "Connessione assente. Per accedere a Bike & Hike è necessaria una connessione Internet. Controlla la rete e riprova.";
      } else if (e?.code === "auth/invalid-email") {
        message = "Email non valida. Controlla il formato dell'indirizzo.";
      } else if (
        e?.code === "auth/invalid-credential" ||
        e?.code === "auth/user-not-found" ||
        e?.code === "auth/wrong-password"
      ) {
        message =
          "Credenziali non valide. Se hai cancellato l'account, registrati nuovamente per accedere.";
      }
      Alert.alert("Errore Face ID", message);
    }
  };

  const [passwordVisible, setPasswordVisible] = useState(false);

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
      let message = e?.message ?? "Impossibile inviare l'email di reset.";
      if (e?.code === "auth/network-request-failed") {
        message =
          "Connessione assente. Per accedere a Bike & Hike è necessaria una connessione Internet. Controlla la rete e riprova.";
      }
      Alert.alert("Errore", message);
    }
  };

  return (
    <SafeAreaView style={styles.authContainer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <Image source={logo} style={styles.authLogo} />
          {!!APP_VERSION_LABEL && <Text style={styles.authVersion}>{APP_VERSION_LABEL}</Text>}
          <Text style={styles.authTitle}>Accedi</Text>

          <Text style={styles.inputLabel}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="nome@esempio.com"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            autoCorrect={false}
            importantForAutofill="yes"
            autoComplete="email"
          />

          <Text style={styles.inputLabel}>Password</Text>
          <View style={styles.passwordField}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="••••••••"
              placeholderTextColor="#9CA3AF"
              secureTextEntry={!passwordVisible}
              value={password}
              onChangeText={setPassword}
              textContentType="password"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
            />
            <Pressable
              onPress={() => setPasswordVisible((prev) => !prev)}
              style={styles.passwordToggle}
              accessibilityLabel={passwordVisible ? "Nascondi password" : "Mostra password"}
              accessibilityRole="button"
            >
              <Ionicons
                name={passwordVisible ? "eye-off-outline" : "eye-outline"}
                size={20}
                color="#475569"
              />
            </Pressable>
          </View>

          <Pressable onPress={doResetPassword} style={{ marginTop: 8, alignItems: "flex-start" }}>
            <Text style={{ color: COLOR_PRIMARY, fontWeight: "600" }}>Password dimenticata?</Text>
          </Pressable>

          <Pressable onPress={doLogin} style={[styles.btnPrimary, { marginTop: 16 }]}>
            <Text style={styles.btnPrimaryText}>{busy ? "Accesso..." : "Accedi"}</Text>
          </Pressable>

          {bioReady && (
            <Pressable onPress={loginWithBiometrics} style={[styles.btnSecondary, { marginTop: 12 }]}>
              <Text style={styles.btnSecondaryText}>Accedi con Face ID / Touch ID</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => navigation.replace("Signup")}
            style={[styles.btnTextLink, { marginTop: 16 }]}
          >
            <Text style={styles.textLink}>Non hai un account? Registrati</Text>
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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const doSignup = async () => {
    if (!firstName.trim()) return Alert.alert("Campo mancante", "Inserisci il Nome.");
    if (!lastName.trim()) return Alert.alert("Campo mancante", "Inserisci il Cognome.");
    if (!email.trim()) return Alert.alert("Campo mancante", "Inserisci l'Email.");
    if (!password) return Alert.alert("Campo mancante", "Inserisci la Password.");
    if (!confirmPassword) return Alert.alert("Campo mancante", "Conferma la Password.");
    if (password !== confirmPassword) return Alert.alert("Password diverse", "Le password non coincidono. Riprova.");

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
        disabled: false,
        createdAt: serverTimestamp(),
      } as UserProfile);

      // profilo PUBBLICO (users_public/{uid}) — solo campi non sensibili
      try {
        await setDoc(doc(db, "users_public", cred.user.uid), {
          displayName:
            fullName || (cred.user.email ? cred.user.email.split("@")[0] : ""),
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          nickname: nickname.trim() || null,
          role: "member",
          approved: false,
          disabled: false,
          email: cred.user.email || null,
          createdAt: serverTimestamp(),
        });
      } catch (pubErr: any) {
        if (__DEV__) {
          console.warn("Signup: unable to write users_public document", pubErr);
        }
      }

      Alert.alert("Registrazione completata", "Account creato. Puoi accedere.");
    } catch (e: any) {
      let message = e?.message ?? "Impossibile creare l'account";
      if (e?.code === "auth/network-request-failed") {
        message =
          "Connessione assente. Per accedere a Bike & Hike è necessaria una connessione Internet. Controlla la rete e riprova.";
      } else if (e?.code === "auth/email-already-in-use") {
        try {
          const existingMethods = await fetchSignInMethodsForEmail(auth, email.trim().toLowerCase());
          const providerHint =
            existingMethods.length === 0
              ? ""
              : existingMethods.includes("password")
              ? " con email e password"
              : ` con ${existingMethods.join(", ")}`;
          message = `Esiste già un account registrato per ${email.trim().toLowerCase()}${providerHint}. Se non ricordi la password, usa la funzione di reset oppure accedi con il metodo già collegato.`;
        } catch {
          message =
            "Esiste già un account associato a questa email. Se non ricordi la password, usa la funzione di reset o accedi con le credenziali esistenti.";
        }
      } else if (e?.code === "auth/weak-password") {
        message = "La password scelta è troppo debole. Inserisci almeno 6 caratteri o scegli una password più complessa.";
      } else if (e?.code === "auth/invalid-email") {
        message = "Formato email non valido. Controlla l'indirizzo e riprova.";
      }
      Alert.alert("Errore registrazione", message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.authContainer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
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
          <View style={styles.passwordField}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Minimo 6 caratteri"
              secureTextEntry={!passwordVisible}
              value={password}
              onChangeText={setPassword}
              textContentType="newPassword"
              autoCapitalize="none"
            />
            <Pressable
              onPress={() => setPasswordVisible((prev) => !prev)}
              style={styles.passwordToggle}
              accessibilityLabel={passwordVisible ? "Nascondi password" : "Mostra password"}
              accessibilityRole="button"
            >
              <Ionicons
                name={passwordVisible ? "eye-off-outline" : "eye-outline"}
                size={20}
                color="#475569"
              />
            </Pressable>
          </View>

          <Text style={styles.inputLabel}>Conferma Password *</Text>
          <View style={styles.passwordField}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Ripeti la password"
              secureTextEntry={!confirmVisible}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              textContentType="newPassword"
              autoCapitalize="none"
            />
            <Pressable
              onPress={() => setConfirmVisible((prev) => !prev)}
              style={styles.passwordToggle}
              accessibilityLabel={confirmVisible ? "Nascondi password" : "Mostra password"}
              accessibilityRole="button"
            >
              <Ionicons
                name={confirmVisible ? "eye-off-outline" : "eye-outline"}
                size={20}
                color="#475569"
              />
            </Pressable>
          </View>

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
  useNativeHeader = false,
  keyboardShouldPersistTaps = "handled",
}: {
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  useNativeHeader?: boolean;
  keyboardShouldPersistTaps?: "always" | "handled" | "never";
}) {
  const Content = () => (
    <View style={{ flex: 1, backgroundColor: UI.colors.bg }}>
      {/* Header */}
      {!useNativeHeader && (
        <LinearGradient
          colors={[UI.colors.primary, UI.colors.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingHorizontal: UI.spacing.lg,
            paddingTop: UI.spacing.lg,
            paddingBottom: UI.spacing.lg + 4,
          }}
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
      )}

      {/* Corpo con angoli arrotondati */}
      {useNativeHeader ? (
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <View
            style={{
              flex: 1,
              padding: UI.spacing.lg,
              backgroundColor: UI.colors.bg,
            }}
          >
            {children}
          </View>
        </SafeAreaView>
      ) : (
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
      )}
    </View>
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: useNativeHeader ? UI.colors.bg : UI.colors.primary,
      }}
    >
      <StatusBar barStyle={useNativeHeader ? "dark-content" : "light-content"} />
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        >
          <Content />
        </ScrollView>
      ) : (
        <Content />
      )}
    </View>
  );
}

type ShortcutCardProps = {
  label: string;
  caption?: string;
  icon: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  badgeCount?: number | null;
  danger?: boolean;
  style?: ViewStyle;
  iconContainerStyle?: ViewStyle;
};

function ShortcutCard({
  label,
  caption,
  icon,
  onPress,
  disabled = false,
  badgeCount,
  danger = false,
  style,
  iconContainerStyle,
}: ShortcutCardProps) {
  return (
    <Pressable
      onPress={() => {
        if (!disabled) onPress();
      }}
      style={({ pressed }) => [
        {
          width: "48%",
          backgroundColor: UI.colors.card,
          borderRadius: UI.radius.xl,
          paddingVertical: UI.spacing.md,
          paddingHorizontal: UI.spacing.sm,
          alignItems: "center",
          justifyContent: "center",
          gap: UI.spacing.sm,
          opacity: disabled ? 0.5 : 1,
          transform: [{ scale: pressed && !disabled ? 0.96 : 1 }],
          minHeight: 140,
        },
        style,
        UI.shadow.card,
      ]}
    >
      <View
        style={[
          {
            width: 62,
            height: 62,
            borderRadius: UI.radius.md,
            backgroundColor: UI.colors.tint,
            alignItems: "center",
            justifyContent: "center",
          },
          iconContainerStyle,
        ]}
      >
        {icon}
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={{
          width: "100%",
          fontSize: 16,
          fontWeight: "800",
          color: danger ? UI.colors.danger : UI.colors.text,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
      {!!caption && (
        <Text style={{ fontSize: 12, fontWeight: "600", color: UI.colors.muted, textAlign: "center" }}>
          {caption}
        </Text>
      )}
      {typeof badgeCount === "number" && (
        <View
          style={{
            position: "absolute",
            top: 12,
            right: 16,
            minWidth: 24,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 999,
            backgroundColor: UI.colors.accent,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12, textAlign: "center" }}>
            {badgeCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function HomeScreen({ navigation }: HomeProps) {
  const user = auth.currentUser;
  const { profile, isAdmin, isOwner, loading } = useCurrentProfile();
  const activeCount = useActiveRidesCount();

  const firstName = (profile?.firstName ?? "").trim();
  const lastName = (profile?.lastName ?? "").trim();
  const nickname = (profile?.nickname ?? "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  const fallbackDisplay =
    user?.displayName?.trim() ||
    (user?.email ? user.email.split("@")[0] : "") ||
    "Ciclista";

  const formattedName =
    firstName && lastName ? `${lastName}, ${firstName}` : fullName || fallbackDisplay;
  const secondaryLine = nickname || user?.email || "";

  return (
    <Screen useNativeHeader scroll keyboardShouldPersistTaps="handled">
      <LinearGradient
        colors={[UI.colors.primary, "#146C43", UI.colors.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: UI.radius.xl,
          padding: UI.spacing.lg,
          paddingBottom: UI.spacing.lg + 4,
          marginBottom: UI.spacing.lg,
        }}
      >
        <View style={{ gap: UI.spacing.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: UI.spacing.md }}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 24,
                backgroundColor: "#fff",
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "rgba(0,0,0,0.25)",
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 3,
              }}
            >
              <Image
                source={logo}
                style={{ width: 48, height: 48, resizeMode: "contain" }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: "900", color: "#fff" }}>Bike and Hike</Text>
              <Text
                style={{
                  fontSize: 14,
                  letterSpacing: 2,
                  fontWeight: "700",
                  color: UI.colors.accentWarm,
                }}
              >
                ITALIA
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 24, fontWeight: "900", color: "#fff" }}>{formattedName}</Text>
              {!!secondaryLine && (
                <Text
                  style={{
                    marginTop: 4,
                    fontSize: 16,
                    fontWeight: "600",
                    color: "#EAF7F0",
                  }}
                >
                  {secondaryLine}
                </Text>
              )}
            </View>
            {isAdmin && (
              <View
                style={{
                  backgroundColor: isOwner ? "#1D4ED8" : UI.colors.accent,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: UI.radius.round,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "800", color: "#fff" }}>
                  {isOwner ? "OWNER" : "ADMIN"}
                </Text>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>

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

      <VSpace size="lg" />

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        <ShortcutCard
          label="Uscite"
          caption="Calendario eventi"
          badgeCount={activeCount ?? undefined}
          icon={
            <MaterialCommunityIcons name="bike" size={32} color={UI.colors.primary} />
          }
          onPress={() => navigation.navigate("UsciteList")}
          iconContainerStyle={{ backgroundColor: "#E2F2E8" }}
          style={{ marginBottom: UI.spacing.md }}
        />

        {isAdmin && (
          <ShortcutCard
            label="Nuova uscita"
            caption="Admin e Owner"
            icon={
              <MaterialCommunityIcons
                name="plus-circle-outline"
                size={32}
                color={UI.colors.accent}
              />
            }
            onPress={() => navigation.navigate("CreateRide")}
            iconContainerStyle={{ backgroundColor: "#FBE7F1" }}
            style={{ marginBottom: UI.spacing.md }}
          />
        )}

        <ShortcutCard
          label="Calendario"
          caption="Vista mensile"
          icon={
            <MaterialCommunityIcons
              name="calendar-month"
              size={32}
              color={UI.colors.accentWarm}
            />
          }
          onPress={() => navigation.navigate("Calendar")}
          iconContainerStyle={{ backgroundColor: "#FFF4DC" }}
          style={{ marginBottom: UI.spacing.md }}
        />

        {isOwner && (
          <ShortcutCard
            label="Amministrazione"
            caption="Solo Owner"
            icon={
              <MaterialCommunityIcons
                name="shield-lock-outline"
                size={32}
                color={UI.colors.accent}
              />
            }
            onPress={() => navigation.navigate("Amministrazione")}
            iconContainerStyle={{ backgroundColor: "#FBE7F1" }}
            style={{ marginBottom: UI.spacing.md }}
          />
        )}

        <ShortcutCard
          label="Profilo"
          caption="I tuoi dati"
          icon={
            <MaterialCommunityIcons
              name="account"
              size={32}
              color={UI.colors.primary}
            />
          }
          onPress={() => navigation.navigate("Profile")}
          iconContainerStyle={{ backgroundColor: "#E6F0FA" }}
          style={{ marginBottom: UI.spacing.md }}
        />

        <ShortcutCard
          label="Esci"
          caption="Chiudi la sessione"
          icon={<MaterialCommunityIcons name="logout" size={32} color={UI.colors.danger} />}
          onPress={() => signOut(auth)}
          danger
          iconContainerStyle={{ backgroundColor: "#FDE8E8" }}
          style={{ marginBottom: UI.spacing.md }}
        />
      </View>
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

  // 2) Schermata di caricamento mentre verifichiamo auth o profilo
  if (user === undefined || (user && profileLoading)) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12 }}>Verifica accesso...</Text>
      </SafeAreaView>
    );
  }

  // 3) Navigator
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
  passwordField: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  passwordToggle: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  passwordInput: {
    flex: 1,
    marginBottom: 0,
    borderWidth: 0,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
  },
  authLogo: {
    width: 120,
    height: 120,
    resizeMode: "contain",
    alignSelf: "center",
    marginBottom: 16,
  },
  authVersion: {
    fontSize: 13,
    fontWeight: "700",
    color: COLOR_MUTED,
    textAlign: "center",
    alignSelf: "center",
    marginTop: -10,
    marginBottom: 12,
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
  btnTextLink: { alignItems: "center" },
  textLink: { color: COLOR_PRIMARY, fontWeight: "700" },

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
    color: "#111827",
    fontSize: 16,
    caretColor: "#111827",
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
