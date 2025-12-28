import { useEffect, useState } from "react";
import { collection, getCountFromServer, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

export default function useActiveSocialCount() {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const loadCount = async () => {
      const q = query(collection(db, "social_events"), where("status", "==", "active"));
      try {
        const snap = await getCountFromServer(q);
        if (!cancelled) setCount(snap.data().count ?? 0);
      } catch {
        try {
          const snap = await getDocs(q);
          if (!cancelled) setCount(snap.size);
        } catch {
          if (!cancelled) setCount(0);
        }
      }
    };
    loadCount();
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}
