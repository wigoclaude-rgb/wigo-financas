/* Migração do JSON do 2.2 para o modelo novo, conferindo saldo a saldo.
   Rodar: node tests/migracao.test.mjs */
import { g, t, fim } from "./util.mjs";
import { perfil, rotuloTaxa } from "../js/financas/investimentos.js";
import { migrarLegado, temLegado, normData } from "../js/dados/migracao.js";
import { saldoLegado } from "../js/dados/legado.js";
import { verificar } from "../js/financas/integridade.js";
import { fatura } from "../js/financas/cartoes.js";
import { definirRelogio } from "../js/nucleo/datas.js";
import * as Rec from "../js/financas/recorrencias.js";

definirRelogio(()=>new Date(2026,8,27,12));
const tx=(id,o)=>Object.assign({id,gid:id,type:"exp",dest:null,desc:id,cat:"Mercado",method:"pix",cardId:null,ticketId:null,
  goalId:null,accId:"a1",pesId:null,kind:"avista",i:1,n:1,amount:10,due:"2026-09-01",comp:null,paid:false,payDate:null,payAmt:null},o);
const S={ appName:"WIGO", expCats:["Mercado","Aluguel","Outros","Assinaturas"], incCats:["Salário","Outros"],
  accounts:[{id:"a1",name:"Nubank",bank:"Nubank",type:"corrente",color:"#6C3BFF",opening:{amount:1000,month:"2026-08"}},
            {id:"a2",name:"Inter",bank:"Inter",type:"corrente",color:"#0f766e",opening:null},
            {id:"a3",name:"Tesouro",bank:"",type:"investimento",color:"#111",opening:{amount:5000,month:"2026-08"}}],
  people:[{id:"p1",name:"João",note:"vizinho"}],
  cards:[{id:"c1",bank:"Nubank",nick:"Roxinho",color:"#5b21b6",noLimit:false,limit:5000,closeDay:10,dueDay:17,accId:"a1"}],
  tickets:[{id:"k1",brand:"VR",name:"VR Refeição",color:"#b45309",monthly:600,day:1,overrides:{"2026-09":650}}],
  goals:[{id:"g1",name:"Viagem",bank:"",color:"#0f766e",goal:10000,monthly:500,cdi:100,showHome:true,
    moves:[{id:"mv1",date:"2026-07-15",amount:2000,kind:"in"},{id:"mv2",txId:"sv1",date:"2026-09-05",amount:500,kind:"in"}]}],
  tx:[
    tx("pre1",{desc:"Antes da abertura",amount:300,due:"2026-07-20",paid:true,payDate:"2026-07-20"}),
    tx("sal",{type:"inc",cat:"Salário",desc:"Salário",amount:5000,due:"2026-09-05",paid:true,payDate:"2026-09-05",method:"transferencia"}),
    tx("mer",{desc:"Mercado",amount:450.5,due:"2026-09-06",paid:true,payDate:"2026-09-06",pesId:"p1"}),
    tx("juros",{desc:"Boleto com juros",amount:100,due:"2026-09-02",paid:true,payDate:"2026-09-08",payAmt:103.2,method:"boleto"}),
    tx("aberto",{desc:"Conta a pagar",amount:80,due:"2026-10-10"}),
    tx("receber",{type:"inc",cat:"Outros",desc:"Freela",amount:700,due:"2026-10-01",pesId:"p1"}),
    tx("comp",{desc:"Adiantado",amount:50,due:"2026-09-10",comp:"2026-10",paid:true,payDate:"2026-09-10"}),
    /* compra 3x no cartão: parcela 1 paga na fatura de 17/08, 2 e 3 abertas */
    tx("cp1",{gid:"cp",kind:"parcelado",i:1,n:3,method:"cartao",cardId:"c1",accId:"a1",desc:"Geladeira",amount:300,due:"2026-08-17",paid:true,payDate:"2026-08-17"}),
    tx("cp2",{gid:"cp",kind:"parcelado",i:2,n:3,method:"cartao",cardId:"c1",accId:null,desc:"Geladeira",amount:300,due:"2026-09-17"}),
    tx("cp3",{gid:"cp",kind:"parcelado",i:3,n:3,method:"cartao",cardId:"c1",accId:null,desc:"Geladeira",amount:300,due:"2026-10-17"}),
    tx("cpx",{method:"cartao",cardId:"c1",accId:"a1",desc:"Farmácia",amount:40,due:"2026-08-17",paid:true,payDate:"2026-08-17"}),
    /* aluguel fixo sem fim */
    ...["2026-08-05","2026-09-05","2026-10-05","2026-11-05"].map((d,i)=>tx("al"+i,{gid:"al",kind:"fixo",i:i+1,n:0,perp:1,cat:"Aluguel",
      desc:"Aluguel",amount:1500,due:d,paid:i<2,payDate:i<2?d:null})),
    tx("xf",{type:"xfer",desc:"Para o Inter",accId:"a1",accTo:"a2",amount:200,due:"2026-09-12",paid:true,payDate:"2026-09-12",method:"transferencia"}),
    tx("sv1",{dest:"savings",goalId:"g1",cat:"Poupança",desc:"Poupança: Viagem",amount:500,due:"2026-09-05",paid:true,payDate:"2026-09-05",method:"transferencia"}),
    tx("sv2",{dest:"savings",goalId:"g1",cat:"Poupança",desc:"Poupança: Viagem",amount:500,due:"2026-10-05",method:"transferencia"}),
    tx("vr1",{method:"ticket",ticketId:"k1",accId:null,desc:"Almoço",cat:"Mercado",amount:35,due:"2026-09-03"}),
    tx("lixo",{desc:"Apagado",amount:999,due:"2026-09-01",paid:true,payDate:"2026-09-01",deleted:true,deletedAt:"2026-09-02T10:00:00Z"}),
    tx("orf",{desc:"Sem conta",accId:null,amount:25,due:"2026-09-15",paid:true,payDate:"2026-09-15"}),
    tx("zero",{desc:"Zerado",amount:0,due:"2026-09-15"})
  ]};

