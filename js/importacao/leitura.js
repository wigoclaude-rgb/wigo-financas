/* ══════════ IMPORTAÇÃO — LEITURA E PARSING ══════════
   Portado do WIGO 2.2 sem mudança de comportamento: é o pedaço que já tinha
   236 testes e tinha sido provado com extratos reais do Nubank e do Santander.
   Mudou só o que dependia do estado global — a sugestão de categoria agora
   recebe a lista de nomes, e as datas usam o módulo de datas.

   Camada 1 lê o arquivo (bytes → linhas), camada 2 interpreta (linhas →
   movimentações), camada 3 sugere (tipo, forma, categoria). Nenhuma delas
   conhece o livro: quem compara com o que já existe é analise.js. */

import { iso } from "../nucleo/datas.js";

export const IMP_MAX_BYTES=10*1024*1024;   // 10 MB: acima disso o navegador engasga
export const IMP_MAX_MOVS=2000;            // teto de movimentações processadas

/* ---------- camada 1: LEITURA ---------- */

/* Pelos primeiros bytes, não pela extensão: banco chama de .xls um HTML com
   tabela dentro, e de .csv um arquivo separado por tab. A extensão só desempata
   o que os bytes não resolvem. */
export function detectarFormatoArquivo(nome,bytes){
  const b=bytes||new Uint8Array();
  const inicia=(...xs)=>xs.every((x,i)=>b[i]===x);
  if(inicia(0x25,0x50,0x44,0x46)) return "pdf";               // %PDF
  if(inicia(0xD0,0xCF,0x11,0xE0)) return "xls-antigo";        // OLE2: .xls binário
  if(inicia(0x50,0x4B,0x03,0x04)) return "xlsx";              // ZIP: .xlsx
  const ext=(nome||"").toLowerCase().split(".").pop();
  const inicio=new TextDecoder("utf-8").decode(b.slice(0,3000));
  if(/<table|<tr[\s>]/i.test(inicio)) return "html";
  if(ext==="ofx"||ext==="qfx") return "ofx";
  if(/OFXHEADER|<OFX>|<STMTTRN/i.test(inicio)) return "ofx";
  if(ext==="pdf") return "pdf";
  if(ext==="csv"||ext==="txt"||ext==="xls"||ext==="tsv") return "csv";
  return null;
}

/* ---------- XLSX: ZIP de XMLs, lido sem biblioteca ----------
   Um .xlsx é um ZIP com o texto em xl/sharedStrings.xml e as células em
   xl/worksheets/sheet1.xml. Ler o ZIP à mão e inflar com DecompressionStream —
   que o navegador tem desde 2023 — evita uma biblioteca de planilha de ~1 MB por
   CDN, e a regra do projeto é que o Firebase seja a única dependência externa. */
