/* ══════════ COMPONENTES ══════════
   Peças de tela sem estado: formatação, chip de situação, KPI, tabela que
   vira cartão no celular, estado vazio e os gráficos em SVG. */
import { h, raw, juntar, attr } from "./html.js";
import { ic } from "./icones.js";
import { formatar } from "../nucleo/dinheiro.js";
import { fmtData, fmtDataCurta, rotuloMesCurto, rotuloMes } from "../nucleo/datas.js";
import { ROTULO_ST } from "../financas/modelo.js";

export { formatar, fmtData, fmtDataCurta, rotuloMes, rotuloMesCurto };
export const I=(n,cls)=>raw(ic(n,cls));
export const R=v=>formatar(v);
export const Rs=v=>formatar(v,{sinal:true});
/* valor com sinal e cor: entrada verde, saída vermelha */
export const valorCor=(v,{sinal=true}={})=>h`<span class="${v>0?"up":v<0?"down":""}">${sinal?Rs(v):R(v)}</span>`;

const ROTULO_EXTRA={FECHADA:"Fechada",VAZIA:"Sem compras",CONCILIADA:"Conciliada",NOVA:"Nova",DUPLICADA:"Já importada",
  NO_APP:"Já no app",QUITA:"Quita conta",FATURA:"Paga fatura",POSSIVEL:"Confira",ERRO:"Erro",IGNORADA:"Ignorada",LANCADA:"Lançada",ESTORNADO:"Estornado"};
export const chipSt=(st,extra="")=>h`<span class="chip ${st}">${ROTULO_ST[st]||ROTULO_EXTRA[st]||st}${extra}</span>`;
export const chip=(txt,cls="")=>h`<span class="chip nb ${cls}">${txt}</span>`;
/* conta a receber fala em "recebida", não em "paga" */
const ROTULO_RECEBER={PAGA:"Recebida",PARCIAL:"Parcialmente recebida"};
export const chipStLado=(st,receber)=>receber&&ROTULO_RECEBER[st]?h`<span class="chip ${st}">${ROTULO_RECEBER[st]}</span>`:chipSt(st);

export function kpi({rotulo,valor,sub="",icone,cls="",acao,v,p,tom=""}){
  return h`<div class="card kpi ${acao?"tap":""} ${cls}"${attr("data-a",acao)}${attr("data-v",v)}${attr("data-p",p)}>
    <span class="cap">${icone?I(icone,"p"):""}${rotulo}</span><b class="${tom}">${valor}</b>${sub?h`<span class="s">${sub}</span>`:""}</div>`;
}
export function vazio({icone="search",titulo,texto="",acoes=""}){
  return h`<div class="vazio"><div class="bola">${I(icone)}</div><div class="t">${titulo}</div>${texto}${acoes?h`<div class="btns">${acoes}</div>`:""}</div>`;
}
export function aviso(texto,{tipo="",icone="alert"}={}){ return h`<div class="aviso ${tipo}">${I(icone)}<div>${texto}</div></div>`; }

/* Tabela: colunas {rot, r (alinha à direita), oc (some no celular), cel(item)}.
   No celular vira uma lista de cartões — a primeira coluna com texto vira o
   título, as de valor ficam à direita, as marcadas `oc` somem. */
