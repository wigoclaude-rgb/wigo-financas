/* ══════════ IMPORTAÇÃO — ANÁLISE E CONFIRMAÇÃO ══════════
   Importar não é "criar lançamento". O fluxo é:

     ARQUIVO → LOTE → LINHAS DO EXTRATO → ANÁLISE → DECISÃO → CONFIRMAÇÃO

   Cada linha do arquivo vira uma linha de EXTRATO guardada no livro — é ela
   que permite reconciliar depois e reconhecer o mesmo arquivo importado de
   novo. Na análise, cada linha ganha uma situação:

     DUPLICADA   já importada antes (mesma impressão digital) ou, na fatura,
                 parcela que já existe no app
     NO_APP      o movimento já está no WIGO, digitado à mão → só conciliar
     QUITA       bate com uma conta em aberto (mesmo valor, data próxima) →
                 registrar o pagamento dela, em vez de criar outra
     FATURA      pagamento de fatura de um cartão do app → pagar a fatura,
                 nunca lançar como despesa (a despesa já veio das compras)
     POSSIVEL    mesmo valor e dia de um movimento do app, com outro nome
     NOVA        nada parecido → criar documento
     ERRO        linha de saldo, data ou valor ilegível

   Tudo que é confirmado passa pelos comandos do motor: o documento criado a
   partir do extrato é igual ao digitado, e já nasce conciliado com a linha
   do banco de onde veio. */

import * as Lt from "./leitura.js";
import { Mudanca, criarDocumento, registrarPagamento, pagarFatura, criarTransferencia } from "../financas/comandos.js";
import { DOC, K, PREFIXO, ErroFinanceiro } from "../financas/modelo.js";
import { faturasDoCartao, fatura as faturaDe, faturaDaCompra, datasFatura } from "../financas/cartoes.js";
import { diasEntre, hoje, mesDe, addMesesMes } from "../nucleo/datas.js";
import { normalizar, semelhanca } from "../nucleo/texto.js";
import { novoId } from "../nucleo/ids.js";
import { formatar } from "../nucleo/dinheiro.js";

/* ── leitura do arquivo: bytes → movimentações (ou o que falta perguntar) ── */
export async function lerArquivo(bytes,nome){
  if(bytes.length>Lt.IMP_MAX_BYTES) return {erro:"grande"};
  const formato=Lt.detectarFormatoArquivo(nome,bytes);
  if(!formato) return {erro:"formato"};
  if(formato==="pdf") return {formato,erro:"pdf"};
  if(formato==="xls-antigo") return {formato,erro:"xls-antigo"};
  if(formato==="ofx"){
    const {texto}=Lt.detectarEncodingCSV(bytes);
    const r=Lt.parseOFX(texto);
    const saldo=Lt.normalizarValorImportacao(Lt.tagOFX(texto.split(/<LEDGERBAL>/i)[1]||"","BALAMT"));
    const dataSaldo=Lt.normalizarDataImportacao(Lt.tagOFX(texto.split(/<LEDGERBAL>/i)[1]||"","DTASOF"));
    const cartao=/<CCSTMTRS>/i.test(texto);
    return {formato,movs:r.movs,erro:r.erro,modoSugerido:cartao?"CARTAO":"CONTA",
      saldoInformado:isNaN(saldo)?null:{valor:Math.round(saldo*100),data:dataSaldo}};
  }
  let bruto;
  if(formato==="xlsx") bruto=await Lt.lerXLSX(bytes);
  else if(formato==="html"){ const {texto}=Lt.detectarEncodingCSV(bytes); bruto=Lt.lerTabelaHTML(texto); }
  else { const {texto}=Lt.detectarEncodingCSV(bytes); bruto=Lt.parseCSV(texto,Lt.detectarSeparadorCSV(texto)); }
  if(!bruto||!bruto.length) return {formato,erro:"vazio"};
  const cab=Lt.acharCabecalhoCSV(bruto);
  if(!cab.cols.confiavel) return {formato,bruto,cabecalho:cab,precisaColunas:true};
  return {formato,movs:Lt.mapearCSV(bruto.slice(cab.idx+1),cab.cols),bruto,cabecalho:cab};
}
export function aplicarColunas(leitura,cols){
  return {...leitura,precisaColunas:false,movs:Lt.mapearCSV(leitura.bruto.slice(leitura.cabecalho.idx+1),cols)};
}