export async function inflarBruto(dados){
  const ds=new DecompressionStream("deflate-raw");
  const buf=await new Response(new Blob([dados]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}
export async function descompactarZip(bytes){
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  /* o índice central fica no fim do arquivo e é achado varrendo de trás */
  let fim=-1;
  for(let i=bytes.length-22;i>=0&&i>bytes.length-65558;i--)
    if(dv.getUint32(i,true)===0x06054b50){ fim=i; break; }
  if(fim<0) throw new Error("zip");
  const total=dv.getUint16(fim+10,true);
  let p=dv.getUint32(fim+16,true);
  const saida={};
  for(let n=0;n<total&&p+46<=bytes.length;n++){
    if(dv.getUint32(p,true)!==0x02014b50) break;
    const metodo=dv.getUint16(p+10,true), tam=dv.getUint32(p+20,true);
    const nomeLen=dv.getUint16(p+28,true), extraLen=dv.getUint16(p+30,true);
    const comLen=dv.getUint16(p+32,true), off=dv.getUint32(p+42,true);
    const nome=new TextDecoder().decode(bytes.slice(p+46,p+46+nomeLen));
    /* o cabeçalho local repete nome e extra com tamanhos próprios */
    const lnLen=dv.getUint16(off+26,true), leLen=dv.getUint16(off+28,true);
    const ini=off+30+lnLen+leLen;
    const dados=bytes.slice(ini,ini+tam);
    if(/^xl\/(worksheets\/|sharedStrings)/.test(nome))
      saida[nome]=metodo===0?dados:await inflarBruto(dados);
    p+=46+nomeLen+extraLen+comLen;
  }
  return saida;
}
export function colunaExcel(ref){
  const m=/^([A-Z]+)/.exec(ref||""); if(!m) return 0;
  let n=0; for(const ch of m[1]) n=n*26+(ch.charCodeAt(0)-64);
  return n-1;
}
export async function lerXLSX(bytes){
  const arq=await descompactarZip(bytes);
  const texto=n=>arq[n]?new TextDecoder().decode(arq[n]):"";
  const xml=s=>new DOMParser().parseFromString(s,"application/xml");
  const tag=(no,t)=>[...no.getElementsByTagName(t)];
  /* o texto das células mora todo em sharedStrings, referenciado por índice */
  const compart=[];
  const ss=texto("xl/sharedStrings.xml");
  if(ss) tag(xml(ss),"si").forEach(si=>compart.push(tag(si,"t").map(t=>t.textContent).join("")));
  const nomeAba=Object.keys(arq).filter(n=>/^xl\/worksheets\/.+\.xml$/.test(n)).sort()[0];
  if(!nomeAba) throw new Error("sheet");
  const linhas=[];
  tag(xml(texto(nomeAba)),"row").forEach(row=>{
    const cels=[];
    tag(row,"c").forEach(c=>{
      const col=colunaExcel(c.getAttribute("r")), t=c.getAttribute("t");
      const v=tag(c,"v")[0];
      cels[col]= t==="s" ? (compart[+(v?v.textContent:-1)]??"")
               : t==="inlineStr" ? tag(c,"t").map(x=>x.textContent).join("")
               : (v?v.textContent:"");
    });
    for(let i=0;i<cels.length;i++) if(cels[i]==null) cels[i]="";
    linhas.push(cels);
  });
  return linhas.filter(l=>l.some(c=>String(c).trim()));
}
/* .xls que na verdade é HTML com <table> — vários bancos exportam assim */
export function lerTabelaHTML(texto){
  const d=new DOMParser().parseFromString(texto,"text/html");
  const tabelas=[...d.getElementsByTagName("table")];
  if(!tabelas.length) return [];
  /* a maior tabela é a dos lançamentos; as outras são cabeçalho e layout */
  const t=tabelas.reduce((a,b)=>b.rows.length>a.rows.length?b:a);
  return [...t.rows].map(r=>[...r.cells].map(c=>c.textContent.replace(/\s+/g," ").trim()))
    .filter(l=>l.some(c=>c));
}
/* Extrato brasileiro sai em UTF-8 ou Windows-1252 e o arquivo não diz qual é.
   TextDecoder com fatal:true recusa a sequência inválida — é isso que separa os
   dois casos sem depender de procurar acento quebrado no meio do texto. */
export function detectarEncodingCSV(buf){
  try{ return {texto:new TextDecoder("utf-8",{fatal:true}).decode(buf),encoding:"UTF-8"}; }
  catch{ return {texto:new TextDecoder("windows-1252").decode(buf),encoding:"Windows-1252"}; }
}
export function lerArquivoImportacao(file){
  return new Promise((ok,falha)=>{
    const r=new FileReader();
    r.onerror=()=>falha(new Error("leitura"));
    r.onload=()=>ok(new Uint8Array(r.result));
    r.readAsArrayBuffer(file);
  });
}

/* ---------- camada 2: PARSING ---------- */

export function normalizarTextoImportacao(s){
  return String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
/* 1.234,56 · 1234,56 · 1234.56 · -1.234,56 · R$ 1.234,56 · (150,00) · 150,00 D
   O separador decimal é o ÚLTIMO que aparece. Com três dígitos depois dele e
   nenhum outro separador no número, é milhar — 1.234 é mil duzentos e trinta e
   quatro, que é como o extrato brasileiro escreve. */
export function normalizarValorImportacao(v){
  if(typeof v==="number") return isFinite(v)?Math.round(v*100)/100:NaN;
  let s=String(v??"").trim();
  if(!s) return NaN;
  let sinal=1;
  if(/^\(.*\)$/.test(s)){ sinal=-1; s=s.slice(1,-1); }
  s=s.replace(/R\$/ig,"").replace(/[\s\u00a0]/g,"");
  const suf=s.match(/([DC])$/i);
  if(suf&&/[\d)]/.test(s.charAt(s.length-2))){
    if(suf[1].toUpperCase()==="D") sinal=-1;
    s=s.slice(0,-1);
  }
  if(s.indexOf("-")>=0){ sinal=-1; s=s.replace(/-/g,""); }
  s=s.replace(/\+/g,"");
  if(!/^[\d.,]+$/.test(s)||!/\d/.test(s)) return NaN;
  const ult=Math.max(s.lastIndexOf(","),s.lastIndexOf("."));
  if(ult>=0){
    const casas=s.length-ult-1, seps=(s.match(/[.,]/g)||[]).length;
    if(casas===3&&seps===1) s=s.replace(/[.,]/g,"");
    else s=s.slice(0,ult).replace(/[.,]/g,"")+"."+s.slice(ult+1);
  }
  const n=parseFloat(s);
  return isNaN(n)?NaN:sinal*Math.round(n*100)/100;
}
/* 20260908120000[-03:BRT] · 08/09/2026 · 2026-09-08 · 08/09/26 · 20260908
   Horário e fuso são descartados: lançamento financeiro tem dia, não hora.
   Data com barra é lida como dd/mm — é extrato brasileiro. */
export function normalizarDataImportacao(v){
  const s=String(v??"").trim();
  if(!s) return null;
  /* planilha guarda data como número de dias desde 30/12/1899. A faixa evita
     confundir com um valor qualquer: 20000 é 1954 e 60000 é 2064. */
  if(/^\d{5}(\.\d+)?$/.test(s)){
    const n=parseFloat(s);
    if(n>=20000&&n<=60000){
      const t=new Date(Date.UTC(1899,11,30)+Math.round(n)*86400000);
      return iso(new Date(t.getUTCFullYear(),t.getUTCMonth(),t.getUTCDate()));
    }
  }
  let y,m,d,mm;
  if((mm=s.match(/^(\d{4})(\d{2})(\d{2})/))){ y=+mm[1]; m=+mm[2]; d=+mm[3]; }
  else if((mm=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))){ y=+mm[1]; m=+mm[2]; d=+mm[3]; }
  else if((mm=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))){
    d=+mm[1]; m=+mm[2]; y=+mm[3];
    if(y<100) y+=y<70?2000:1900;
    if(d>12&&m>12) return null;
    if(d<=12&&m>12){ const t=d; d=m; m=t; }   // veio mm/dd
  }
  else return null;
  if(!(y>=1900&&y<=2200)||!(m>=1&&m<=12)||!(d>=1&&d<=31)) return null;
  const t=new Date(y,m-1,d);
  if(t.getFullYear()!==y||t.getMonth()!==m-1||t.getDate()!==d) return null;  // 31/02
  return iso(t);
}

