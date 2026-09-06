// ════════════════════════════════════════════════════════
// firebase.js — Firebase-oppsett og delte samlingsreferanser
//
// Bruker SAMME Firebase-prosjekt som klubbens andre apper
// (Stafettligaen/Mesteren), slik at Botkassa kan lese den
// ekte, delte spillerlisten fra "players"-samlingen.
// ════════════════════════════════════════════════════════
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, doc, addDoc, updateDoc, setDoc, deleteDoc,
  getDoc, getDocs, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, increment, writeBatch, arrayUnion, arrayRemove,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const FB_CONFIG = {
  apiKey:            'AIzaSyB_0rxDzHpV2HB6JdHm8SEHoGc8vE2F_rE',
  authDomain:        'pickle-rank-5fbe5.firebaseapp.com',
  projectId:         'pickle-rank-5fbe5',
  storageBucket:     'pickle-rank-5fbe5.firebasestorage.app',
  messagingSenderId: '761601873916',
  appId:             '1:761601873916:web:f3c13d21e809658fd80479',
};

let db;
try {
  const fbApp = initializeApp(FB_CONFIG);
  db = getFirestore(fbApp);
} catch (e) {
  console.error('[Firebase] Kunne ikke koble til:', e?.message ?? e);
}

export { db };
export {
  collection, doc, addDoc, updateDoc, setDoc, deleteDoc,
  getDoc, getDocs, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, increment, writeBatch, arrayUnion, arrayRemove,
};
