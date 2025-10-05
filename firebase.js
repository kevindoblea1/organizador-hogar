// firebase.js  — inicialización Firebase (ESM)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, query, where,
  addDoc, updateDoc, deleteDoc, setDoc, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 🔧 Copia tu config desde la consola de Firebase (App Web → "Usar una etiqueta <script>")
const firebaseConfig = {
  apiKey:        "TU_API_KEY",
  authDomain:    "TU_AUTH_DOMAIN",
  projectId:     "TU_PROJECT_ID",
  storageBucket: "TU_STORAGE_BUCKET",
  messagingSenderId: "TU_SENDER_ID",
  appId:         "TU_APP_ID",
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// 👪 ID del hogar compartido (ponle el nombre que quieras)
export const HOGAR_ID = "hogar-principal";

// --- Helpers que usaremos en main.js ---
export {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, signInAnonymously,
  collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc,
  deleteDoc, setDoc, orderBy, limit
};