/* OFX vem em duas roupas: SGML (tag sem fechamento) e XML. Ler "do <TAG> até o
   próximo <" atende as duas sem precisar de parser de verdade. */
export function tagOFX(bloco,tag){
  const m=bloco.match(new RegExp("<"+tag+">([^<]*)","i"));
  return m?m[1].trim():"";
}
/* MEMO costuma trazer o histórico completo e NAME a contraparte. Juntar os dois
   só ajuda quando um não está contido no outro — senão vira repetição. */
export function descOFX(name,memo,tipo){
  const n=(name||"").trim(), m=(memo||"").trim();
  if(n&&m){
    const nn=normalizarTextoImportacao(n), mn=normalizarTextoImportacao(m);
    if(nn&&mn&&!mn.includes(nn)&&!nn.includes(mn)) return n+" · "+m;
    return m.length>=n.length?m:n;
  }
  return m||n||(tipo||"").trim()||"Movimentação";
}
export function parseOFX(texto){
  const t=String(texto||"");
  if(!/<STMTTRN>/i.test(t)) return {movs:[],erro:"ofx"};
  const movs=[];
  t.split(/<STMTTRN>/i).slice(1).forEach(b=>{
    if(movs.length>=IMP_MAX_MOVS) return;
    const fim=b.search(/<\/STMTTRN>/i);
    const bloco=fim>=0?b.slice(0,fim):b;
    movs.push({
      data:normalizarDataImportacao(tagOFX(bloco,"DTPOSTED")),
      amount:normalizarValorImportacao(tagOFX(bloco,"TRNAMT")),
      desc:limparDescricaoImportacao(descOFX(tagOFX(bloco,"NAME"),tagOFX(bloco,"MEMO"),tagOFX(bloco,"TRNTYPE"))),
      /* TRNTYPE é o tipo dito pelo banco, e vale mais que qualquer palpite pelo
         sinal — numa fatura OFX com poucas linhas o palpite chega a inverter */
      tipo:tagOFX(bloco,"TRNTYPE").toUpperCase()||null,
      fitid:tagOFX(bloco,"FITID")||null
    });
  });
  return {movs,erro:movs.length?null:"vazio"};
}

