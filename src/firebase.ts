// firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { initializeAuth } from 'firebase/auth';
// @ts-ignore
import { getReactNativePersistence } from '@firebase/auth';
import { getStorage } from 'firebase/storage';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

// Configurazione del tuo progetto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAq3fdL3qs3NCgKz1dR87ktwRJZsjbfxmc",
  authDomain: "bike-hike-italia.firebaseapp.com",
  projectId: "bike-hike-italia",
  storageBucket: "bike-hike-italia.firebasestorage.app",
  messagingSenderId: "870653955499",
  appId: "1:870653955499:web:80178ca0d9ae142c8a56ee",
  measurementId: "G-VZ07C2CVFG"
};

// Inizializza Firebase
const app = initializeApp(firebaseConfig);

// Firestore (database)
export const db = getFirestore(app);

// Auth (gestione utenti)
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});
console.log('[firebase] auth initialized');

// Storage (file utente / tessere associative, ecc.)
export const storage = getStorage(app);
