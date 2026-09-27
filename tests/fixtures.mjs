/* Um usuário do 2.2 plausível: duas contas, cartão com parcelado, aluguel
   fixo, salário, pessoas, meta, vale e alguns atrasados. As datas são
   relativas a HOJE, para os prints sempre mostrarem um mês vivo. */
export function legadoDemo(hojeIso){
  const [Y,M,D]=hojeIso.split("-").map(Number);
  const d=(dm,dia)=>{ const t=new Date(Y,M-1+dm,dia); return t.getFullYear()+"-"+String(t.getMonth()+1).padStart(2,"0")+"-"+String(t.getDate()).padStart(2,"0"); };
  const mes=dm=>d(dm,1).slice(0,7);
  let n=0; const id=()=>"t"+(++n);
  const tx=(o)=>Object.assign({id:id(),gid:null,type:"exp",dest:null,desc:"",cat:"Outros",method:"pix",cardId:null,ticketId:null,goalId:null,
    accId:"a1",pesId:null,kind:"avista",i:1,n:1,amount:0,due:d(0,1),comp:null,paid:false,payDate:null,payAmt:null},o);
  const out=[];
  for(let m=-3;m<=0;m++){
    out.push(tx({type:"inc",cat:"Salário",desc:"Salário",method:"transferencia",amount:6500,due:d(m,5),paid:true,payDate:d(m,5)}));
    out.push(tx({desc:"Mercado Bom Preço",cat:"Mercado",amount:780+m*35,due:d(m,8),paid:true,payDate:d(m,8),method:"debito"}));
    out.push(tx({desc:"Conta de luz",cat:"Contas de Casa",amount:212.4-m*9,due:d(m,15),paid:m<0,payDate:m<0?d(m,15):null,method:"boleto"}));
    out.push(tx({desc:"Internet Vivo",cat:"Internet/Telefone",amount:119.9,due:d(m,20),paid:m<0,payDate:m<0?d(m,20):null,method:"debito"}));
    out.push(tx({desc:"iFood",cat:"Restaurantes/Delivery",amount:64.5+m*4,due:d(m,12),paid:true,payDate:d(m,12),method:"cartao",cardId:"c1",accId:m<0?"a1":null}));
    out.push(tx({desc:"Farmácia",cat:"Farmácia",amount:89.9,due:d(m,17),paid:m<0,payDate:m<0?d(m,17):null,method:"cartao",cardId:"c1",accId:m<0?"a1":null}));
  }
  const gidAl="gAl";
  for(let m=-3;m<=3;m++) out.push(tx({gid:gidAl,kind:"fixo",perp:1,i:m+4,n:0,desc:"Aluguel",cat:"Aluguel",amount:1850,due:d(m,10),paid:m<0,payDate:m<0?d(m,10):null,method:"pix",pesId:"p2"}));
  const gidTv="gTv";
  for(let i=0;i<10;i++){ const m=i-2; out.push(tx({gid:gidTv,kind:"parcelado",i:i+1,n:10,desc:"Televisão 55\"",cat:"Tecnologia",amount:329.9,due:d(m,17),paid:m<0,payDate:m<0?d(m,17):null,method:"cartao",cardId:"c1",accId:m<0?"a1":null})); }
  out.push(tx({type:"inc",cat:"Freelance",desc:"Site da Maxi Teq",amount:2400,due:d(0,-4+D),method:"pix",pesId:"p1"}));
  out.push(tx({type:"inc",cat:"Freelance",desc:"Manutenção Maxi Teq",amount:900,due:d(0,D+6),method:"pix",pesId:"p1"}));
  out.push(tx({desc:"Empréstimo do João",cat:"Empréstimos/Dívidas",amount:500,due:d(0,D-2),pesId:"p3",method:"pix"}));
  out.push(tx({type:"xfer",desc:"Para o Inter",accId:"a1",accTo:"a2",amount:800,due:d(-1,6),paid:true,payDate:d(-1,6),method:"transferencia",cat:"Transferência"}));
  out.push(tx({desc:"Uber",cat:"Transporte",amount:38.4,due:d(0,Math.max(1,D-1)),paid:true,payDate:d(0,Math.max(1,D-1)),accId:"a2",method:"debito"}));
  out.push(tx({dest:"savings",goalId:"g1",cat:"Poupança",desc:"Poupança: Viagem",amount:600,due:d(-1,6),paid:true,payDate:d(-1,6),method:"transferencia"}));
  out.push(tx({dest:"savings",goalId:"g1",cat:"Poupança",desc:"Poupança: Viagem",amount:600,due:d(0,6),paid:true,payDate:d(0,6),method:"transferencia"}));
  out.push(tx({method:"ticket",ticketId:"k1",accId:null,desc:"Almoço",cat:"Alimentação",amount:42,due:d(0,3)}));
  out.forEach(t=>{ if(!t.gid) t.gid=t.id; });
  return { appName:"WIGO", expCats:["Alimentação","Mercado","Restaurantes/Delivery","Transporte","Aluguel","Contas de Casa","Internet/Telefone","Farmácia","Tecnologia","Empréstimos/Dívidas","Outros"],
    incCats:["Salário","Freelance","Outros"],
    accounts:[{id:"a1",name:"Nubank",bank:"Nubank",type:"corrente",color:"#8a05be",opening:{amount:3200,month:mes(-3)}},
              {id:"a2",name:"Inter",bank:"Inter",type:"corrente",color:"#ff7a00",opening:{amount:450,month:mes(-3)}}],
    people:[{id:"p1",name:"Maxi Teq",note:"cliente"},{id:"p2",name:"Imobiliária Lar",note:""},{id:"p3",name:"João",note:"amigo"}],
    cards:[{id:"c1",bank:"Nubank",nick:"Roxinho",color:"#5b21b6",noLimit:false,limit:6000,closeDay:10,dueDay:17,accId:"a1"}],
    tickets:[{id:"k1",brand:"VR",name:"VR Refeição",color:"#b45309",monthly:800,day:1,overrides:{}}],
    goals:[{id:"g1",name:"Viagem",bank:"Nubank",color:"#0f766e",goal:8000,monthly:600,cdi:100,showHome:true,moves:[{id:"mv0",date:d(-4,20),amount:1500,kind:"in"}]}],
    tx:out, tutorialSeen:true, seenVersion:"2.2", tourAdvSeen:true };
}