/* Conta separadores fora de aspas nas primeiras linhas. Empate vai para o ";",
   que é o que sai da maioria dos bancos brasileiros. */
export function detectarSeparadorCSV(texto){
  const linhas=String(texto||"").split(/\r?\n/).filter(l=>l.trim()).slice(0,15);
  if(!linhas.length) return ";";
  let melhor=";", pontos=0;
  [";","\t",","].forEach(sep=>{
    const cont=linhas.map(l=>{ let n=0,asp=false;
      for(const c of l){ if(c==='"') asp=!asp; else if(c===sep&&!asp) n++; }
      return n; }).filter(n=>n>0);
    if(!cont.length) return;
    /* a moda das contagens, e não o mínimo: as linhas de dados têm todas o
       mesmo número de separadores, e é isso que distingue o separador real de
       um que aparece por acaso dentro de uma descrição. Exigir que TODAS as
       linhas tenham o separador zerava a conta em extrato com preâmbulo. */
    const freq={}; cont.forEach(n=>{ freq[n]=(freq[n]||0)+1; });
    const moda=Object.entries(freq).sort((a,b)=>b[1]-a[1]||b[0]-a[0])[0];
    const p=moda[1]*10+Number(moda[0]);
    if(p>pontos){ pontos=p; melhor=sep; }
  });
  return melhor;
}
/* Tokenizer próprio: aspas duplas, "" escapado e quebra de linha dentro do
   campo. split(";") quebraria em qualquer histórico com ponto e vírgula. */
export function parseCSV(texto,sep){
  const t=String(texto||"").replace(/^\uFEFF/,"");
  const out=[]; let linha=[], campo="", asp=false;
  for(let i=0;i<t.length;i++){
    const c=t[i];
    if(asp){
      if(c==='"'){ if(t[i+1]==='"'){ campo+='"'; i++; } else asp=false; }
      else campo+=c;
    }
    else if(c==='"') asp=true;
    else if(c===sep){ linha.push(campo); campo=""; }
    else if(c==="\n"){ linha.push(campo); out.push(linha); linha=[]; campo=""; }
    else if(c!=="\r") campo+=c;
  }
  if(campo!==""||linha.length){ linha.push(campo); out.push(linha); }
  return out.filter(l=>l.some(c=>String(c).trim()));
}

