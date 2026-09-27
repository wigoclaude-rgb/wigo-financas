/* Auth simulado: window.__usuario define quem está logado ao abrir. */
let ouvinte=null;
const usuario=()=>window.__usuario||null;
/* como no Firebase: auth.currentUser é quem está logado agora */
const AUTH={ get currentUser(){ return window.__usuario||null; } };
export function getAuth(){ return AUTH; }
export function onAuthStateChanged(auth,fn){ ouvinte=fn; setTimeout(()=>fn(usuario()),0); return ()=>{}; }
export async function signInWithEmailAndPassword(a,email,senha){
  if(senha==="errada"){ const e=new Error("x"); e.code="auth/invalid-credential"; throw e; }
  window.__usuario={uid:"u1",email,providerData:[{providerId:"password"}]}; ouvinte&&ouvinte(window.__usuario); return {user:window.__usuario}; }
export async function createUserWithEmailAndPassword(a,email){ window.__usuario={uid:"u-novo",email}; ouvinte&&ouvinte(window.__usuario); return {user:window.__usuario}; }
export async function sendPasswordResetEmail(){ }
export async function signOut(){ window.__usuario=null; ouvinte&&ouvinte(null); }
export async function updatePassword(){ } export async function reauthenticateWithCredential(){ }
export const EmailAuthProvider={credential:()=>({})};
export function useDeviceLanguage(){}
/* Google simulado. window.__googleConflito = o e-mail já tem conta com senha
   e não é do Google; window.__googleErro = código de erro a devolver. */
export class GoogleAuthProvider{ setCustomParameters(){} static credentialFromError(e){ return e.__cred||null; } }
const erro=(code,extra={})=>Object.assign(new Error(code),{code},extra);
const comGoogle=u=>{ u.providerData=[...(u.providerData||[]).filter(p=>p.providerId!=="google.com"),{providerId:"google.com"}]; return u; };
export async function signInWithPopup(){
  if(window.__googleErro) throw erro(window.__googleErro);
  if(window.__googleConflito) throw erro("auth/account-exists-with-different-credential",{customData:{email:window.__googleConflito},__cred:{google:true}});
  window.__usuario={uid:"u-google",email:"voce@gmail.com",providerData:[{providerId:"google.com"}]}; ouvinte&&ouvinte(window.__usuario); return {user:window.__usuario}; }
export async function linkWithCredential(u,cred){ if(!cred) throw erro("auth/argument-error"); window.__vinculado=true; return {user:comGoogle(u)}; }
export async function linkWithPopup(u){ if(window.__googleErro) throw erro(window.__googleErro); window.__vinculado=true; return {user:comGoogle(u)}; }
