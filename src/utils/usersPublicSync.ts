// src/utils/usersPublicSync.ts
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";

export async function mergeUsersPublic(
  uid: string,
  data: Record<string, unknown>,
  context: string
) {
  try {
    await setDoc(doc(db, "users_public", uid), data, { merge: true });
  } catch (err: any) {
    if (err?.code === "permission-denied") return;
    console.warn(`[${context}] sync users_public/${uid} fallita:`, err);
  }
}

export async function deleteUsersPublic(uid: string, context: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, "users_public", uid));
    return true;
  } catch (err: any) {
    if (err?.code === "permission-denied") return false;
    console.warn(`[${context}] delete users_public/${uid} fallita:`, err);
    return false;
  }
}