g("migração completa confere com o 2.2");
const {livro:L, relatorio:R}=migrarLegado(S);
for(const x of R.conferencia) t(x.item, x.depois, x.antes);
t("integridade", R.integridade, []);
t("relatório ok", R.ok, true);

g("o que virou o quê");
const docs=[...L.documentos.values()];
const por=d=>d.legado?.tx||[];
const geladeira=docs.find(d=>por(d).includes("cp1"));
t("compra 3x: um documento com 3 parcelas nas mesmas faturas", [geladeira.tipo, geladeira.parcelas.map(p=>p.fatura)], ["COMPRA_CARTAO",["2026-08","2026-09","2026-10"]]);
t("parcela 1 paga, 2 e 3 abertas", geladeira.parcelas.map(p=>L.estadoParcela(p,geladeira).status), ["PAGA","VENCIDA","ABERTA"]);
const c1=[...L.cartoes.values()][0];
t("fatura de agosto paga num pagamento só (geladeira + farmácia)", fatura(L,c1.id,"2026-08").status, "PAGA");
t("cartão deve 600", L.dividaCartao(c1.id), 60000);
const jur=docs.find(d=>por(d).includes("juros"));
t("payAmt maior vira juros", L.estadoDocumento(jur).juros, 320);
const aluguel=docs.filter(d=>d.recorrencia);
t("fixo vira recorrência com um documento por mês", aluguel.length, 4);
const rec=[...L.recorrencias.values()][0];
t("recorrência sem fim", [rec.quantidade, rec.geradas, rec.ativa], [null,4,true]);
const nova=Rec.gerarPendentes(L); if(nova) L.aplicar(nova);
t("e a janela de 24 meses continua sendo esticada: ago/2026 a set/2028", [...L.documentos.values()].filter(d=>d.recorrencia===rec.id).length, 26);
const trf=docs.filter(d=>d.tipo==="TRANSFERENCIA");
t("transferência + aporte na meta viraram transferências (1 planejada)", trf.map(d=>d.status).sort(), ["EFETIVADO","EFETIVADO","PLANEJADA"]);
const viagem=[...L.contas.values()].find(c=>c.nome==="Viagem");
t("meta vira reserva com alvo e aporte", [viagem.tipo, viagem.reserva.alvo, viagem.reserva.aporte], ["RESERVA",1000000,50000]);
t("e o % do CDI chega intacto (rende 100% do CDI)", [viagem.reserva.cdi, rotuloTaxa(perfil(viagem))], [100,"100% do CDI"]);
t("saldo da meta = aporte direto + transferência", L.saldoConta(viagem.id), 250000);
const vr=[...L.contas.values()].find(c=>c.tipo==="BENEFICIO");
t("vale: recargas de set (650) − almoço 35", L.saldoConta(vr.id), 61500);
t("item da lixeira preservado como cancelado", docs.filter(d=>d.status==="CANCELADO").map(d=>d.descricao), ["Apagado"]);
t("João virou parceiro, com o mercado vinculado", L.nomeParceiro(docs.find(d=>por(d).includes("mer")).parceiro), "João");
t("competência preservada", docs.find(d=>por(d).includes("comp")).competencia, "2026-10");
t("investimento vira reserva", [...L.contas.values()].find(c=>c.nome==="Tesouro").tipo, "RESERVA");
t("sem conta: com 3 contas, vai para 'Sem conta (migração)'", L.nomeConta(docs.find(d=>por(d).includes("orf")).conta), "Sem conta (migração)");
t("avisos explicam cada mudança de comportamento", R.avisos.length>=4, true);
const nub=[...L.contas.values()].find(c=>c.nome==="Nubank").id;
t("véspera do mês de abertura: exatamente o saldo informado no 2.2", L.saldoConta(nub,"2026-07-31"), 100000);
const pre=docs.find(d=>por(d).includes("pre1"));
t("o movimento anterior à abertura está no razão, pago em 20/07", [L.estadoDocumento(pre).status, L.pagamentosDoDocumento(pre)[0].data], ["PAGA","2026-07-20"]);

