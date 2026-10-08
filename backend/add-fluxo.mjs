// ============================================================================
// Fluxo de Caixa Diário (MISA) — nova SF de leitura (publica, via servico).
// Matriz empresa x dia a partir de AD_SALDOS (saldo inicial + encaixe) + as
// movimentacoes de aprovacao/analise (AD_APROFIN x MOV_DIARIO_MISA).
//   disponivel = (saldoInicial + encaixe) - (aprovado + analise)   [mesma regra dos Saldos]
// Requer periodo (dataInicial, dataFinal em YYYY-MM-DD). Idempotente.
// ============================================================================
import 'dotenv/config';
import { configureSdkMitra, listServerFunctionsMitra, createServerFunctionMitra, updateServerFunctionMitra, togglePublicExecutionMitra } from 'mitra-sdk';

configureSdkMitra({ baseURL: process.env.MITRA_BASE_URL, token: process.env.MITRA_TOKEN, integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS });
const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const SVC = 'sankhya-svc';

const CODE = `
const sdk = require('mitra-sdk');
const projectId = event.projectId || parseInt(process.env.MITRA_PROJECT_ID);
function sankhyaQuery(sql){
  return sdk.callIntegrationMitra({ projectId, connection: '${SVC}', method: 'POST', endpoint: '/mge/service.sbr',
    params: { serviceName: 'DbExplorerSP.executeQuery', outputType: 'json' },
    body: { serviceName: 'DbExplorerSP.executeQuery', requestBody: { sql } } });
}
function rowsOf(r){ const b = r && (r.body || r); return (b && b.responseBody && b.responseBody.rows) || []; }
function statusOf(r){ const b = r && (r.body || r); return b && b.status; }
function trim(v){ return (typeof v === 'string') ? v.trim() : v; }

const di = String(event.dataInicial||'').replace(/[^0-9-]/g,'');
const df = String(event.dataFinal||'').replace(/[^0-9-]/g,'');
if (!di || !df) return { ok:false, message:'Informe o periodo (data inicial e final).' };

const sql = "SELECT S.CODEMP, EMP.NOMEFANTASIA, COALESCE(EMP.CODEMPMATRIZ, EMP.CODEMP) AS CODMAT,"
 + " COALESCE(MAT.NOMEFANTASIA, EMP.NOMEFANTASIA) AS NOMEMAT, CONVERT(varchar(10), S.DATA, 23) AS DIA,"
 + " COALESCE(S.SALDOINICIAL,0) AS SINI, COALESCE(S.SALDOENCAIXE,0) AS ENC,"
 + " COALESCE(A.ANALISE,0) AS ANA, COALESCE(A.APROVADO,0) AS APR"
 + " FROM AD_SALDOS S"
 + " JOIN TSIEMP EMP ON EMP.CODEMP=S.CODEMP"
 + " LEFT JOIN TSIEMP MAT ON MAT.CODEMP=COALESCE(EMP.CODEMPMATRIZ, EMP.CODEMP)"
 + " LEFT JOIN ("
 + "   SELECT FIN.CODEMP, CAST(APR.DHALTER AS DATE) AS DIA,"
 + "     SUM(CASE WHEN APR.STATUS=2 THEN FIN.VLRDESDOB ELSE 0 END) AS ANALISE,"
 + "     SUM(CASE WHEN APR.STATUS=3 THEN FIN.VLRDESDOB ELSE 0 END) AS APROVADO"
 + "   FROM MOV_DIARIO_MISA FIN"
 + "   JOIN (SELECT NUFIN, MAX(STATUS) AS STATUS, MAX(DHALTER) AS DHALTER FROM AD_APROFIN GROUP BY NUFIN) APR ON APR.NUFIN=FIN.NUFIN"
 + "   GROUP BY FIN.CODEMP, CAST(APR.DHALTER AS DATE)"
 + " ) A ON A.CODEMP=S.CODEMP AND A.DIA=CAST(S.DATA AS DATE)"
 + " WHERE S.CODEMP<>999 AND CAST(S.DATA AS DATE) BETWEEN '" + di + "' AND '" + df + "'"
 + " ORDER BY CODMAT, S.CODEMP, S.DATA";

const r = await sankhyaQuery(sql);
if (statusOf(r)!=='1'){ const b=r&&(r.body||r); return { ok:false, message:(b&&b.statusMessage)||'Erro na consulta do fluxo.' }; }

const diasSet = {}, empMap = {}, totais = {};
rowsOf(r).forEach(function(x){
  const codemp=x[0], nome=trim(x[1]), codmat=x[2], nomemat=trim(x[3]), dia=x[4];
  const sini=Number(x[5])||0, enc=Number(x[6])||0, ana=Number(x[7])||0, apr=Number(x[8])||0;
  const disp=(sini+enc)-(apr+ana);
  diasSet[dia]=true;
  if(!empMap[codemp]) empMap[codemp]={ codemp:codemp, nome:nome, codmat:codmat, nomemat:nomemat, dias:{} };
  empMap[codemp].dias[dia]={ sini:sini, enc:enc, ana:ana, apr:apr, disp:disp };
  if(!totais[dia]) totais[dia]={ sini:0, enc:0, ana:0, apr:0, disp:0 };
  totais[dia].sini+=sini; totais[dia].enc+=enc; totais[dia].ana+=ana; totais[dia].apr+=apr; totais[dia].disp+=disp;
});
const dias = Object.keys(diasSet).sort();
const empresas = Object.keys(empMap).map(function(k){ return empMap[k]; }).sort(function(a,b){ return (a.codmat-b.codmat) || (a.codemp-b.codemp); });
return { ok:true, dias:dias, empresas:empresas, totais:totais };
`;

async function main() {
  const l = await listServerFunctionsMitra({ projectId });
  const arr = l?.result || l || [];
  const existing = (Array.isArray(arr) ? arr : []).find(x => x.name === 'fluxoCaixa');
  let id;
  if (existing) {
    id = existing.id;
    await updateServerFunctionMitra({ projectId, serverFunctionId: id, code: CODE, description: 'Fluxo de caixa diario: matriz empresa x dia (saldoInicial, encaixe, analise, aprovado, disponivel) de AD_SALDOS + AD_APROFIN. Requer dataInicial e dataFinal (YYYY-MM-DD).' });
    console.log('SF atualizada: fluxoCaixa (id', id + ')');
  } else {
    const c = await createServerFunctionMitra({ projectId, name: 'fluxoCaixa', type: 'JAVASCRIPT', code: CODE, description: 'Fluxo de caixa diario: matriz empresa x dia (saldoInicial, encaixe, analise, aprovado, disponivel) de AD_SALDOS + AD_APROFIN. Requer dataInicial e dataFinal (YYYY-MM-DD).' });
    id = c?.result?.serverFunctionId || c?.serverFunctionId || c?.result?.id;
    console.log('SF criada: fluxoCaixa (id', id + ')');
  }
  await togglePublicExecutionMitra({ projectId, serverFunctionId: id, publicExecution: true });
  console.log('fluxoCaixa publica. ID =', id);
}
main().catch(e => { console.error('FALHOU:', e?.response?.data ? JSON.stringify(e.response.data) : (e?.message || e)); process.exit(1); });
