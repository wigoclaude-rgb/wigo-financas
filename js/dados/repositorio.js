/* ══════════ REPOSITÓRIO ══════════
   Liga o livro (memória) ao Firestore (servidor).

   Estrutura, tudo abaixo do próprio usuário:
     users/{uid}                    ← o JSON do 2.2 continua aqui, intocado
     users/{uid}/contas/{id}        parceiros, categorias, cartoes, documentos,
     users/{uid}/pagamentos/{id}    lancamentos, recorrencias, importacoes,
     users/{uid}/meta/{id}          extrato, conciliacoes, auditoria

   Nada de documento gigante: cada documento financeiro é um registro, e uma
   operação grava só o que mudou.

   GRAVAR é tudo ou nada: a Mudanca inteira vai num writeBatch. Ela é aplicada
   na memória antes (a tela responde na hora) e, se o servidor recusar, é
   desfeita — "Nenhuma alteração foi aplicada" é literalmente verdade.

   CARREGAR é incremental: lê primeiro o cache do aparelho e depois pede ao
   servidor só os registros com _ts depois da última visita. Sem isso, cada
   login leria milhares de documentos (e a cota gratuita do Firestore é de
   50 mil leituras por dia). Nada financeiro é apagado, então "o que mudou"
   sempre aparece nessa consulta. */

import { db, doc, getDoc, getDocFromCache, collection, getDocs, getDocsFromCache, query, where, writeBatch, serverTimestamp, Timestamp } from "./firebase.js";
import { COLECOES } from "../financas/livro.js";
import { migrarLegado, temLegado, VERSAO_DADOS } from "./migracao.js";
import { novoId } from "../nucleo/ids.js";
import { adicionarCategoriasSugeridas } from "../financas/comandos.js";

const LIMITE_LOTE=450;           // o Firestore aceita 500 escritas por batch
const LOTE_MIGRACAO=200;         // lotes menores: progresso visível e pedidos mais leves
const PRAZO=()=>globalThis.__prazoGravacao||45000;   // os testes encurtam o prazo

/* O Firestore trata alguns erros como passageiros (cota diária do plano
   gratuito estourada, servidor ocupado, conexão ruim) e tenta de novo para
   sempre, sem avisar: a gravação fica pendurada e a tela, parada. Depois do
   prazo, avisamos — sem desistir, porque a gravação ainda pode passar. */
async function comAviso(p,aoDemorar,ms=PRAZO()){
  const t=setTimeout(()=>{ console.warn("[WIGO] o Firebase não confirmou a gravação em "+ms/1000+" s"); aoDemorar&&aoDemorar(); },ms);
  try{ return await p; } finally{ clearTimeout(t); }
}
const CARREGAR=COLECOES;         // auditoria fica fora: é lida sob demanda

const ref=(uid,col,id)=>doc(db,"users",uid,col,id);
const colRef=(uid,col)=>collection(db,"users",uid,col);
const chaveSync=uid=>"wigo3.sync."+uid;

/* Firestore não guarda o Timestamp de volta como o gravamos; limpar os
   campos técnicos deixa o livro só com dado de negócio */
function limpar(d){ const {_ts,_mig,...resto}=d; return resto; }

export class Repositorio{
  constructor(livro,{aoMudarEstado}={}){ this.L=livro; this.uid=null; this.pendentes=0; this.aoMudarEstado=aoMudarEstado||(()=>{}); }

  async carregar(uid,{aoMigrar}={}){
    this.uid=uid; let nova=false;
    /* Migração concluída não volta atrás: se o aparelho já sincronizou e o
       cache diz CONCLUIDA, não precisa perguntar ao servidor — era uma ida
       e volta a mais em toda abertura. */
    let marca=null, ultima=0;
    try{ ultima=+localStorage.getItem(chaveSync(uid))||0; }catch{}
    if(ultima){ try{ marca=await getDocFromCache(ref(uid,"meta","migracao")); }catch{ marca=null; } }
    if(!(marca&&marca.exists()&&marca.data().status==="CONCLUIDA"))
      marca=await getDoc(ref(uid,"meta","migracao")).catch(e=>{ throw traduzir(e); });
    const status=marca.exists()?marca.data().status:null;
    if(status!=="CONCLUIDA"){
      const legado=await getDoc(doc(db,"users",uid)).catch(e=>{ throw traduzir(e); });
      const json=legado.exists()?legado.data().data:null;
      if(status==="EM_ANDAMENTO") await this.limparTentativa(marca.data().tentativa);
      if(temLegado(json)){
        aoMigrar&&aoMigrar("inicio");
        const r=await this.migrar(json,(f,info)=>aoMigrar&&aoMigrar(f,info));
        aoMigrar&&aoMigrar("fim",r);
        return {migrou:true,relatorio:r};
      }
      /* conta nova, ou 2.2 vazio: marca e segue */
      const b=writeBatch(db);
      b.set(ref(uid,"meta","migracao"),{id:"migracao",status:"CONCLUIDA",versao:VERSAO_DADOS,origem:json?"2.2-vazio":"nova",em:new Date().toISOString(),_ts:serverTimestamp()});
      await b.commit(); nova=true;
    }
    await this.sincronizar();
    /* conta nova já nasce com as categorias sugeridas: sem categoria nenhuma,
       o formulário e a importação não têm o que sugerir */
    if(nova&&!this.L.categorias.size){ const m=adicionarCategoriasSugeridas(this.L);
      if(!m.vazia) await this.gravar(m).catch(e=>console.warn("[WIGO] categorias sugeridas:",e)); }
    return {migrou:false};
  }

