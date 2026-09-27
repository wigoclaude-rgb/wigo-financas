/* Firebase: a única dependência externa do app, por URL — sem build, sem npm.
   O firebaseConfig é público de propósito (ver CLAUDE.md): quem protege os
   dados são as regras do Firestore, não o sigilo desta chave. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider,
  GoogleAuthProvider, signInWithPopup, linkWithPopup, linkWithCredential, useDeviceLanguage }
  from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, collection,
  getDocs, getDocsFromCache, query, where, writeBatch, serverTimestamp, Timestamp }
  from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig={
  apiKey:"AIzaSyAJ7sgAbqureV0nXJC2gJx-eLgvJEXAgtk",
  authDomain:"app-fin-ebcfe.firebaseapp.com",
  projectId:"app-fin-ebcfe",
  storageBucket:"app-fin-ebcfe.firebasestorage.app",
  messagingSenderId:"818792543053",
  appId:"1:818792543053:web:f198549efd9c53826b7d04"
};
export const app=initializeApp(firebaseConfig);
export const auth=getAuth(app);
useDeviceLanguage(auth);   // a janela do Google aparece no idioma do aparelho
/* Cache local persistente: o app abre com o que já tem no aparelho e busca
   no servidor só o que mudou (ver repositorio.js). ignoreUndefinedProperties
   porque campo opcional ausente é normal no modelo. */
let _db;
try{ _db=initializeFirestore(app,{ignoreUndefinedProperties:true,
  localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})}); }
catch(e){ _db=initializeFirestore(app,{ignoreUndefinedProperties:true}); }
export const db=_db;
export { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail,
  signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider,
  GoogleAuthProvider, signInWithPopup, linkWithPopup, linkWithCredential,
  doc, getDoc, collection, getDocs, getDocsFromCache, query, where, writeBatch, serverTimestamp, Timestamp };
