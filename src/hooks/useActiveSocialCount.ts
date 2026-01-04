import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";

export default function useActiveSocialCount() {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    const q = query(collection(db, "social_events"), where("status", "==", "active"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setCount(snap.size);
      },
      (err) => {
        console.warn("useActiveSocialCount error", err);
        setCount(0);
      }
    );
    return () => unsub();
  }, []);

  return count;
}
