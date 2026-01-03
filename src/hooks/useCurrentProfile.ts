// src/hooks/useCurrentProfile.ts
import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";
import type { UserDoc } from "../types/firestore";
import {
  normalizeEnabledSections,
  type EnabledSectionKey,
} from "../utils/enabledSections";

export type UserRole = "member" | "admin" | "owner";
export type UserProfile = UserDoc;

export default function useCurrentProfile() {
  const [authUser, setAuthUser] = useState<User | null>(auth.currentUser);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // 🔐 segui i cambi di autenticazione
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setAuthUser(u));
    return () => unsub();
  }, []);

  // 🔄 sottoscrivi il doc users/{uid} quando c’è un utente
  useEffect(() => {
    if (!authUser?.uid) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, "users", authUser.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setProfile((snap.data() as UserProfile) || null);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [authUser?.uid]);

  const role = (() => {
    const raw = typeof profile?.role === "string" ? profile.role.toLowerCase() : "member";
    if (raw === "owner" || raw === "admin" || raw === "member") return raw as UserRole;
    return "member";
  })();
  const isAdmin = role === "admin" || role === "owner";
  const isOwner = role === "owner";

  const enabledSectionsNormalized = normalizeEnabledSections(
    (profile as any)?.enabledSections
  );
  const canSeeSection = (key: EnabledSectionKey) =>
    !enabledSectionsNormalized || enabledSectionsNormalized.includes(key);

  const displayName =
    profile?.displayName ||
    authUser?.displayName ||
    (authUser?.email ? authUser.email.split("@")[0] : "") ||
    "Utente";

  return {
    user: authUser,
    uid: authUser?.uid ?? null,
    profile,
    role,
    isAdmin,
    isOwner,
    isGuide: role === "admin" || role === "owner" || (profile as any)?.role === "guide",
    enabledSectionsNormalized,
    canSeeCiclismo: canSeeSection("ciclismo"),
    canSeeTrekking: canSeeSection("trekking"),
    canSeeViaggi: true, // Universally enabled
    canSeeBikeAut: canSeeSection("bikeaut"),
    displayName,
    loading,
  };
}
