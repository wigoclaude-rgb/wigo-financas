/* Percorre as telas e salva prints (desktop e celular). Uso:
   node tests/prints.mjs <pasta> [desktop|celular|ambos] [rota,rota…] */
import { iniciar, encerrar, abrir } from "./navegador.mjs";
import { legadoDemo } from "./fixtures.mjs";
const [,,pasta="/tmp",modo="desktop",filtro]=process.argv;
const ROTAS=["visao","movimentos","pagar","receber","faturas","pagamentos","recebimentos","transferencias","reconciliacao",
  "parceiros","contas","cartoes","categorias","relatorios","relatorios/razao","relatorios/fluxo","relatorios/resultado",
  "relatorios/avancados","relatorios/cartoes","relatorios/obrigacoes","relatorios/conciliacao","relatorios/saldos","relatorios/parceiros","importacao","ajustes"];
const rotas=filtro?filtro.split(","):ROTAS;
await iniciar();
const hoje="2026-09-27T12:00:00-03:00";
for(const [nome,larg,alt] of (modo==="ambos"?[["d",1440,900],["m",390,844]]:modo==="celular"?[["m",390,844]]:[["d",1440,900]])){
  const {p,erros,ctx}=await abrir({largura:larg,altura:alt,legado:legadoDemo("2026-09-27"),hoje});
  await p.waitForSelector("#painel.on",{timeout:15000});
  await p.screenshot({path:pasta+"/"+nome+"-migracao.png"});
  await p.click('#painel [data-a="painel-fechar"]'); await p.waitForTimeout(300);
  for(const r of rotas){
    await p.evaluate(h=>{ location.hash=h; scrollTo(0,0); },"#/"+r); await p.waitForTimeout(450);
    /* a tela como aparece ao abrir… */
    if(nome==="m") await p.screenshot({path:pasta+"/"+nome+"-"+r.replace(/\//g,"_")+"-tela.png"});
    /* …e inteira, sem a barra fixa do rodapé cobrindo o meio */
    await p.addStyleTag({content:".dock{display:none!important}"}).catch(()=>{});
    await p.screenshot({path:pasta+"/"+nome+"-"+r.replace(/\//g,"_")+".png",fullPage:true});
    await p.evaluate(()=>document.querySelectorAll("style").forEach(s=>{ if(s.textContent.includes(".dock{display:none")) s.remove(); }));
  }
  console.log(nome,"erros:",JSON.stringify(erros));
  await ctx.close();
}
await encerrar();