/* ── impressão digital de uma linha ──
   Com identificador do banco (FITID do OFX, UUID do Nubank), é ele. Sem, é
   dono + data + valor + descrição + parcela + OCORRÊNCIA: duas linhas iguais
   no mesmo arquivo são duas compras, e a ordem do arquivo é estável, então
   reimportar reconhece as duas. */
function digital(dono,mov,valor,descN,parcela,ocorrencia){
  if(mov.fitid) return "ref:"+dono+"|"+mov.fitid;
  return "fp:"+Lt.gerarHashImportacao(dono+"|"+mov.data+"|"+valor+"|"+descN+"|"+(parcela||"")+"|"+ocorrencia);
}
export function semParcela(desc){
  return String(desc||"").replace(/\s*[-–·]?\s*parcela\s*\d{1,2}\s*\/\s*\d{1,2}\s*$/i,"")
    .replace(/\s+\d{1,2}\s*\/\s*\d{1,2}\s*$/,"").trim();
}
/* identidade da compra parcelada no cartão, igual em toda fatura: a fatura
   repete a data da compra e o valor da parcela em cada mês */
export function chaveCompra(cartao,dataCompra,desc,valorParcela,de){
  return Lt.gerarHashImportacao(cartao+"|"+dataCompra+"|"+normalizar(semParcela(desc))+"|"+valorParcela+"|"+de);
}
const parcelaDe=desc=>{ const p=Lt.numeroParcela(desc); if(!p) return null; const [n,de]=p.split("/").map(Number);
  return n>=1&&de>=n&&de<=99?{n,de}:null; };

/* nome da outra ponta de um Pix/TED ("Pix enviado · FULANO") → parceiro */
function acharParceiro(L,desc){
  const nome=(String(desc).split(" · ")[1]||"").trim();
  const alvo=nome||desc;
  let melhor=null,pontos=0;
  for(const p of L.parceirosAtivos()){ const s=semelhanca(alvo,p.nome);
    if(s>pontos){ pontos=s; melhor=p; } }
  return pontos>=.5?melhor.id:null;
}
function acharCategoria(L,desc,natureza){
  const lista=L.categoriasAtivas(natureza);
  const nome=Lt.sugerirCategoriaImportacao(desc,natureza==="RECEITA"?"inc":"exp",lista.map(c=>c.nome));
  return lista.find(c=>c.nome===nome)?.id||null;
}

/* ═════════ ANÁLISE ═════════ */
export function analisar(L,{modo,conta,cartao,movs,faturaRef}){
  const dono=modo==="CARTAO"?"card:"+cartao:conta;
  const extratoDono=[...L.extrato.values()].filter(e=>modo==="CARTAO"?e.cartao===cartao:e.conta===conta);
  const digitais=new Map(extratoDono.filter(e=>e.estado!=="IGNORADA").map(e=>[e.digital,e]));
  const sinalCompra=modo==="CARTAO"?Lt.sinalFatura(movs):-1;
  const ocorr=new Map();
  const usados=new Set();   // cada movimento do app casa com uma linha só
  const linhas=movs.slice(0,Lt.IMP_MAX_MOVS).map((mov,i)=>{
    const v=Lt.normalizarMovimentacaoImportada(mov);
    const base={i,data:mov.data,descricao:mov.desc||"",descOriginal:mov.descBruta||mov.desc||"",refBanco:mov.fitid||null};
    if(!v.ok) return {...base,valor:null,estado:"ERRO",erro:v.erro,acao:"IGNORAR"};
    let valor=Math.round(mov.amount*100);
    /* na fatura, positivo = compra, venha o arquivo como vier */
    if(modo==="CARTAO"){
      const compra=mov.tipo==="DEBIT"?true:mov.tipo==="CREDIT"?false:Math.sign(mov.amount)===sinalCompra;
      valor=compra?Math.abs(valor):-Math.abs(valor);
    }
    const parcela=parcelaDe(mov.desc);
    const descN=normalizar(semParcela(mov.desc));
    const chaveOc=mov.data+"|"+valor+"|"+descN+"|"+(parcela?parcela.n+"/"+parcela.de:"");
    const oc=(ocorr.get(chaveOc)||0)+1; ocorr.set(chaveOc,oc);
    const dig=digital(dono,mov,valor,descN,parcela&&parcela.n+"/"+parcela.de,oc);
    const linha={...base,valor,parcela,digital:dig,estado:"NOVA",acao:"CRIAR",pontos:null,motivo:null,alvo:null};
    const ja=digitais.get(dig);
    if(ja){ return {...linha,estado:"DUPLICADA",acao:"IGNORAR",motivo:"Esta linha já foi importada"+
      (ja.documento?" ("+(L.documentos.get(ja.documento)?.numero||"")+")":"")+".",alvo:{tipo:"EXTRATO",id:ja.id}}; }
    return modo==="CARTAO"?analisarCartao(L,linha,{cartao,faturaRef,mov,usados})
                          :analisarConta(L,linha,{conta,mov,usados});
  });
  return { linhas, resumo:contar(linhas) };
}
export function contar(linhas){
  const c={total:linhas.length,novas:0,duplicadas:0,noApp:0,quita:0,fatura:0,possiveis:0,erros:0,ignoradas:0,lancar:0};
  for(const l of linhas){
    if(l.estado==="NOVA") c.novas++; else if(l.estado==="DUPLICADA") c.duplicadas++;
    else if(l.estado==="NO_APP") c.noApp++; else if(l.estado==="QUITA") c.quita++;
    else if(l.estado==="FATURA") c.fatura++; else if(l.estado==="POSSIVEL") c.possiveis++; else if(l.estado==="ERRO") c.erros++;
    if(l.acao==="IGNORAR") c.ignoradas++; else c.lancar++;
  }
  return c;
}