export const IMP_COLS={
  data:["data","dt","date","data lancamento","data movimento","data movimentacao",
        "data da compra","data operacao","data balancete","transaction date","data transacao"],
  /* "title" e "description" entram porque fintech exporta em inglês — a fatura
     do Nubank sai como date,title,amount */
  desc:["descricao","historico","lancamento","memo","nome","detalhe","estabelecimento",
        "descricao lancamento","historico lancamento","transacao","title","description",
        "merchant","local","titulo"],
  valor:["valor","amount","valor movimentado","valor lancamento","montante","valor r","value"],
  debito:["debito","saida","retirada","valor debito","debitos"],
  credito:["credito","entrada","receita","valor credito","creditos"],
  tipo:["tipo","tipo lancamento","natureza","tipo movimento","d c","dc"],
  /* identificador único da linha, quando o banco manda: o Nubank manda um UUID
     por transação, e ele é o melhor sinal de duplicidade que existe — melhor
     que valor + data + descrição, porque não muda se o lançamento for editado */
  id:["identificador","id da transacao","transaction id","autenticacao",
      "codigo da transacao","numero do documento"]
};
/* Casa o cabeçalho por igualdade, depois por prefixo, depois por conteúdo —
   nessa ordem, para "valor" não roubar a coluna "valor debito". */
export function detectarColunasCSV(cab){
  const norm=(cab||[]).map(normalizarTextoImportacao);
  const acha=lista=>{
    let i=norm.findIndex(n=>n&&lista.includes(n));
    if(i<0) i=norm.findIndex(n=>n&&lista.some(l=>n.startsWith(l)));
    if(i<0) i=norm.findIndex(n=>n&&lista.some(l=>n.includes(l)));
    return i<0?null:i;
  };
  const c={ data:acha(IMP_COLS.data), desc:acha(IMP_COLS.desc),
    debito:acha(IMP_COLS.debito), credito:acha(IMP_COLS.credito), tipo:acha(IMP_COLS.tipo) };
  c.valor=acha(IMP_COLS.valor);
  if(c.valor!=null&&(c.valor===c.debito||c.valor===c.credito)) c.valor=null;
  c.id=acha(IMP_COLS.id);
  /* "id" sozinho só vale na igualdade: por conteúdo casaria "cidade", "liquidez" */
  if(c.id==null){ const i=norm.indexOf("id"); c.id=i<0?null:i; }
  if(c.id!=null&&(c.id===c.data||c.id===c.desc||c.id===c.valor)) c.id=null;
  if(c.desc!=null&&c.desc===c.data) c.desc=null;
  c.confiavel=c.data!=null&&c.desc!=null&&(c.valor!=null||c.debito!=null||c.credito!=null);
  return c;
}
/* Descrição de Pix vem com nome, CPF, banco, agência e conta numa linha só —
   150 caracteres que na lista do app viram reticências e não identificam nada.
   O que identifica o lançamento é o nome da outra ponta; o resto é ruído de
   extrato, e continua guardado em descOriginal.

   Só age quando a estrutura é reconhecível ("<o que é> - <NOME> - <resto>"):
   descrição que não siga esse formato passa intacta. */
export function limparDescricaoImportacao(desc){
  const s=String(desc||"").trim().replace(/\s+/g," ");
  const p=s.split(" - ");
  if(p.length<3) return s;
  const nome=p[1].trim();
  if(!nome||nome.length<2||nome.length>60||!/[A-Za-zÀ-ÿ]{2}/.test(nome)) return s;
  /* só age quando a cauda é papelada de banco — CPF, CNPJ, agência ou conta.
     Descrição de fatura ("Mercado Livre - CUECAS - Parcela 1/2") tem a mesma
     forma e NÃO é isso: encurtar ali jogava fora justamente a parcela. */
  if(!/(ag[êe]ncia|conta:|•••|\d{3}\.\d{3}\.\d{3}|\d{2}\.\d{3}\.\d{3}\/)/i.test(p.slice(2).join(" - ")))
    return s;
  const t=normalizarTextoImportacao(p[0]);
  let cab=p[0].trim();
  if(/pix/.test(t)) cab=/receb/.test(t)?"Pix recebido":(/envi/.test(t)?"Pix enviado":"Pix");
  else if(/transferencia|ted|doc/.test(t)) cab=/receb/.test(t)?"Transferência recebida":"Transferência enviada";
  else if(/compra|pagamento|debito/.test(t)) cab=p[0].trim();
  return cab+" · "+nome;
}