export function tabela({colunas,linhas,cel,clic,sel,marcaTodos,rodape,vazioTxt,classeLinha,cartoes=true}){
  if(!linhas.length) return vazio({titulo:vazioTxt||"Nada por aqui",texto:""});
  const temCk=!!sel;
  return h`<div class="tab-wrap"><table class="tab ${cartoes?"cartoes":""}">
    <thead><tr>${temCk?h`<th style="width:34px"><button class="ck ${marcaTodos?.on?"on":""}" data-a="${marcaTodos?.acao}" aria-label="Marcar todos"></button></th>`:""}
      ${juntar(colunas,c=>h`<th class="${c.r?"r":""} ${c.soCel?"cel-only":""}">${c.rot}</th>`)}</tr></thead>
    <tbody>${juntar(linhas,(x,i)=>{
      const s=sel?sel(x):null;
      return h`<tr class="${clic?"clic":""} ${s?.on?"sel":""} ${temCk?"comck":""} ${classeLinha?classeLinha(x):""}"${clic?raw(clic(x)):""}>
        ${temCk?h`<td class="ckc"><button class="ck ${s.on?"on":""}" data-a="${s.acao}" data-id="${s.id}" aria-label="Selecionar"></button></td>`:""}
        ${juntar(colunas,c=>h`<td class="${c.r?"r":""} ${c.oc?"oc":""} ${c.nw?"nw":""} ${c.soCel?"cel-only":""}"${c.cartao?attr("data-r",c.cartao):""}>${c.cel(x)}</td>`)}</tr>`;
    })}</tbody>
    ${rodape?h`<tfoot><tr>${temCk?h`<td></td>`:""}${rodape}</tr></tfoot>`:""}
  </table></div>`;
}

/* ── GRÁFICOS ──
   SVG simples: colunas com topo arredondado (4px) e base reta, 2px de
   respiro entre colunas vizinhas, linhas de grade finas, rótulo só no que
   importa e dica ao passar o mouse. Cor de série só na marca — texto usa a
   tinta normal. Toda tela com gráfico tem a tabela ao lado ou embaixo. */