function analisarConta(L,linha,{conta,mov,usados}){
  const entrada=linha.valor>0;
  linha.tipo=entrada?"RECEBER":"PAGAR";
  linha.forma=Lt.sugerirMetodoImportacao(mov.desc);
  linha.categoria=acharCategoria(L,mov.desc,entrada?"RECEITA":"DESPESA");
  linha.parceiro=acharParceiro(L,mov.desc);
  /* 1) já está no app? movimento da conta, mesmo valor, ±1 dia */
  let igual=null,confira=null;
  for(const x of L.linhasDaChave(K.conta(conta))){
    if(x.v!==linha.valor||x.l.linhas[x.i].conc||usados.has(x.l.id+"#"+x.i)) continue;
    const dif=Math.abs(diasEntre(linha.data,x.data)); if(dif>1) continue;
    if(descricoesDoMovimento(L,x.l).some(desc=>Lt.compararDescricoesImportacao(desc,mov.desc)||semelhanca(desc,mov.desc)>=.5)){ igual=x; break; }
    if(dif===0&&!confira) confira=x;
  }
  if(igual){ usados.add(igual.l.id+"#"+igual.i);
    return {...linha,estado:"NO_APP",acao:"VINCULAR",alvo:{tipo:"LANCAMENTO",lancamento:igual.l.id,linha:igual.i},
      motivo:"Já está no app: "+igual.l.descricao+" · "+igual.data}; }
  /* 2) pagamento de fatura de cartão do app */
  if(!entrada&&(Lt.ehPagamentoFatura(mov.desc)||/fatura|cartao|cartão/i.test(mov.desc))){
    const f=faturaParaPagar(L,conta,-linha.valor,linha.data);
    if(f) return {...linha,estado:"FATURA",acao:"PAGAR_FATURA",alvo:{tipo:"FATURA",cartao:f.cartao.id,ref:f.ref},
      motivo:"Paga a fatura "+f.cartao.nome+" de "+f.ref+" (falta "+formatar(f.restante)+"). Lançar como despesa contaria as compras duas vezes."};
    linha.aviso="Parece pagamento de fatura. Se as compras do cartão estão no app, não lance isto como despesa.";
  }
  /* 3) quita uma conta em aberto? mesmo valor restante, vencimento até 5 dias */
  const q=parcelaParaQuitar(L,linha,mov,usados);
  if(q){ usados.add("parcela:"+q.p.id);
    return {...linha,estado:"QUITA",acao:"QUITAR",alvo:{tipo:"PARCELA",parcela:q.p.id,documento:q.doc.id},pontos:q.pontos,
      motivo:"Quita "+q.doc.numero+" · "+q.doc.descricao+(q.doc.parcelas.length>1?" ("+q.p.n+"/"+q.p.de+")":"")+" · vence "+q.p.vencimento}; }
  if(confira){ usados.add(confira.l.id+"#"+confira.i);
    return {...linha,estado:"POSSIVEL",acao:"CRIAR",alvo:{tipo:"LANCAMENTO",lancamento:confira.l.id,linha:confira.i},
      motivo:"Mesmo valor e dia de \""+confira.l.descricao+"\" — pode ser o mesmo com outro nome."}; }
  return linha;
}
/* um movimento do razão é conhecido pelo lançamento, pelos documentos que
   ele paga e pelo parceiro — o banco escreve qualquer um dos três */