  /* cache do aparelho + o que mudou no servidor desde a última vez.
     As coleções vão TODAS AO MESMO TEMPO: uma depois da outra eram 12 idas
     e voltas ao servidor em fila — no celular, 4 a 6 segundos para abrir
     mesmo sem nada novo. Juntas, custam o tempo de uma. */
  async sincronizar(){
    const uid=this.uid, dados={};
    let ultima=0; try{ ultima=+localStorage.getItem(chaveSync(uid))||0; }catch{}
    let maior=ultima;
    /* cache frio (aparelho novo, dados do navegador limpos): lê tudo */
    let quente=false;
    if(ultima){ try{ quente=(await getDocsFromCache(colRef(uid,"meta"))).size>0; }catch{ quente=false; } }
    await Promise.all(CARREGAR.map(async col=>{
      const mapa=new Map();
      let doCache=false;
      if(quente){
        try{ const s=await getDocsFromCache(colRef(uid,col)); s.forEach(d=>mapa.set(d.id,d.data())); doCache=true; }
        catch{ doCache=false; mapa.clear(); }
      }
      const q=doCache?query(colRef(uid,col),where("_ts",">",Timestamp.fromMillis(ultima))):colRef(uid,col);
      const s=await getDocs(q).catch(e=>{ throw traduzir(e); });
      s.forEach(d=>{ const v=d.data(); mapa.set(d.id,v); const ms=v._ts?.toMillis?.()||0; if(ms>maior) maior=ms; });
      dados[col]=[...mapa.values()].map(limpar);
    }));
    this.L.carregar(dados);
    try{ if(maior) localStorage.setItem(chaveSync(uid),String(maior)); }catch{}
  }

  /* Migração: grava em lotes, todos marcados com a tentativa. A marca
     EM_ANDAMENTO vai primeiro; CONCLUIDA, por último. Se cair no meio, a
     próxima abertura apaga o que essa tentativa gravou e recomeça — nada da
     tentativa quebrada fica misturado com os dados. */
  async migrar(json,avisar=()=>{}){
    const uid=this.uid, tentativa=novoId("t");
    const S=JSON.parse(json);
    const {livro,relatorio}=migrarLegado(S);
    const ini=writeBatch(db);
    ini.set(ref(uid,"meta","migracao"),{id:"migracao",status:"EM_ANDAMENTO",tentativa,versao:VERSAO_DADOS,em:new Date().toISOString(),_ts:serverTimestamp()});
    const tudo=[];
    for(const col of COLECOES) for(const d of livro[col].values()) tudo.push({col,d});
    const total=tudo.length; let feitos=0;
    const lento=()=>avisar("lento",{feitos,total});
    avisar("progresso",{feitos,total});
    await comAviso(ini.commit().catch(e=>{ throw traduzir(e); }),lento);
    for(let i=0;i<tudo.length;i+=LOTE_MIGRACAO){
      const b=writeBatch(db), parte=tudo.slice(i,i+LOTE_MIGRACAO);
      for(const {col,d} of parte) b.set(ref(uid,col,d.id),{...d,_mig:tentativa,_ts:serverTimestamp()});
      await comAviso(b.commit().catch(e=>{ throw traduzir(e); }),lento);
      feitos+=parte.length; avisar("progresso",{feitos,total});
    }
    const fimB=writeBatch(db);
    fimB.set(ref(uid,"meta","migracao"),{id:"migracao",status:"CONCLUIDA",tentativa,versao:VERSAO_DADOS,origem:"2.2",
      em:new Date().toISOString(),relatorio,_ts:serverTimestamp()});
    fimB.set(ref(uid,"auditoria",novoId("h")),{acao:"MIGRAR",entidade:"sistema",entidadeId:uid,em:new Date().toISOString(),
      resumo:"Dados do WIGO 2.2 migrados: "+relatorio.contagem.documentos+" documentos, "+relatorio.contagem.pagamentos+" pagamentos",
      mudancas:[],_ts:serverTimestamp()});
    await comAviso(fimB.commit().catch(e=>{ throw traduzir(e); }),lento);
    this.L.carregar(livro.exportar());
    /* a marca CONCLUIDA foi a última gravação: o _ts dela cobre tudo que a
       migração gravou. Sem guardar isso, a próxima abertura leria de novo
       todos os documentos do servidor. */
    try{ const m=await getDoc(ref(uid,"meta","migracao")); const ms=m.data()?._ts?.toMillis?.();
      if(ms) localStorage.setItem(chaveSync(uid),String(ms)); }catch{}
    return relatorio;
  }
  async limparTentativa(tentativa){
    if(!tentativa) return;
    const uid=this.uid;
    for(const col of [...COLECOES,"auditoria"]){
      const s=await getDocs(query(colRef(uid,col),where("_mig","==",tentativa)));
      let b=writeBatch(db), n=0;
      for(const d of s.docs){ b.delete(d.ref); if(++n>=LIMITE_LOTE){ await b.commit(); b=writeBatch(db); n=0; } }
      if(n) await b.commit();
    }
  }