/* Nem todo extrato começa pelo cabeçalho: muito banco põe antes o nome do
   relatório, a agência e o período. Procura nas primeiras linhas a que se
   identifica como cabeçalho de tabela; se nenhuma se identifica, fica com a
   mais preenchida — é a que dá a melhor tela de mapeamento manual. */
export function pareceLinhaDeDados(l){
  return (l||[]).some(c=>normalizarDataImportacao(c))&&
         (l||[]).some(c=>!isNaN(normalizarValorImportacao(c)));
}
export function acharCabecalhoCSV(bruto){
  const limite=Math.min(bruto.length,15);
  for(let i=0;i<limite;i++){
    const c=detectarColunasCSV(bruto[i]);
    if(c.confiavel) return {idx:i,cols:c};
  }
  /* extrato sem cabeçalho nenhum: a primeira linha JÁ é dado, e consumi-la como
     cabeçalho perderia uma transação inteira, em silêncio. idx -1 faz o
     slice(idx+1) começar do zero. */
  if(pareceLinhaDeDados(bruto[0]))
    return {idx:-1,cols:detectarColunasCSV(bruto[0].map(()=>"")),semCabecalho:true};
  let idx=0,mx=-1;
  for(let i=0;i<limite;i++){
    const n=bruto[i].filter(x=>String(x).trim()).length;
    if(n>mx){ mx=n; idx=i; }
  }
  return {idx,cols:detectarColunasCSV(bruto[idx])};
}
export function mapearCSV(linhas,cols){
  const movs=[];
  linhas.forEach(l=>{
    if(movs.length>=IMP_MAX_MOVS) return;
    let amount=NaN;
    if(cols.valor!=null) amount=normalizarValorImportacao(l[cols.valor]);
    if(isNaN(amount)&&(cols.debito!=null||cols.credito!=null)){
      const d=cols.debito!=null?normalizarValorImportacao(l[cols.debito]):NaN;
      const c=cols.credito!=null?normalizarValorImportacao(l[cols.credito]):NaN;
      const dd=isNaN(d)?0:Math.abs(d), cc=isNaN(c)?0:Math.abs(c);
      if(dd||cc) amount=cc-dd;
    }
    /* coluna D/C manda no sinal: muito banco exporta o valor sempre positivo */
    if(cols.tipo!=null&&!isNaN(amount)){
      const s=normalizarTextoImportacao(l[cols.tipo]);
      if(/^(d|debito|debit|saida)$/.test(s)) amount=-Math.abs(amount);
      else if(/^(c|credito|credit|entrada)$/.test(s)) amount=Math.abs(amount);
    }
    const bruta=String(l[cols.desc]??"").trim();
    movs.push({ data:normalizarDataImportacao(l[cols.data]), amount,
      desc:limparDescricaoImportacao(bruta)||"Movimentação",
      descBruta:bruta,
      fitid:cols.id!=null?(String(l[cols.id]??"").trim()||null):null });
  });
  return movs;
}

/* ---------- camada 3: INTELIGÊNCIA ---------- */

/* FNV-1a de 32 bits: determinística, curta e sem dependência. É a identidade do
   CSV, que quase nunca traz um id próprio como o FITID do OFX. */
export function gerarHashImportacao(s){
  let h=0x811c9dc5;
  const t=String(s||"");
  for(let i=0;i<t.length;i++){ h^=t.charCodeAt(i); h=Math.imul(h,0x01000193); }
  return (h>>>0).toString(16).padStart(8,"0");
}
/* Duas descrições são a mesma quando uma contém a outra ou quando compartilham
   a maior parte das palavras longas: "PIX ENVIADO MERCADO X" e "PIX MERCADO X"
   são o mesmo lançamento visto por dois canais. */
/* "Parcela 1/3" e "Parcela 2/3" são compras diferentes, mesmo com loja, valor e
   data da compra idênticos — e a fatura repete a data da compra em toda parcela.
   Numa fatura brasileira metade das linhas costuma ser parcela, então tratá-las
   como repetição faria o app engolir a parcela do mês seguinte, silenciosamente.

   Só decide quando AS DUAS declaram parcela: se uma não declara, quem resolve é
   a comparação normal — senão um lançamento digitado à mão deixaria de casar. */
