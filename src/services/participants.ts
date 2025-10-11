// src/services/participants.ts
import { auth, db } from '../firebase';
import {
  collection, doc, serverTimestamp, setDoc, deleteDoc,
  query, orderBy, onSnapshot, getDoc
} from 'firebase/firestore';

export type Participant = {
  uid: string;
  name: string;
  note?: string;
  createdAt: any;
};

export function participantsCol(rideId: string) {
  return collection(db, 'rides', rideId, 'participants');
}

export function participantDoc(rideId: string, uid: string) {
  return doc(db, 'rides', rideId, 'participants', uid);
}

export async function joinRide(rideId: string, note: string = '') {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');

  // 1) Leggi il profilo utente da Firestore
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  const u = userSnap.exists() ? (userSnap.data() as any) : {};

  // 2) Costruisci il nome nel formato "Cognome, Nome"
  //    Proviamo più alias comuni per compatibilità (surname/lastName/cognome, name/firstName/nome)
  const surname = u?.surname ?? u?.lastName ?? u?.cognome ?? '';
  const firstName = u?.name ?? u?.firstName ?? u?.nome ?? '';
  let display = `${String(surname).trim()}`;
  if (String(firstName).trim()) display = `${display}, ${String(firstName).trim()}`;

  // Se mancano nome e cognome, prova a derivarli dal displayName
  if ((!surname || !firstName) && u?.displayName) {
    const parts = String(u.displayName).trim().split(/\s+/);
    if (parts.length >= 2) {
      const last = parts.pop() as string;
      const first = parts.join(' ');
      display = `${last}, ${first}`;
    } else if (parts.length === 1) {
      display = parts[0];
    }
  }
  // 3) Fallback se mancano i dati nel profilo
  if (!display || display === ',') {
    display = `Utente ${user.uid.slice(0, 6)}`;
  }

  const pRef = participantDoc(rideId, user.uid);
  const prev = await getDoc(pRef);

  await setDoc(
    pRef,
    {
      uid: user.uid,
      name: display,            // "Cognome, Nome"
      displayName: display,     // compatibilità
      nickname: display,        // forza la UI esistente a mostrare "Cognome, Nome"
      note,
      createdAt: prev.exists() ? prev.data()?.createdAt : serverTimestamp(),
    },
    { merge: true }
  );
}

export async function leaveRide(rideId: string) {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  await deleteDoc(participantDoc(rideId, user.uid));
}

export function listenParticipants(rideId: string, cb: (items: Participant[]) => void) {
  const qy = query(participantsCol(rideId), orderBy('createdAt', 'asc'));
  return onSnapshot(qy, snap => {
    const items = snap.docs.map(d => {
      const raw = d.data() as any;

      // Calcola il nome visuale preferendo già il campo "name" (Cognome, Nome)
      let name = raw?.name as string | undefined;

      // Fallback: prova da displayName/nickname e prova a convertirlo in "Cognome, Nome" se possibile
      if (!name) {
        const dn = (raw?.displayName || raw?.nickname || '').toString().trim();
        if (dn) {
          const parts = dn.split(/\s+/);
          if (parts.length >= 2) {
            const last = parts.pop() as string;
            const first = parts.join(' ');
            name = `${last}, ${first}`;
          } else {
            name = dn; // un'unica parola: mostrala così com'è
          }
        }
      }

      if (!name) name = `Utente ${String(d.id).slice(0,6)}`;

      // IMPORTANTE: sovrascrivo i campi *di ritorno* (non nel DB) per compatibilità con UI legacy
      return {
        id: d.id,
        ...raw,
        name,                // sempre "Cognome, Nome" se disponibile
        displayName: name,   // vecchie UI che leggono displayName
        nickname: name,      // vecchie UI che leggono nickname
      } as any; // permettiamo campi extra
    });
    cb(items);
  });
}
