// Utility condivise per Face ID / Touch ID e SecureStore

import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const BIOMETRIC_EMAIL_KEY = "bh_email";
const BIOMETRIC_PASS_KEY = "bh_pass";

export async function deviceSupportsBiometrics(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

export async function saveCredsSecurely(email: string, password: string) {
  await SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, email, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
  await SecureStore.setItemAsync(BIOMETRIC_PASS_KEY, password, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

export async function loadCredsSecurely() {
  const email = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
  const pass = await SecureStore.getItemAsync(BIOMETRIC_PASS_KEY);
  if (email && pass) return { email, password: pass };
  return null;
}

export async function clearCredsSecurely() {
  await SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_PASS_KEY);
}
