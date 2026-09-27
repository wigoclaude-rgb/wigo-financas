/* Auth simulado: window.__usuario define quem está logado ao abrir. */
let ouvinte=null;
const usuario=()=>window.__usuario||null;
export function getAuth(){ return {}; }
export function onAuthStateChanged(auth,fn){ ouvinte=fn; setTimeout(()=>fn(usuario()),0); return ()=>{}; }
export async function signInWithEmailAndPassword(a,email,senha){
  if(senha==="errada"){ const e=new Error("x"); e.code="auth/invalid-credential"; throw e; }
  window.__usuario={uid:"u1",email}; ouvinte&&ouvinte(window.__usuario); return {user:window.__usuario}; }
export async function createUserWithEmailAndPassword(a,email){ window.__usuario={uid:"u-novo",email}; ouvinte&&ouvinte(window.__usuario); return {user:window.__usuario}; }
export async function sendPasswordResetEmail(){ }
export async function signOut(){ window.__usuario=null; ouvinte&&ouvinte(null); }
export async function updatePassword(){ } export async function reauthenticateWithCredential(){ }
export const EmailAuthProvider={credential:()=>({})};
