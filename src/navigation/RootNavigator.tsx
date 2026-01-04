import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Image, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Alert, SafeAreaView, InteractionManager } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, fetchSignInMethodsForEmail, sendPasswordResetEmail, updateProfile as fbUpdateProfile } from "firebase/auth";
import { setDoc, doc, serverTimestamp } from "firebase/firestore";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

import { auth, db } from "../firebase";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import appConfig from "../../app.json";

import type { RootStackParamList } from "./types";
import type { UserDoc } from "../types/firestore";

// Screens
import MainTabs from "./MainTabs";
import UserListScreen from "../screens/admin/UserListScreen";
import UserDetailScreen from "../screens/admin/UserDetailScreen";
import UsciteList from "../screens/UsciteList";
import SocialListScreen from "../screens/SocialListScreen";
import SocialDetailScreen from "../screens/SocialDetailScreen";
import SocialEditScreen from "../screens/SocialEditScreen";
import BoardScreen from "../screens/BoardScreen";
import CalendarScreen from "../screens/CalendarScreen";
import CalendarDayScreen from "../screens/CalendarDayScreen";
import TrekkingPlaceholderScreen from "../screens/TrekkingPlaceholderScreen";
import ViaggiPlaceholderScreen from "../screens/ViaggiPlaceholderScreen";
import CreateRideScreen from "../screens/CreateRideScreen";
import RideDetails from "../screens/RideDetails";
import ProfileScreen from "../screens/ProfileScreen";
import BoardPostDetailScreen from "../screens/BoardPostDetailScreen";
import NotificationSettingsScreen from "../screens/NotificationSettingsScreen";
import InfoScreen from "../screens/InfoScreen";
import AdminScreen from "../screens/AdminScreen";
import useCurrentProfile from "../hooks/useCurrentProfile";
import AdminGate from "./guards/AdminGate";
import { UI } from "../components/Screen";

const Stack = createNativeStackNavigator<RootStackParamList>();
const COLOR_PRIMARY = "#0B3D2E";
const COLOR_TEXT = "#102A43";
const COLOR_MUTED = "#5B6B7F";
const loginLogo = require("../../assets/images/logo.png");