  /* Grava uma Mudanca. Aplica na memória, grava, e desfaz se recusar. */
  async gravar(mudanca){
    if(!mudanca||mudanca.vazia) return;
    const antes=this.L.aplicar(mudanca);
    this.pendentes++; this.aoMudarEstado(this.estado());
    const lotes=dividir(mudanca);
    let gravados=0;
    try{
      for(const lote of lotes){
        const b=writeBatch(db);
        for(const g of lote) b.set(ref(this.uid,g.colecao,g.id),{...g.dados,_ts:serverTimestamp()});
        await comAviso(b.commit(),()=>this.aoMudarEstado("lento"));
        gravados++;
      }
    }catch(e){
      if(gravados===0){ this.L.desfazer(antes); throw traduzir(e,"Nenhuma alteração foi aplicada."); }
      /* lote grande (importação) cortado no meio: cada linha foi gravada
         inteira ou não foi; recarrega do servidor para mostrar o que entrou */
      await this.sincronizar().catch(()=>{});
      throw traduzir(e,"Parte foi gravada ("+gravados+" de "+lotes.length+" blocos); nenhuma linha ficou pela metade. Confira e importe de novo o que faltou — o que já entrou será reconhecido.");
    }finally{ this.pendentes--; this.aoMudarEstado(this.estado()); }
  }
  estado(){ return this.pendentes?"salvando":"ok"; }

  async historico(ids){
    const out=[];
    for(let i=0;i<ids.length;i+=30){
      const s=await getDocs(query(colRef(this.uid,"auditoria"),where("entidadeId","in",ids.slice(i,i+30))));
      s.forEach(d=>out.push(limpar(d.data())));
    }
    return out.sort((a,b)=>a.em<b.em?-1:1);
  }
  async relatorioMigracao(){
    const s=await getDoc(ref(this.uid,"meta","migracao")); return s.exists()?s.data().relatorio||null:null;
  }
  /* restaurar backup: só numa conta vazia — sobrescrever dados vivos com um
     arquivo seria apagar histórico */
  async restaurar(backup){
    const temAlgo=["documentos","pagamentos","contas"].some(c=>this.L[c].size);
    if(temAlgo) throw new Error("Restaurar só é possível numa conta sem dados. Esta já tem registros.");
    const tudo=[]; for(const col of COLECOES) for(const d of (backup[col]||[])) tudo.push({col,d});
    for(let i=0;i<tudo.length;i+=LIMITE_LOTE){ const b=writeBatch(db);
      for(const {col,d} of tudo.slice(i,i+LIMITE_LOTE)) b.set(ref(this.uid,col,d.id),{...d,_ts:serverTimestamp()});
      await b.commit(); }
    await this.sincronizar();
  }
}

/* divide pelos marcos da importação (fronteira entre linhas) quando passa do
   limite do batch; contadores e o lote vão no primeiro bloco */
function dividir(m){
  const g=m.gravar;
  if(g.length<=LIMITE_LOTE) return [g];
  const primeiro=g.filter(x=>x.colecao==="meta"||x.colecao==="importacoes");
  const resto=g.filter(x=>x.colecao!=="meta"&&x.colecao!=="importacoes");
  const marcos=(m.marcos||[]).length?m.marcos:null;
  const lotes=[]; let atual=[...primeiro];
  if(!marcos){ for(let i=0;i<resto.length;i+=LIMITE_LOTE) lotes.push(resto.slice(i,i+LIMITE_LOTE)); lotes[0]=[...primeiro,...(lotes[0]||[])]; return lotes; }
  /* reconstrói os grupos por linha a partir das posições originais */
  let ini=0; const grupos=[];
  for(const fim of marcos){ grupos.push(g.slice(ini,fim).filter(x=>x.colecao!=="meta"&&x.colecao!=="importacoes")); ini=fim; }
  grupos.push(g.slice(ini).filter(x=>x.colecao!=="meta"&&x.colecao!=="importacoes"));
  for(const gr of grupos){
    if(atual.length+gr.length>LIMITE_LOTE&&atual.length){ lotes.push(atual); atual=[]; }
    atual.push(...gr);
  }
  if(atual.length) lotes.push(atual);
  return lotes;
}

export function traduzir(e,extra){
  const code=e&&e.code||"";
  let msg;
  if(code==="permission-denied") msg="O servidor recusou a gravação (permissão). As regras do Firestore precisam ser atualizadas para a versão 3 — ver firestore.rules.";
  else if(code==="unavailable") msg="Sem conexão com o servidor.";
  else if(code==="resource-exhausted") msg="Cota do Firestore esgotada por hoje.";
  else msg=e&&e.message||String(e);
  const err=new Error(msg+(extra?" "+extra:"")); err.code=code; err.original=e;
  return err;
}
export { dividir };
