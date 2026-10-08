// ============================================================================
// Update pontual: SF 'aprovar' passa a MANTER o registro de Analise (STATUS=2).
// Assim, "cancelar aprovacao" (remover STATUS=3) volta o titulo a Em Analise
// (se passou por analise) ou a Pendente (se foi aprovado direto).
// NAO reexecuta o setup inteiro — atualiza somente a SF 'aprovar'.
// ============================================================================
import 'dotenv/config';
import { configureSdkMitra, listServerFunctionsMitra, updateServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});
const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const SVC = 'sankhya-svc';

const JS_HEAD = `
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
function isoToBR(s){ if(!s) return null; const p = String(s).split('-'); return p.length===3 ? (p[2]+'/'+p[1]+'/'+p[0]) : s; }
`;
const DATASET = `
function datasetSave(records){
  return sdk.callIntegrationMitra({ projectId, connection: '${SVC}', method: 'POST', endpoint: '/mge/service.sbr',
    params: { serviceName: 'DatasetSP.save', outputType: 'json' },
    body: { serviceName: 'DatasetSP.save', requestBody: { entityName: 'AD_APROFIN', standAlone: false, fields: ['NUFIN','STATUS','CODUSU'], records: records } } });
}
function datasetRemove(pks){
  return sdk.callIntegrationMitra({ projectId, connection: '${SVC}', method: 'POST', endpoint: '/mge/service.sbr',
    params: { serviceName: 'DatasetSP.removeRecord', outputType: 'json' },
    body: { serviceName: 'DatasetSP.removeRecord', requestBody: { entityName: 'AD_APROFIN', pks: pks } } });
}
`;
const RESOLVE_IDUSU = `
const idusu = (event.codusu !== undefined && event.codusu !== null && event.codusu !== '') ? parseInt(event.codusu, 10) : null;
if (idusu === null || isNaN(idusu)) { return { ok: false, message: 'Usuario nao identificado. Faca login novamente.' }; }
`;

const code = JS_HEAD + DATASET + RESOLVE_IDUSU + `
const nufins0 = (event.nufins||[]).map(function(n){ return parseInt(n); }).filter(Boolean);
if (!nufins0.length) return { ok:false, message:'Nenhum NUFIN informado.' };
const chk = await sankhyaQuery("SELECT NUFIN, MAX(STATUS) AS ST FROM AD_APROFIN WHERE NUFIN IN (" + nufins0.join(',') + ") GROUP BY NUFIN");
const maxSt = {}; rowsOf(chk).forEach(function(x){ maxSt[String(x[0])] = Number(x[1]); });
const nufins = nufins0.filter(function(n){ return !(maxSt[String(n)] >= 3); });
const ignorados = nufins0.length - nufins.length;
if (!nufins.length) return { ok:true, aprovados:0, ignorados: ignorados, message:'Nenhum título elegível: já aprovado.' };
const records = nufins.map(function(n){ return { values: { '0': String(n), '1': '3', '2': String(idusu) } }; });
const r = await datasetSave(records);
const b = r && (r.body || r);
if (!(b && b.status==='1')) return { ok:false, message:(b&&b.statusMessage)||'Erro ao aprovar' };
// NAO remove o registro de Analise (STATUS=2): mantido de proposito para que "cancelar aprovacao"
// (remover o STATUS=3) faca o titulo voltar a Em Analise (MAX(STATUS)=2) quando passou por analise,
// ou a Pendente (sem registro) quando foi aprovado direto do pendente.
return { ok:true, aprovados: nufins.length, ignorados: ignorados, codusu: idusu };
`;

const description = 'Aprova (STATUS=3, CODUSU server-side). Maquina de estados (RN): so aprova quem ainda nao esta aprovado (MAX(STATUS)<3) — pendente ou em analise. Ja aprovado e ignorado (nao gera chave duplicada). MANTEM o registro de Analise (STATUS=2) de quem passou por analise, para que "cancelar aprovacao" volte a Em Analise (ou a Pendente, se foi aprovado direto).';

const l = await listServerFunctionsMitra({ projectId });
const arr = l?.result || l || [];
const sf = (Array.isArray(arr) ? arr : []).find(x => x.name === 'aprovar');
if (!sf) { console.error('SF aprovar nao encontrada'); process.exit(1); }
await updateServerFunctionMitra({ projectId, serverFunctionId: sf.id, code, description });
console.log('SF aprovar atualizada (id', sf.id + ') — mantem STATUS=2 na aprovacao.');