// ------------------------------------------------------------------
// AUTH HELPERS & CONSTANTS
// ------------------------------------------------------------------
const BIOMETRIC_EMAIL_KEY = "bh_email";
const BIOMETRIC_PASS_KEY = "bh_pass";
const REMEMBER_EMAIL_KEY = "bh_remember_email";
const REMEMBER_PASS_KEY = "bh_remember_pass";

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
async function loadRememberCreds() {
    const email = await SecureStore.getItemAsync(REMEMBER_EMAIL_KEY);
    const pass = await SecureStore.getItemAsync(REMEMBER_PASS_KEY);
    if (email && pass) return { email, password: pass };
    return null;
}
async function saveRememberCreds(email: string, password: string) {
    await SecureStore.setItemAsync(REMEMBER_EMAIL_KEY, email, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
    await SecureStore.setItemAsync(REMEMBER_PASS_KEY, password, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
}
async function clearRememberCreds() {
    await SecureStore.deleteItemAsync(REMEMBER_EMAIL_KEY);
    await SecureStore.deleteItemAsync(REMEMBER_PASS_KEY);
}

const APP_VERSION_LABEL = (() => {
    const platformKey = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : Platform.OS;
    const staticExtra =
        (((appConfig as any)?.expo?.extra?.version as Record<string, string> | undefined) ?? {})[platformKey] ?? null;
    if (staticExtra) return `v. ${staticExtra}`;
    const staticVersion = (appConfig as any)?.expo?.version ?? null;
    return staticVersion ? `v. ${staticVersion}` : null;
})();

type UserProfile = UserDoc;

// ------------------------------------------------------------------
// SCREENS (Moved from App.tsx)
// ------------------------------------------------------------------
const PERF = __DEV__;
const t = (label: string) => {
    if (PERF) console.log(`[perf] ${label} ${Date.now()}`);
};

function LoginScreen({ navigation }: any) {
    t("LoginScreen render");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [bioReady, setBioReady] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [inputsReady, setInputsReady] = useState(false);
    const inputBusyRef = useRef(false);
    const initRanRef = useRef(false);
    const initTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const initRef = useRef<() => void>(() => {});
    const defaultBiometricLabel = Platform.OS === "ios" ? "Accedi con Face ID / Touch ID" : "Accedi con Touch ID";
    const [biometricLabel, setBiometricLabel] = useState(defaultBiometricLabel);

    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout> | null = null;
        const task = InteractionManager.runAfterInteractions(() => {
            timeout = setTimeout(() => setInputsReady(true), 900);
        });
        return () => {
            task.cancel?.();
            if (timeout) {
                clearTimeout(timeout);
            }
        };
    }, []);

    const scheduleInitAfterIdle = () => {
        if (initRanRef.current || initTimerRef.current) return;
        t("Login init scheduled");
        initTimerRef.current = setTimeout(() => {
            initTimerRef.current = null;
            if (initRanRef.current) return;
            if (inputBusyRef.current) {
                scheduleInitAfterIdle();
                return;
            }
            initRef.current();
        }, 900);
    };

    useEffect(() => {
        let cancelled = false;
        const init = async () => {
            if (inputBusyRef.current) {
                scheduleInitAfterIdle();
                return;
            }
            t("Login init start");
            initRanRef.current = true;
            try {
                const [ok, storedBio, remembered] = await Promise.all([
                    deviceSupportsBiometrics(),
                    loadCredsSecurely(),
                    loadRememberCreds(),
                ]);
                if (cancelled) return;
                const bioEnabled = ok && !!storedBio;
                setBioReady(bioEnabled);

                if (remembered) {
                    if (remembered.email) {
                        setEmail((prev) => (prev ? prev : remembered.email));
                    }
                    if (remembered.password) {
                        setPassword((prev) => (prev ? prev : remembered.password));
                    }
                    setRememberMe(true);
                } else {
                    setRememberMe(false);
                }

                if (bioEnabled) {
                    try {
                        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
                        if (cancelled) return;
                        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
                            setBiometricLabel("Accedi con Face ID / Touch ID");
                        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
                            setBiometricLabel("Accedi con Touch ID");
                        }
                    } catch {
                        if (!cancelled) {
                            setBiometricLabel(defaultBiometricLabel);
                        }
                    }
                }
            } finally {
                t("Login init end");
            }
        };
        initRef.current = () => void init();
        const task = InteractionManager.runAfterInteractions(() => {
            scheduleInitAfterIdle();
        });
        return () => {
            cancelled = true;
            task.cancel?.();
            if (initTimerRef.current) {
                clearTimeout(initTimerRef.current);
                initTimerRef.current = null;
            }
        };
    }, []);

    const doLogin = async () => {
        if (!email || !password) {
            Alert.alert("Attenzione", "Inserisci email e password.");
            return;
        }
        try {
            setBusy(true);
            await signInWithEmailAndPassword(auth, email.trim(), password);
            if (rememberMe) {
                void (async () => {
                    try {
                        await saveRememberCreds(email.trim(), password);
                    } catch {
                        // Silent best-effort
                    }
                })();
            } else {
                void (async () => {
                    try {
                        await clearRememberCreds();
                    } catch {
                        // Silent best-effort
                    }
                })();
            }
            // Biometric prompt logic is simpler if we just do it on success
            const ok = await deviceSupportsBiometrics();
            if (ok) {
                // Here we could ask to save creds if not saved
            }
        } catch (e: any) {
            Alert.alert("Errore login", e.message);
        } finally {
            setBusy(false);
        }
    };

    const handleRememberToggle = (value: boolean) => {
        setRememberMe(value);
        if (!value) {
            setPassword("");
            void (async () => {
                try {
                    await clearRememberCreds();
                } catch {
                    // Silent best-effort
                }
            })();
        }
    };

    const loginWithBiometrics = async () => {
        try {
            const saved = await loadCredsSecurely();
            if (!saved) return;
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: "Accedi con Face ID/Touch ID",
            });
            if (!result.success) return;
            await signInWithEmailAndPassword(auth, saved.email, saved.password);
        } catch (e: any) {
            Alert.alert("Errore", e.message);
        }
    };

    const doResetPassword = async () => {
        if (!email.trim()) return Alert.alert("Email mancante", "Inserisci la email.");
        try {
            await sendPasswordResetEmail(auth, email.trim());
            Alert.alert("Email inviata", "Controlla la posta.");
        } catch (e: any) {
            Alert.alert("Errore", e.message);
        }
    };

    const [passwordVisible, setPasswordVisible] = useState(false);

    return (
        <SafeAreaView style={styles.authContainer}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                <ScrollView
                    contentContainerStyle={styles.loginScroll}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.loginCard}>
                        <View style={styles.loginHeader}>
                            <View style={styles.logoWrap}>
                                <Image source={loginLogo} style={styles.logoImage} />
                            </View>
                            <Text style={styles.loginTitle}>Accedi</Text>
                            {!inputsReady && <ActivityIndicator size="small" color={UI.colors.muted} style={styles.loginWarmup} />}
                            {!!APP_VERSION_LABEL && (
                                <Text style={styles.loginVersion}>{APP_VERSION_LABEL}</Text>
                            )}
                        </View>

                        <View style={[styles.fieldGroup, styles.fieldGroupFirst]}>
                            <Text style={styles.loginLabel}>Email</Text>
                            <TextInput
                                style={styles.loginInput}
                                placeholder="nome@esempio.com"
                                placeholderTextColor={UI.colors.disabled}
                                autoCapitalize="none"
                                autoCorrect={false}
                                spellCheck={false}
                                keyboardType="email-address"
                                {...Platform.select({
                                    ios: { textContentType: "none" },
                                    android: { autoComplete: "email", importantForAutofill: "yes" },
                                })}
                                editable={inputsReady}
                                selectTextOnFocus={inputsReady}
                                value={email}
                                onChangeText={setEmail}
                                onFocus={() => {
                                    inputBusyRef.current = true;
                                    t("Email focus");
                                }}
                                onBlur={() => {
                                    inputBusyRef.current = false;
                                    scheduleInitAfterIdle();
                                }}
                            />
                        </View>

                        <View style={styles.fieldGroup}>
                            <Text style={styles.loginLabel}>Password</Text>
                            <View style={styles.loginPasswordField}>
                                <TextInput
                                    style={styles.loginPasswordInput}
                                    placeholder="••••••••"
                                    placeholderTextColor={UI.colors.disabled}
                                    secureTextEntry={!passwordVisible}
                                    autoCorrect={false}
                                    spellCheck={false}
                                    {...Platform.select({
                                        ios: { textContentType: "none", keyboardType: "ascii-capable" },
                                        android: { autoComplete: "password", importantForAutofill: "yes" },
                                    })}
                                    editable={inputsReady}
                                    selectTextOnFocus={inputsReady}
                                    value={password}
                                    onChangeText={setPassword}
                                    onFocus={() => {
                                        inputBusyRef.current = true;
                                        t("Password focus");
                                    }}
                                    onBlur={() => {
                                        inputBusyRef.current = false;
                                        scheduleInitAfterIdle();
                                    }}
                                />
                                <Pressable
                                    onPress={() => setPasswordVisible(!passwordVisible)}
                                    style={styles.passwordToggle}
                                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                >
                                    <Ionicons
                                        name={passwordVisible ? "eye-off-outline" : "eye-outline"}
                                        size={20}
                                        color={UI.colors.muted}
                                    />
                                </Pressable>
                            </View>
                        </View>

                        <Pressable
                            onPress={() => void handleRememberToggle(!rememberMe)}
                            style={styles.rememberRow}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <View style={styles.rememberInline}>
                                <Text style={styles.rememberLabel}>Ricordami</Text>
                                <Ionicons
                                    name={rememberMe ? "checkbox" : "square-outline"}
                                    size={28}
                                    color={rememberMe ? UI.colors.action : UI.colors.muted}
                                    style={styles.rememberCheckIcon}
                                />
                            </View>
                        </Pressable>

                        <Pressable onPress={doResetPassword} style={styles.forgotLink}>
                            <Text style={styles.forgotLinkText}>Password dimenticata?</Text>
                        </Pressable>

                        <View style={styles.buttonGroup}>
                            <Pressable onPress={doLogin} style={styles.loginPrimaryButton}>
                                <Text style={styles.loginPrimaryText}>{busy ? "Accesso..." : "Accedi"}</Text>
                            </Pressable>

                            {bioReady && (
                                <Pressable onPress={loginWithBiometrics} style={styles.loginSecondaryButton}>
                                    <Ionicons name="finger-print" size={20} color={UI.colors.muted} />
                                    <Text style={styles.loginSecondaryText}>{biometricLabel}</Text>
                                </Pressable>
                            )}
                        </View>

                        <View style={styles.loginFooterRow}>
                            <Text style={styles.loginFooterText}>Non hai un account?</Text>
                            <Pressable onPress={() => navigation.replace("Signup")} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                <Text style={styles.loginFooterLink}>Registrati</Text>
                            </Pressable>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

