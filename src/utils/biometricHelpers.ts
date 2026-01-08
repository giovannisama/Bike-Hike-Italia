// Utility condivise per Face ID / Touch ID e SecureStore

import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const BIOMETRIC_EMAIL_KEY = "bh_email";
const BIOMETRIC_PASS_KEY = "bh_pass";
const BIOMETRIC_ENABLED_KEY = "bh_bio_enabled";

export async function deviceSupportsBiometrics(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

export async function saveCredentials(email: string, password: string) {
  await SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, email, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
  await SecureStore.setItemAsync(BIOMETRIC_PASS_KEY, password, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "true", {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

export async function getSavedCredentials() {
  const email = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
  const pass = await SecureStore.getItemAsync(BIOMETRIC_PASS_KEY);
  if (email && pass) return { email, password: pass };
  return null;
}

export async function hasSavedCredentials(): Promise<boolean> {
  const stored = await getSavedCredentials();
  return !!stored;
}

export async function getBiometricEnabled(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return hasSavedCredentials();
}

export async function setBiometricEnabled(enabled: boolean) {
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, enabled ? "true" : "false", {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

export async function clearCredentials() {
  await SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_PASS_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
}

export const saveCredsSecurely = saveCredentials;
export const loadCredsSecurely = getSavedCredentials;
export const clearCredsSecurely = clearCredentials;