function descricoesDoMovimento(L,l){
  const out=[l.descricao];
  const pg=l.pagamento?L.pagamentos.get(l.pagamento):null;
  if(pg){ for(const a of pg.alocacoes){ const d=L.documentos.get(a.documento); if(d){ out.push(d.descricao);
    if(d.parceiro) out.push(L.nomeParceiro(d.parceiro)); } } if(pg.parceiro) out.push(L.nomeParceiro(pg.parceiro)); }
  else if(l.documento){ const d=L.documentos.get(l.documento); if(d){ out.push(d.descricao); if(d.parceiro) out.push(L.nomeParceiro(d.parceiro)); } }
  return out.filter(Boolean);
}
function faturaParaPagar(L,conta,valor,data){
  const cands=[];
  for(const c of L.cartoesAtivos()){
    if(c.contaPagamento&&c.contaPagamento!==conta) continue;
    for(const f of faturasDoCartao(L,c.id)){
      if(f.restante<=0) continue;
      if(valor>f.restante) continue;
      cands.push({...f,dist:Math.abs(diasEntre(f.vencimento,data))+(valor===f.restante?0:30)});
    }
  }
  cands.sort((a,b)=>a.dist-b.dist);
  return cands[0]&&cands[0].dist<=45?cands[0]:null;
}
function parcelaParaQuitar(L,linha,mov,usados){
  const lado=linha.valor>0?"RECEBER":"PAGAR", alvo=Math.abs(linha.valor);
  let melhor=null;
  for(const {doc,p,e} of L.obrigacoes(lado)){
    if(e.restante!==alvo||usados.has("parcela:"+p.id)) continue;
    const dif=Math.abs(diasEntre(p.vencimento,linha.data)); if(dif>5) continue;
    const s=Math.max(semelhanca(mov.desc,doc.descricao),doc.parceiro?semelhanca(mov.desc,L.nomeParceiro(doc.parceiro)):0);
    const pontos=Math.round(60+25*(1-dif/6)+15*Math.min(1,s*1.6));
    if(!melhor||pontos>melhor.pontos) melhor={doc,p,pontos};
  }
  return melhor&&melhor.pontos>=70?melhor:null;
}

function analisarCartao(L,linha,{cartao,faturaRef,mov,usados}){
  const c=L.cartoes.get(cartao);
  if(linha.valor<0){
    /* crédito na fatura: ou é o pagamento da fatura anterior (já lançado do
       lado da conta), ou é estorno de compra */
    if(Lt.ehPagamentoFatura(mov.desc)) return {...linha,tipo:"PAGAMENTO",estado:"NOVA",acao:"IGNORAR",
      motivo:"Pagamento da fatura anterior — ele já foi registrado do lado da conta."};
    return {...linha,tipo:"ESTORNO",categoria:acharCategoria(L,mov.desc,"DESPESA")};
  }
  linha.tipo="COMPRA";
  linha.categoria=acharCategoria(L,mov.desc,"DESPESA");
  linha.parceiro=acharParceiro(L,mov.desc);
  /* parcela que já existe: compra importada no mês passado ("Parcela 2/5")
     criou a 3/5 — a fatura deste mês só a confirma */
  if(linha.parcela){
    const ch=chaveCompra(cartao,linha.data,mov.desc,linha.valor,linha.parcela.de);
    for(const {doc,p} of (L.ix.parcelasCartao.get(cartao)||[])){
      if(doc.status==="CANCELADO"||p.n!==linha.parcela.n||p.de!==linha.parcela.de||p.valor!==linha.valor) continue;
      const mesma=doc.chaveCompra?doc.chaveCompra===ch:Lt.compararDescricoesImportacao(semParcela(doc.descricao),semParcela(mov.desc));
      if(mesma&&!usados.has("parcela:"+p.id)){ usados.add("parcela:"+p.id);
        return {...linha,estado:"DUPLICADA",acao:"IGNORAR",alvo:{tipo:"PARCELA",parcela:p.id,documento:doc.id},
          motivo:"Parcela "+p.n+"/"+p.de+" de "+doc.numero+" já está no app (fatura "+p.fatura+")."}; }
    }
  }
  /* compra à vista digitada à mão: mesmo valor, data da compra ±1 dia */
  for(const {doc,p} of (L.ix.parcelasCartao.get(cartao)||[])){
    if(doc.status==="CANCELADO"||doc.tipo!==DOC.COMPRA||doc.parcelas.length!==1||p.valor!==linha.valor) continue;
    if(Math.abs(diasEntre(doc.data,linha.data))>1||usados.has("parcela:"+p.id)) continue;
    if(Lt.compararDescricoesImportacao(doc.descricao,mov.desc)||semelhanca(doc.descricao,mov.desc)>=.5){
      usados.add("parcela:"+p.id);
      return {...linha,estado:"NO_APP",acao:"IGNORAR",alvo:{tipo:"PARCELA",parcela:p.id,documento:doc.id},
        motivo:"Já está no app: "+doc.numero+" · "+doc.descricao}; }
  }
  return linha;
}