const esc2=s=>String(s).replace(/"/g,"&quot;");
function escala(min,max){
  if(min===max){ max=min+1; }
  const bruto=(max-min)/4, pot=Math.pow(10,Math.floor(Math.log10(Math.abs(bruto)||1)));
  const passo=[1,2,2.5,5,10].map(m=>m*pot).find(p=>p>=bruto)||bruto;
  const lo=Math.floor(min/passo)*passo, hi=Math.ceil(max/passo)*passo;
  const ticks=[]; for(let v=lo;v<=hi+passo/2;v+=passo) ticks.push(Math.round(v));
  return {lo,hi,ticks};
}
const compacto=c=>{ const r=c/100, a=Math.abs(r);
  if(a>=1e6) return (r/1e6).toLocaleString("pt-BR",{maximumFractionDigits:1})+" mi";
  if(a>=1e3) return (r/1e3).toLocaleString("pt-BR",{maximumFractionDigits:1})+" mil";
  return r.toLocaleString("pt-BR",{maximumFractionDigits:0}); };
function colunaPath(x,y0,y1,w){
  /* topo arredondado na ponta do dado, base reta na linha de base */
  const r=Math.min(4,w/2,Math.abs(y1-y0));
  if(y1<y0) return `M${x},${y0}V${y1+r}Q${x},${y1} ${x+r},${y1}H${x+w-r}Q${x+w},${y1} ${x+w},${y1+r}V${y0}Z`;
  return `M${x},${y0}V${y1-r}Q${x},${y1} ${x+r},${y1}H${x+w-r}Q${x+w},${y1} ${x+w},${y1-r}V${y0}Z`;
}
/* séries: [{nome, cor ("--serie1"), valores:[...]}] · rotulos: [...] · empilhar: bool */
export function graficoColunas({rotulos,series,empilhar=false,altura=220,destaque=null,dicaExtra}){
  const W=640,H=altura,E=48,B=26,T=10,D=8;
  const somas=rotulos.map((_,i)=>empilhar?series.reduce((s,x)=>s+Math.max(0,x.valores[i]),0):Math.max(...series.map(x=>x.valores[i])));
  const mins=rotulos.map((_,i)=>empilhar?series.reduce((s,x)=>s+Math.min(0,x.valores[i]),0):Math.min(...series.map(x=>x.valores[i])));
  const {lo,hi,ticks}=escala(Math.min(0,...mins),Math.max(0,...somas));
  const y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo));
  const banda=(W-E-D)/rotulos.length;
  const nS=empilhar?1:series.length, gap=2;
  const larg=Math.min(24,(banda*0.62-(nS-1)*gap)/nS);
  const grupo=nS*larg+(nS-1)*gap;
  let s=`<svg class="graf" viewBox="0 0 ${W} ${H}" role="img">`;
  for(const t of ticks){ s+=`<line class="${t===0?"eixo":"grid"}" x1="${E}" x2="${W-D}" y1="${y(t)}" y2="${y(t)}"/>`;
    s+=`<text x="${E-8}" y="${y(t)+4}" text-anchor="end">${compacto(t)}</text>`; }
  rotulos.forEach((r,i)=>{
    const x0=E+i*banda+(banda-grupo)/2;
    let pos=0,neg=0;
    const partes=[];
    series.forEach((se,j)=>{
      const v=se.valores[i]; if(!v&&v!==0) return;
      let a,b,x;
      if(empilhar){ x=x0; if(v>=0){ a=pos; b=pos+v; pos=b; } else { a=neg; b=neg+v; neg=b; } }
      else { x=x0+j*(larg+gap); a=0; b=v; }
      if(v===0) return;
      const ya=y(a), yb=y(b);
      /* respiro de 2px entre segmentos empilhados */
      const ajuste=empilhar&&a!==0?(v>0?-gap:gap):0;
      partes.push(`<path class="marca" fill="var(${se.cor})" d="${colunaPath(x,ya+ajuste,yb,larg)}"/>`);
    });
    const dica=`<b>${r}</b><br>`+series.map(se=>`<i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(${se.cor});margin-right:6px"></i>${se.nome}: <b>${formatar(se.valores[i]||0)}</b>`).join("<br>")+(dicaExtra?dicaExtra(i):"");
    s+=`<g>${partes.join("")}<rect class="alvo" x="${E+i*banda}" y="${T}" width="${banda}" height="${H-T-B}" data-dica="${esc2(dica)}"/></g>`;
    s+=`<text x="${E+i*banda+banda/2}" y="${H-8}" text-anchor="middle"${destaque===i?' style="fill:var(--ink);font-weight:650"':""}>${r}</text>`;
  });
  s+=`</svg>`;
  const leg=series.length>1?`<div class="legenda">${series.map(se=>`<span><i style="background:var(${se.cor})"></i>${se.nome}</span>`).join("")}</div>`:"";
  return raw(leg+s);
}
/* ranking horizontal de um valor só: uma cor, valor na ponta */
export function barrasRanking(itens,{cor="var(--serie1)",max,acao}={}){
  const m=max||Math.max(1,...itens.map(x=>Math.abs(x.valor)));
  /* nivel:1 = subcategoria, recuada e mais leve, logo abaixo da categoria */
  return h`<div class="rank">${juntar(itens,x=>h`<div class="${x.nivel?"rank-sub":""}${acao?" clic":""}"${acao?raw(' style="cursor:pointer" data-a="'+acao+'" data-id="'+x.id+'"'):""}>
    <span class="t" style="font-weight:${x.nivel?450:550};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.nome}</span>
    <span class="num" style="font-weight:600">${R(x.valor)}${x.sub?h` <span class="fraco peq">${x.sub}</span>`:""}</span>
    <div class="barra"><i style="width:${Math.max(1.5,Math.abs(x.valor)/m*100)}%;background:${cor}"></i></div></div>`)}</div>`;
}
/* dica flutuante única, alimentada por data-dica */
export function ligarDicas(){
  const d=document.createElement("div"); d.className="dica"; document.body.appendChild(d);
  document.addEventListener("mousemove",e=>{
    const el=e.target.closest&&e.target.closest("[data-dica]");
    if(!el){ d.classList.remove("on"); return; }
    d.innerHTML=el.getAttribute("data-dica"); d.classList.add("on");
    const w=d.offsetWidth, hh=d.offsetHeight;
    let x=e.clientX+14, y=e.clientY-hh-10;
    if(x+w>innerWidth-8) x=e.clientX-w-14; if(y<8) y=e.clientY+16;
    d.style.left=x+"px"; d.style.top=y+"px";
  });
}
