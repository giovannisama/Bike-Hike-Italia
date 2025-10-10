// src/services/participants.ts
import { auth, db } from '../firebase';
import {
  collection, doc, serverTimestamp, setDoc, deleteDoc,
  query, orderBy, onSnapshot, getDoc
} from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';

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

  const name = user.displayName || `Utente ${user.uid.slice(0, 6)}`;
  if (!user.displayName) {
    try { await updateProfile(user, { displayName: name }); } catch {}
  }

  const pRef = participantDoc(rideId, user.uid);
  const prev = await getDoc(pRef);

  await setDoc(pRef, {
    uid: user.uid,
    name,
    note,
    createdAt: prev.exists() ? prev.data()?.createdAt : serverTimestamp(),
  }, { merge: true });
}

export async function leaveRide(rideId: string) {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  await deleteDoc(participantDoc(rideId, user.uid));
}

export function listenParticipants(rideId: string, cb: (items: Participant[]) => void) {
  const qy = query(participantsCol(rideId), orderBy('createdAt', 'asc'));
  return onSnapshot(qy, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Participant));
    cb(items);
  });
}
