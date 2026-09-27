/* Ids gerados no aparelho. O Firestore aceita qualquer string como id, e
   gerar aqui permite montar o lote inteiro (documento, parcelas, pagamento,
   lançamento) antes de gravar — um writeBatch só, tudo ou nada. */
export function novoId(prefixo=""){
  const r=(globalThis.crypto&&crypto.getRandomValues)
    ? Array.from(crypto.getRandomValues(new Uint8Array(8)),b=>b.toString(36).padStart(2,"0")).join("").slice(0,12)
    : Math.random().toString(36).slice(2,14);
  return prefixo+Date.now().toString(36)+r;
}