/* ═════════ CONFIRMAÇÃO ═════════
   decisoes: por índice da linha, o que o usuário confirmou na revisão —
   { acao, tipo, categoria, parceiro, forma, descricao, contaDestino,
     parcela:{n,de}, criarParcelas }
   Grava o lote, todas as linhas de extrato (inclusive as ignoradas, para a
   próxima importação reconhecê-las) e o que cada decisão manda criar. */
export function confirmar(L,{arquivo,formato,modo,conta,cartao,faturaRef,linhas,saldoInformado,criarParcelas=true}){
  const m=new Mudanca(L); m.marcos=[];
  const lote=novoId("i");
  const contagem={linhas:linhas.length,criadas:0,vinculadas:0,quitadas:0,faturas:0,ignoradas:0,duplicadas:0,erros:0};
  const loteDoc={id:lote,arquivo:arquivo||"",formato:formato||"",modo,conta:conta||null,cartao:cartao||null,
    fatura:faturaRef||null,em:new Date().toISOString(),data:hoje(),saldoInformado:saldoInformado||null,contagem};
  m.set("importacoes",lote,loteDoc);
  const c=cartao?L.cartoes.get(cartao):null;
  for(const l of linhas){
    if(l.estado==="ERRO"){ contagem.erros++; continue; }
    const eid=novoId("e");
    const ext={id:eid,lote,conta:modo==="CONTA"?conta:null,cartao:modo==="CARTAO"?cartao:null,data:l.data,valor:l.valor,
      descricao:l.descricao,descOriginal:l.descOriginal,refBanco:l.refBanco,digital:l.digital,
      parcela:l.parcela||null,estado:"NOVA",documento:null,pagamento:null,conciliada:null};
    const acao=l.acao;
    try{
      if(l.estado==="DUPLICADA"&&acao==="IGNORAR"){ contagem.duplicadas++;
        /* a mesma linha de novo não se regrava: a primeira já está no livro */
        if(l.alvo?.tipo==="EXTRATO") continue;
        ext.estado="DUPLICADA"; ext.documento=l.alvo?.documento||null; m.set("extrato",eid,ext); m.marcos.push(m.gravar.length); continue; }
      if(acao==="IGNORAR"){ contagem.ignoradas++; ext.estado="IGNORADA"; m.set("extrato",eid,ext); m.marcos.push(m.gravar.length); continue; }
      const imp={lote,linha:eid};
      if(modo==="CONTA"){
        let lanc=null, linhaIdx=null;
        if(acao==="VINCULAR"){
          lanc=m.obter("lancamentos",l.alvo.lancamento); linhaIdx=l.alvo.linha; contagem.vinculadas++;
        } else if(acao==="QUITAR"){
          const info=m.infoParcela(l.alvo.parcela);
          const abs=Math.abs(l.valor), valor=Math.min(abs,info.restante), juros=Math.max(0,abs-info.restante);
          registrarPagamento(L,{direcao:l.valor>0?"ENTRADA":"SAIDA",data:l.data,conta,forma:l.forma,parceiro:info.doc.parceiro,
            alocacoes:[{parcela:l.alvo.parcela,valor,juros}],origem:"IMPORTACAO",importacao:imp},m);
          lanc=m.ultimoLancamento; ext.pagamento=m.ultimoPagamento.id; ext.documento=info.doc.id; contagem.quitadas++;
        } else if(acao==="PAGAR_FATURA"){
          pagarFatura(L,{cartao:l.alvo.cartao,ref:l.alvo.ref,valor:-l.valor,data:l.data,conta,origem:"IMPORTACAO",importacao:imp},m);
          lanc=m.ultimoLancamento; ext.pagamento=m.ultimoPagamento.id; contagem.faturas++;
        } else if(acao==="TRANSFERIR"){
          const outra=l.contaDestino; if(!outra) throw new ErroFinanceiro("Escolha a outra conta da transferência.");
          const d=novoId("d");
          criarTransferencia(L,{id:d,origem:l.valor<0?conta:outra,destino:l.valor<0?outra:conta,valor:Math.abs(l.valor),
            data:l.data,descricao:l.descricao,origem:"IMPORTACAO",importacao:imp,silencioso:true},m);
          lanc=[...m.pend.lancamentos.values()].find(x=>x.documento===d); ext.documento=d; contagem.criadas++;
        } else {
          const d=novoId("d");
          criarDocumento(L,{id:d,tipo:l.valor>0?DOC.RECEBER:DOC.PAGAR,descricao:l.descricao,valor:Math.abs(l.valor),data:l.data,
            categoria:l.categoria||null,parceiro:l.parceiro||null,forma:l.forma||null,conta,origem:"IMPORTACAO",importacao:imp,
            silencioso:true,quitar:{data:l.data,conta,forma:l.forma}},m);
          lanc=m.ultimoLancamento; ext.documento=d; ext.pagamento=m.ultimoPagamento.id; contagem.criadas++;
        }
        /* nasce conciliado: o movimento veio do próprio banco */
        if(lanc){
          const idx=linhaIdx!=null?linhaIdx:lanc.linhas.findIndex(x=>x.k===K.conta(conta));
          if(idx>=0){
            if(lanc.linhas[idx].v!==l.valor) throw new ErroFinanceiro("Valor do movimento difere da linha do banco.");
            m.set("lancamentos",lanc.id,{...lanc,linhas:lanc.linhas.map((x,j)=>j===idx?{...x,conc:{em:hoje(),extrato:eid,conciliacao:null}}:x)});
            ext.estado="CONCILIADA"; ext.conciliada={lancamento:lanc.id,linha:idx};
          }
        }
      } else {
        const d=novoId("d");
        if(l.valor<0){
          criarDocumento(L,{id:d,tipo:DOC.ESTORNO_CARTAO,cartao,descricao:l.descricao,valor:-l.valor,data:l.data,
            categoria:l.categoria||null,fatura:faturaRef,origem:"IMPORTACAO",importacao:imp,silencioso:true},m);
        } else {
          const p=criarParcelas&&l.parcela?l.parcela:null;
          const restantes=p?p.de-p.n+1:1;
          criarDocumento(L,{id:d,tipo:DOC.COMPRA,cartao,descricao:p?semParcela(l.descricao):l.descricao,
            valor:l.valor*restantes,data:l.data,competencia:mesDe(l.data),categoria:l.categoria||null,parceiro:l.parceiro||null,
            parcelas:Array.from({length:restantes},()=>({valor:l.valor})),parcelaInicial:p?{n:p.n,de:p.de}:null,
            fatura:faturaRef,origem:"IMPORTACAO",importacao:imp,silencioso:true},m);
          if(p){ const doc=m.obter("documentos",d); m.set("documentos",d,{...doc,chaveCompra:chaveCompra(cartao,l.data,l.descricao,l.valor,p.de)}); }
        }
        ext.documento=d; ext.estado="LANCADA"; contagem.criadas++;
      }
      if(ext.estado==="NOVA") ext.estado="LANCADA";
      m.set("extrato",eid,ext);
      m.marcos.push(m.gravar.length);
    }catch(e){
      if(e instanceof ErroFinanceiro) throw new ErroFinanceiro("Linha "+(l.i+1)+" ("+l.descricao+"): "+e.message);
      throw e;
    }
  }
  m.set("importacoes",lote,{...loteDoc,contagem});
  m.auditar("IMPORTAR","importacao",lote,null,"Importação de "+(arquivo||"arquivo")+": "+contagem.criadas+" criado(s), "+
    contagem.vinculadas+" já no app, "+contagem.quitadas+" quitado(s), "+contagem.faturas+" fatura(s) paga(s), "+
    (contagem.duplicadas+contagem.ignoradas)+" ignorado(s)");
  return m.fechar();
}

/* a fatura que o arquivo representa: a última que já fechou, ou a corrente */
export function faturaProvavel(L,cartao,movs){
  const c=L.cartoes.get(cartao);
  const datas=(movs||[]).map(m=>m.data).filter(Boolean).sort();
  if(datas.length) return faturaDaCompra(c,datas[datas.length-1]);
  const h=hoje(); let ref=faturaDaCompra(c,h);
  if(datasFatura(c,ref).fechamento>h) ref=addMesesMes(ref,-1);
  return ref;
}