export function numeroParcela(desc){
  const s=String(desc||"");
  let m=/parcela\s*(\d{1,2})\s*\/\s*(\d{1,2})/i.exec(s);
  if(!m) m=/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(s);
  return m?(m[1]+"/"+m[2]):null;
}
export function mesmaParcela(a,b){
  const pa=numeroParcela(a), pb=numeroParcela(b);
  if(!pa||!pb) return true;
  return pa===pb;
}
export function compararDescricoesImportacao(a,b){
  if(!mesmaParcela(a,b)) return false;
  const x=normalizarTextoImportacao(a), y=normalizarTextoImportacao(b);
  if(!x||!y) return false;
  if(x===y||x.includes(y)||y.includes(x)) return true;
  const tx=x.split(" ").filter(p=>p.length>=4), ty=y.split(" ").filter(p=>p.length>=4);
  if(!tx.length||!ty.length) return false;
  const comuns=tx.filter(p=>ty.includes(p)).length;
  return comuns/Math.min(tx.length,ty.length)>=0.6;
}

/* `sinal` é QUAL SINAL REPRESENTA DESPESA, e ele não é o mesmo nos dois
   documentos: no extrato de conta despesa é negativa (o dinheiro saiu), e numa
   fatura depende do banco — o Nubank manda a compra positiva, o OFX de cartão
   manda negativa. Por isso a conta usa -1 fixo e a fatura pergunta à maioria. */
export function sugerirTipoImportacao(mov,sinal){
  /* quando o arquivo declara o tipo (TRNTYPE do OFX), ele manda: só DEBIT e
     CREDIT, que são inequívocos — PAYMENT significa coisas opostas no extrato
     de conta e na fatura de cartão. */
  if(mov.tipo==="DEBIT") return "exp";
  if(mov.tipo==="CREDIT") return "inc";
  return Math.sign(mov.amount)===(sinal||-1)?"exp":"inc";
}
/* Numa fatura a maioria das linhas é compra, então o sinal predominante é o da
   despesa — e o oposto é estorno ou pagamento da fatura. */
export function sinalFatura(movs){
  let pos=0,neg=0;
  movs.forEach(m=>{ if(isNaN(m.amount)||!m.amount) return; m.amount>0?pos++:neg++; });
  return neg>pos?-1:1;
}
/* "PAGAMENTO RECEBIDO" na fatura é a quitação da fatura anterior, que já foi
   lançada do lado da conta. Importar de novo criaria uma receita que nunca
   existiu e a fatura do mês pareceria menor do que é. */
export function ehPagamentoFatura(desc){
  return /\b(pagamento|pgto|pagto)\b/.test(normalizarTextoImportacao(desc));
}

/* nunca "cartao" nem "ticket": o extrato é da conta, e a fatura do cartão é
   outro lugar do app — atribuir aqui faria o valor sair duas vezes */
export const IMP_METODO=[
  [/\bpix\b/,"pix"],
  [/\b(ted|doc)\b|transferenc/,"transferencia"],
  [/boleto|titulo de cobranca|cobranca bancaria/,"boleto"],
  [/saque|em especie|dinheiro/,"dinheiro"]
];
export function sugerirMetodoImportacao(desc){
  const d=normalizarTextoImportacao(desc);
  for(const [re,m] of IMP_METODO) if(re.test(d)) return m;
  return "debito";
}
/* Palavras → categoria. A sugestão só vale se a categoria existir na lista do
   usuário: a importação nunca cria categoria. Sem correspondência fica vazia —
   em branco é honesto, chutar não. Chaves curtas ficaram de fora de propósito
   ("gol", "oi", "max"): o falso positivo custa mais caro que o campo vazio. */