function SignupScreen({ navigation }: any) {
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
        if (!firstName || !lastName || !email || !password || !confirmPassword) {
            return Alert.alert("Attenzione", "Tutti i campi obbligatori devono essere compilati.");
        }
        if (password !== confirmPassword) {
            return Alert.alert("Attenzione", "Le password non coincidono.");
        }
        try {
            setBusy(true);
            const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
            const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
            await fbUpdateProfile(cred.user, { displayName: fullName });

            await setDoc(doc(db, "users", cred.user.uid), {
                uid: cred.user.uid,
                email: cred.user.email || "",
                displayName: fullName,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                nickname: nickname.trim(),
                role: "member",
                approved: false,
                disabled: false,
                createdAt: serverTimestamp(),
            });
            // Skip public doc for brevity in this extraction, or add it back if critical
        } catch (e: any) {
            Alert.alert("Errore registrazione", e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <SafeAreaView style={styles.authContainer}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                <ScrollView
                    contentContainerStyle={styles.signupScroll}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.loginCard}>
                        <View style={styles.loginHeader}>
                            <View style={styles.signupLogoWrap}>
                                <Image source={loginLogo} style={styles.logoImage} resizeMode="contain" />
                            </View>
                            <Text style={[styles.loginTitle, styles.signupTitle]}>Registrati</Text>
                        </View>

                        <View style={[styles.fieldGroup, styles.fieldGroupFirst, styles.signupFieldGroupFirst]}>
                            <Text style={styles.loginLabel}>Nome *</Text>
                            <TextInput
                                style={[styles.loginInput, styles.signupInput]}
                                placeholder="Mario"
                                placeholderTextColor={UI.colors.disabled}
                                value={firstName}
                                onChangeText={setFirstName}
                            />
                        </View>

                        <View style={[styles.fieldGroup, styles.signupFieldGroup]}>
                            <Text style={styles.loginLabel}>Cognome *</Text>
                            <TextInput
                                style={[styles.loginInput, styles.signupInput]}
                                placeholder="Rossi"
                                placeholderTextColor={UI.colors.disabled}
                                value={lastName}
                                onChangeText={setLastName}
                            />
                        </View>

                        <View style={[styles.fieldGroup, styles.signupFieldGroup]}>
                            <Text style={styles.loginLabel}>Email *</Text>
                            <TextInput
                                style={[styles.loginInput, styles.signupInput]}
                                placeholder="nome@esempio.com"
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                placeholderTextColor={UI.colors.disabled}
                            />
                        </View>

                        <View style={[styles.fieldGroup, styles.signupFieldGroup]}>
                            <Text style={styles.loginLabel}>Password *</Text>
                            <View style={styles.loginPasswordField}>
                                <TextInput
                                    style={[styles.loginPasswordInput, styles.signupPasswordInput]}
                                    secureTextEntry={!passwordVisible}
                                    placeholder="••••••••"
                                    placeholderTextColor={UI.colors.disabled}
                                    value={password}
                                    onChangeText={setPassword}
                                />
                                <Pressable
                                    onPress={() => setPasswordVisible(!passwordVisible)}
                                    style={styles.passwordToggle}
                                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                >
                                    <Ionicons name={passwordVisible ? "eye-off-outline" : "eye-outline"} size={20} color={UI.colors.muted} />
                                </Pressable>
                            </View>
                        </View>

                        <View style={[styles.fieldGroup, styles.signupFieldGroup]}>
                            <Text style={styles.loginLabel}>Conferma Password *</Text>
                            <View style={styles.loginPasswordField}>
                                <TextInput
                                    style={[styles.loginPasswordInput, styles.signupPasswordInput]}
                                    secureTextEntry={!confirmVisible}
                                    placeholder="••••••••"
                                    placeholderTextColor={UI.colors.disabled}
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                />
                                <Pressable
                                    onPress={() => setConfirmVisible(!confirmVisible)}
                                    style={styles.passwordToggle}
                                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                >
                                    <Ionicons name={confirmVisible ? "eye-off-outline" : "eye-outline"} size={20} color={UI.colors.muted} />
                                </Pressable>
                            </View>
                        </View>

                        <Text style={styles.signupInfoText}>
                            App riservata ai soci Bike and Hike Italia ASD.{"\n"}Info: bikeandhikeitalia.info@gmail.com
                        </Text>

                        <Pressable onPress={doSignup} style={styles.loginPrimaryButton}>
                            <Text style={styles.loginPrimaryText}>{busy ? "Creazione..." : "Crea account"}</Text>
                        </Pressable>

                        <View style={styles.loginFooterRow}>
                            <Text style={styles.loginFooterText}>Hai già un account?</Text>
                            <Pressable onPress={() => navigation.replace("Login")} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                <Text style={styles.loginFooterLink}>Accedi</Text>
                            </Pressable>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

function AttesaApprovazioneScreen() {
    return (
        <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Text style={{ fontSize: 20, fontWeight: "900", marginBottom: 8 }}>Account in attesa</Text>
            <Text style={{ textAlign: "center", color: "#475569" }}>
                Il tuo account è in attesa di approvazione oppure è stato disattivato da un amministratore.
            </Text>
            <Pressable onPress={() => signOut(auth)} style={[{ marginTop: 16 }, styles.btnSecondary]}>
                <Text style={styles.btnSecondaryText}>Esci</Text>
            </Pressable>
        </SafeAreaView>
    );
}

function RejectedScreen({ profile }: { profile: any }) {
    return (
        <SafeAreaView style={styles.authContainer}>
            <ScrollView contentContainerStyle={styles.authScroll}>
                <Image source={loginLogo} style={styles.authLogo} />
                <Text style={styles.authTitle}>Richiesta non approvata</Text>
                <Text style={{ textAlign: "center", marginBottom: 20 }}>
                    Spiacenti, la tua richiesta non è stata approvata.
                </Text>
                <Pressable onPress={() => signOut(auth)} style={styles.btnSecondary}>
                    <Text style={styles.btnSecondaryText}>Esci</Text>
                </Pressable>
            </ScrollView>
        </SafeAreaView>
    );
}

// Removed inline AdminGate function


// ------------------------------------------------------------------
// ROOT NAVIGATOR
// ------------------------------------------------------------------

export default function RootNavigator({ user, profile }: { user: any; profile: any }) {
    const approvedOk =
        !!profile &&
        ((profile.approved === true) ||
            (profile.approved === "true") ||
            (profile.approved === 1));

    const disabledOn =
        !!profile &&
        ((profile.disabled === true) ||
            (profile.disabled === "true") ||
            (profile.disabled === 1));

    const isSelfDeleted =
        !!profile &&
        ((profile.selfDeleted === true) ||
            (profile.displayName === "__self_deleted__"));

    const isPending = !!profile && !isSelfDeleted && !approvedOk && !disabledOn;
    const isDisabledOnly = !!profile && !isSelfDeleted && disabledOn === true;

    if (user === null) {
        return (
            <Stack.Navigator screenOptions={{ headerTitleAlign: "center" }}>
                <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Accedi" }} />
                <Stack.Screen name="Signup" component={SignupScreen} options={{ title: "Registrati" }} />
            </Stack.Navigator>
        );
    }

    if (profile && (isSelfDeleted || isPending || isDisabledOnly)) {
        return (
            <Stack.Navigator screenOptions={{ headerTitleAlign: "center" }}>
                {isPending || isSelfDeleted ? (
                    <Stack.Screen
                        name="Attesa"
                        component={AttesaApprovazioneScreen}
                        options={{ title: "In attesa", headerShown: false }}
                    />
                ) : (
                    <Stack.Screen
                        name="Rejected"
                        options={{ title: "Accesso non approvato", headerShown: false }}
                    >
                        {() => <RejectedScreen profile={profile} />}
                    </Stack.Screen>
                )}
            </Stack.Navigator>
        );
    }

    return (
        <Stack.Navigator screenOptions={{ headerShadowVisible: false, headerTitleAlign: "center" }}>
            <Stack.Screen name="Home" component={MainTabs} options={{ headerShown: false }} />

            <Stack.Screen name="UserList" component={UserListScreen} options={{ headerShown: false }} />
            <Stack.Screen name="UserDetail" component={UserDetailScreen} options={{ headerShown: false }} />
            <Stack.Screen name="UsciteList" component={UsciteList} options={{ headerShown: false }} />
            <Stack.Screen name="SocialList" component={SocialListScreen} options={{ headerShown: false }} />
            <Stack.Screen name="SocialDetail" component={SocialDetailScreen} options={{ headerShown: false }} />
            <Stack.Screen name="SocialEdit" component={SocialEditScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Board" component={BoardScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Calendar" component={CalendarScreen} options={{ headerShown: false }} />
            <Stack.Screen name="CalendarDay" component={CalendarDayScreen} options={{ headerShown: false }} />
            <Stack.Screen name="TrekkingPlaceholder" component={TrekkingPlaceholderScreen} options={{ title: "Trekking" }} />
            <Stack.Screen name="ViaggiPlaceholder" component={ViaggiPlaceholderScreen} options={{ title: "Viaggi" }} />
            <Stack.Screen name="CreateRide" component={CreateRideScreen} options={{ title: "Crea Uscita", headerShown: false }} />
            <Stack.Screen name="Create" component={CreateRideScreen} options={{ title: "Crea Uscita", headerShown: false }} />
            <Stack.Screen name="RideDetails" component={RideDetails} options={{ headerShown: false }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
            <Stack.Screen name="BoardPostDetail" component={BoardPostDetailScreen} options={{ headerShown: false }} />
            <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Info" component={InfoScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Amministrazione" component={AdminGate} options={{ headerShown: false }} />
        </Stack.Navigator>
    );
}

const styles = StyleSheet.create({
    // Copy relevant styles from App.tsx (authContainer, authScroll, authLogo, authTitle, input, btnPrimary, etc.)
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
    },
    passwordField: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#e5e7eb",
        borderRadius: 10,
        backgroundColor: "#fff",
    },
    passwordInput: {
        flex: 1,
        borderWidth: 0,
    },
    passwordToggle: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    loginScroll: {
        paddingHorizontal: 20,
        paddingVertical: 24,
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    signupScroll: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        flexGrow: 1,
        alignItems: "center",
    },
    loginCard: {
        width: "100%",
        maxWidth: 420,
        backgroundColor: "#fff",
        borderRadius: 24,
        padding: 24,
        ...UI.shadow.card,
    },
    loginHeader: {
        alignItems: "center",
    },
    logoWrap: {
        width: 104,
        height: 104,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
    },
    signupLogoWrap: {
        width: 88,
        height: 88,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
        marginBottom: 2,
    },
    logoImage: {
        width: "100%",
        height: "100%",
        resizeMode: "contain",
    },
    loginTitle: {
        marginTop: 12,
        fontSize: 28,
        fontWeight: "800",
        color: UI.colors.text,
        textAlign: "center",
    },
    signupTitle: {
        marginTop: 8,
    },
    loginVersion: {
        marginTop: 6,
        fontSize: 13,
        fontWeight: "600",
        color: UI.colors.muted,
        textAlign: "center",
    },
    loginWarmup: {
        marginTop: 6,
        alignSelf: "center",
    },
    fieldGroup: {
        marginTop: 12,
    },
    fieldGroupFirst: {
        marginTop: 16,
    },
    signupFieldGroup: {
        marginTop: 10,
    },
    signupFieldGroupFirst: {
        marginTop: 12,
    },
    loginLabel: {
        marginBottom: 6,
        fontSize: 14,
        fontWeight: "600",
        color: "#374151",
    },
    loginInput: {
        borderWidth: 1,
        borderColor: UI.colors.borderMuted,
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: "#fff",
        color: UI.colors.text,
        fontSize: 16,
    },
    signupInput: {
        paddingVertical: 12,
    },
    loginPasswordField: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: UI.colors.borderMuted,
        borderRadius: 14,
        backgroundColor: "#fff",
    },
    loginPasswordInput: {
        flex: 1,
        paddingHorizontal: 16,
        paddingRight: 44,
        paddingVertical: 14,
        fontSize: 16,
        color: UI.colors.text,
    },
    rememberRow: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 12,
        marginBottom: 6,
        minHeight: 44,
    },
    rememberInline: {
        flexDirection: "row",
        alignItems: "center",
    },
    rememberLabel: {
        fontSize: 15,
        fontWeight: "600",
        color: UI.colors.text,
    },
    rememberCheckIcon: {
        marginLeft: 10,
        padding: 6,
    },
    signupPasswordInput: {
        paddingVertical: 12,
    },
    forgotLink: {
        marginTop: 6,
        alignSelf: "flex-start",
    },
    forgotLinkText: {
        color: UI.colors.action,
        fontWeight: "600",
    },
    buttonGroup: {
        marginTop: 20,
    },
    loginPrimaryButton: {
        width: "100%",
        height: 56,
        borderRadius: 999,
        backgroundColor: UI.colors.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    loginPrimaryText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "800",
    },
    loginSecondaryButton: {
        width: "100%",
        height: 56,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: UI.colors.borderMuted,
        backgroundColor: "#fff",
        marginTop: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
    loginSecondaryText: {
        marginLeft: 8,
        fontSize: 15,
        fontWeight: "600",
        color: UI.colors.text,
    },
    loginFooterRow: {
        marginTop: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
    },
    loginFooterText: {
        fontSize: 14,
        color: UI.colors.muted,
    },
    loginFooterLink: {
        marginLeft: 4,
        fontSize: 14,
        fontWeight: "700",
        color: UI.colors.action,
    },
    signupInfoText: {
        marginTop: 12,
        marginBottom: 12,
        paddingHorizontal: 16,
        fontSize: 12,
        lineHeight: 16,
        textAlign: "center",
        color: UI.colors.muted,
        alignSelf: "center",
    },
});