g("detecção de dados antigos");
t("JSON com lançamentos", temLegado(JSON.stringify(S)), true);
t("conta vazia", temLegado(JSON.stringify({tx:[],accounts:[]})), false);
t("lixo", temLegado("{"), false);

g("Datas como ficaram na vida real: nenhuma derruba a migração");
{ t("formatos lidos", ["2026-9-5","05/09/2026","2026-09-05T03:00:00.000Z"," 2026-09-05 "].map(normData), ["2026-09-05","2026-09-05","2026-09-05","2026-09-05"]);
  t("ilegíveis viram nada", ["","0025-09-05","2026-02-30","ontem",null,undefined,20260905].map(normData), [null,null,null,null,null,null,null]);
  const Sb={...S,tx:[tx("ok1",{due:"2026-9-3"}),tx("br",{due:"04/09/2026",paid:true,payDate:"04/09/2026"}),
    tx("semdata",{due:"",desc:"Padaria"}),tx("ano0025",{due:"0025-09-10",desc:"Farmácia",paid:true,payDate:""}),tx("comp",{due:"2026-09-06",comp:"2026"})]};
  let r; try{ r=migrarLegado(Sb); }catch(e){ r={erro:e.message}; }
  t("a migração termina", r.erro, undefined);
  t("datas legíveis foram corrigidas", [...r.livro.documentos.values()].filter(d=>["ok1","br","comp"].includes(d.legado?.tx?.[0])).map(d=>d.data).sort(), ["2026-09-03","2026-09-04","2026-09-06"]);
  t("as ilegíveis ficaram de fora, contadas", r.relatorio.contagem.ignorados, 2);
  t("e o relatório diz quais", /2 lançamento\(s\) do 2.2 ficaram de fora.*Padaria.*Farmácia/.test(r.relatorio.avisos.join(" ")), true);
  t("integridade", verificar(r.livro).problemas.map(p=>p.msg), []); }

fim();