export const IMP_CATS=[
  [["ifood","uber eats","rappi","restaurante","lanchonete","padaria","pizzaria","hamburgueria",
    "cafeteria","burguer","burger","lanche","food","acai","sushi"],["Restaurantes/Delivery","Alimentação"]],
  [["mercado","supermercado","atacadao","hortifruti","acougue","carrefour","assai","pao de acucar"],
   ["Mercado","Alimentação"],["mercado livre","mercado pago","mercadolivre","mercadopago"]],
  [["posto","combustivel","gasolina","shell","ipiranga","petrobras"],["Combustível","Transporte"]],
  [["uber","99app","taxi","onibus","metro","bilhete unico","estacionamento","pedagio"],["Transporte"]],
  [["farmacia","drogaria","droga raia","drogasil","panvel"],["Farmácia","Saúde"]],
  [["hospital","clinica","laboratorio","dentista","unimed","amil","plano de saude"],["Saúde"]],
  [["netflix","spotify","prime video","disney","hbo","youtube premium","deezer","globoplay"],["Assinaturas"]],
  [["vivo","claro","telefonica","internet","banda larga","telefone"],["Internet/Telefone"]],
  [["energia","cemig","enel","copel","light","sabesp","saneamento","conta de agua"],["Contas de Casa"]],
  [["aluguel","condominio","imobiliaria"],["Aluguel","Moradia"]],
  [["academia","smart fit","smartfit","gympass","crossfit","pilates"],["Academia/Esportes"]],
  [["escola","faculdade","universidade","mensalidade","udemy","alura"],["Educação","Cursos"]],
  [["petshop","pet shop","veterinar","petz","cobasi"],["Pets"]],
  [["cinema","teatro","ingresso","steam","playstation","xbox","nintendo"],["Lazer"]],
  [["hotel","pousada","airbnb","passagem aerea","latam","decolar"],["Viagens"]],
  [["tarifa","iof","anuidade","manutencao de conta","cesta de servicos"],["Tarifas Bancárias"]],
  [["imposto","darf","iptu","ipva","tributo","receita federal"],["Impostos/Taxas"]],
  [["emprestimo","financiamento","consignado"],["Empréstimos/Dívidas"]],
  [["salario","folha de pagamento","proventos","remuneracao"],["Salário"]],
  [["rendimento","dividendo","juros sobre","cdb","tesouro direto","aplicacao"],["Rendimentos"]],
  [["reembolso","estorno","devolucao"],["Reembolso"]]
];
export function sugerirCategoriaImportacao(desc,tipo,nomesCategorias){
  const d=" "+normalizarTextoImportacao(desc)+" ";
  const lista=nomesCategorias||[];
  for(const [chaves,cands,excecoes] of IMP_CATS){
    /* "Mercado Livre" e "Mercado Pago" não são supermercado: sem a exceção,
       compra de roupa em marketplace entrava como Mercado */
    if(excecoes&&excecoes.some(k=>d.includes(k))) continue;
    if(!chaves.some(k=>d.includes(k))) continue;
    const ok=cands.find(c=>lista.includes(c));
    if(ok) return ok;
  }
  return "";
}

/* "SALDO ANTERIOR", "SALDO DO DIA", "TOTAL DO PERÍODO" são a régua do extrato,
   não movimentação. Sem isso viravam lançamento fantasma — e um saldo anterior
   de mil reais entrando como receita estraga o mês inteiro. */
export function ehLinhaDeSaldo(desc){
  const d=normalizarTextoImportacao(desc);
  return /^saldo\b/.test(d)||/\bsaldo (anterior|final|do dia|em conta|atual)\b/.test(d)||
    /^total (do periodo|geral|de lancamentos|despesas|debitos|de pagamentos|de creditos)\b/.test(d)||
    /^valor total\b/.test(d)||/^total a pagar\b/.test(d);
}
/* movimentação crua → movimentação validada; erro descrito, nunca silencioso */
export function normalizarMovimentacaoImportada(mov){
  if(ehLinhaDeSaldo(mov.desc)) return {ok:false,erro:"Linha de saldo, não é movimentação"};
  if(!mov.data) return {ok:false,erro:"Data não reconhecida"};
  if(isNaN(mov.amount)) return {ok:false,erro:"Valor não reconhecido"};
  if(!mov.amount) return {ok:false,erro:"Valor zerado"};
  return {ok:true,erro:null};
}
