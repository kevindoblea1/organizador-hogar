// firebase.js — inicialización Firebase con CDN (v12.3.0)

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously,
  signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, query, where,
  addDoc, updateDoc, deleteDoc, setDoc, orderBy, limit
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Tu configuración (la misma que te dio la consola)
const firebaseConfig = {
  apiKey: "AIzaSyDgQbaSFuP47o_rzA7PgyfmqO1VDAAe4IQ",
  authDomain: "matrimonio-aef95.firebaseapp.com",
  projectId: "matrimonio-aef95",
  storageBucket: "matrimonio-aef95.firebasestorage.app",
  messagingSenderId: "978237070425",
  appId: "1:978237070425:web:969d315955bbf348e36548",
  // measurementId es opcional; Analytics no lo usamos en esta app
  // measurementId: "G-6J7YS27EJV"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// ID del hogar (puedes cambiarlo cuando quieras)
export const HOGAR_ID = "hogar-principal";

// Re-export de utilidades que usa main.js
export {
  onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut,
  collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc,
  deleteDoc, setDoc, orderBy, limit
};

console.info("[firebase] conectado a", app.options.projectId);
