// firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

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
export const auth = getAuth(app);

// Login anonimo automatico (così ogni utente ha un uid)
signInAnonymously(auth).catch(console.error);
