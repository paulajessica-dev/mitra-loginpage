// ============================================================================
// Hardening de gravação: as SFs de ESCRITA passam a executar sob a SESSÃO do
// usuário logado (jsessionid do MobileLoginSP), via passthrough sankhya-calviva
// com a sessão embutida no path (/mge/service.sbr;jsessionid=...).
//  - Nenhuma gravação ocorre sem uma sessão Sankhya válida/ativa (o ERP rejeita
//    com "Não autorizado").
//  - As permissões de serviço do Sankhya do usuário passam a valer na gravação.
//  - As LEITURAS continuam pela conexão de serviço (sankhya-svc).
// Idempotente: só atualiza (updateServerFunctionMitra) as SFs por nome.
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
const RAW = 'sankhya-calviva';

// Cabeçalho comum (leituras internas continuam via serviço)
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
`;

// Gravações sob a SESSÃO do usuário (jsessionid embutido no path do servlet)
const USER_DATASET = `
function _epUser(js){ return '/mge/service.sbr;jsessionid=' + js; }
function datasetSaveUser(js, records){
  return sdk.callIntegrationMitra({ projectId, connection: '${RAW}', method: 'POST', endpoint: _epUser(js),
    params: { serviceName: 'DatasetSP.save', outputType: 'json' },
    body: { serviceName: 'DatasetSP.save', requestBody: { entityName: 'AD_APROFIN', standAlone: false, fields: ['NUFIN','STATUS','CODUSU'], records: records } } });
}
function datasetRemoveUser(js, pks){
  return sdk.callIntegrationMitra({ projectId, connection: '${RAW}', method: 'POST', endpoint: _epUser(js),
    params: { serviceName: 'DatasetSP.removeRecord', outputType: 'json' },
    body: { serviceName: 'DatasetSP.removeRecord', requestBody: { entityName: 'AD_APROFIN', pks: pks } } });
}
function _semAutorizacao(b){ const m = b && b.statusMessage ? String(b.statusMessage) : ''; return m.toLowerCase().indexOf('autoriza') >= 0; }
function _erroGravacao(b){ return _semAutorizacao(b) ? 'Sessao Sankhya expirada ou sem permissao. Faca login novamente.' : ((b && b.statusMessage) || 'Erro ao gravar no Sankhya.'); }
`;

// Guards: identidade (codusu do login) + sessão ativa (jsessionid)
const GUARDS = `
const idusu = (event.codusu !== undefined && event.codusu !== null && event.codusu !== '') ? parseInt(event.codusu, 10) : null;
if (idusu === null || isNaN(idusu)) { return { ok: false, message: 'Usuario nao identificado. Faca login novamente.' }; }
const jsession = event.jsession || event.jsessionid;
if (!jsession) { return { ok: false, message: 'Sessao Sankhya ausente. Faca login novamente.' }; }
`;

const SFS = {
  // LOGIN: agora também devolve o jsessionid para o front guardar
  sankhyaLogin: JS_HEAD + `
const r = await sdk.callIntegrationMitra({ projectId, connection: '${RAW}', method: 'POST', endpoint: '/mge/service.sbr',
  params: { serviceName: 'MobileLoginSP.login', outputType: 'json' },
  body: { serviceName: 'MobileLoginSP.login', requestBody: { NOMUSU: { '$': event.usuario }, INTERNO: { '$': event.senha }, KEEPCONNECTED: { '$': 'S' } } } });
const b = r && (r.body || r);
if (!b || b.status !== '1') { return { ok: false, message: (b && b.statusMessage) || 'Usuario ou senha invalidos.' }; }
const rb = b.responseBody || {};
function dec(s){ try { const v = Buffer.from(String(s||'').trim(), 'base64').toString('utf8').trim(); if (v==='') return null; const n = parseInt(v, 10); return isNaN(n) ? null : n; } catch(e){ return null; } }
const idusu = dec(rb.idusu && rb.idusu['$']); // CODUSU pode ser 0 (usuario SUP/supervisor)
if (idusu === null) { return { ok: false, message: 'Login sem idusu.' }; }
const jsession = (rb.jsessionid && rb.jsessionid['$']) || null; // sessao do usuario (para as gravacoes)
let nome = event.usuario;
try { const q = await sankhyaQuery("SELECT NOMEUSU FROM TSIUSU WHERE CODUSU=" + idusu); const rows = rowsOf(q); if (rows[0]) nome = trim(rows[0][0]); } catch(e){}
return { ok: true, idusu: idusu, nome: nome, jsession: jsession };
`,

  // GRAVAR ANALISE (STATUS=2) sob a sessão do usuário
  gravarAnalise: JS_HEAD + USER_DATASET + GUARDS + `
const nufins0 = (event.nufins||[]).map(function(n){ return parseInt(n); }).filter(Boolean);
if (!nufins0.length) return { ok:false, message:'Nenhum NUFIN informado.' };
const chk = await sankhyaQuery("SELECT NUFIN, MAX(STATUS) AS ST FROM AD_APROFIN WHERE NUFIN IN (" + nufins0.join(',') + ") GROUP BY NUFIN");
const maxSt = {}; rowsOf(chk).forEach(function(x){ maxSt[String(x[0])] = Number(x[1]); });
const nufins = nufins0.filter(function(n){ return !(maxSt[String(n)] >= 2); });
const ignorados = nufins0.length - nufins.length;
if (!nufins.length) return { ok:true, gravados:0, ignorados: ignorados, message:'Nenhum título elegível: já em análise ou aprovado.' };
const records = nufins.map(function(n){ return { values: { '0': String(n), '1': '2', '2': String(idusu) } }; });
const r = await datasetSaveUser(jsession, records);
const b = r && (r.body || r);
if (!(b && b.status==='1')) return { ok:false, message: _erroGravacao(b) };
return { ok:true, gravados: nufins.length, ignorados: ignorados, codusu: idusu };
`,

  // APROVAR (STATUS=3) sob a sessão do usuário
  aprovar: JS_HEAD + USER_DATASET + GUARDS + `
const nufins0 = (event.nufins||[]).map(function(n){ return parseInt(n); }).filter(Boolean);
if (!nufins0.length) return { ok:false, message:'Nenhum NUFIN informado.' };
const chk = await sankhyaQuery("SELECT NUFIN, MAX(STATUS) AS ST FROM AD_APROFIN WHERE NUFIN IN (" + nufins0.join(',') + ") GROUP BY NUFIN");
const maxSt = {}; rowsOf(chk).forEach(function(x){ maxSt[String(x[0])] = Number(x[1]); });
const nufins = nufins0.filter(function(n){ return !(maxSt[String(n)] >= 3); });
const ignorados = nufins0.length - nufins.length;
if (!nufins.length) return { ok:true, aprovados:0, ignorados: ignorados, message:'Nenhum título elegível: já aprovado.' };
const records = nufins.map(function(n){ return { values: { '0': String(n), '1': '3', '2': String(idusu) } }; });
const r = await datasetSaveUser(jsession, records);
const b = r && (r.body || r);
if (!(b && b.status==='1')) return { ok:false, message: _erroGravacao(b) };
// MANTEM o registro de Analise (STATUS=2) de proposito (para "cancelar aprovacao" voltar corretamente).
return { ok:true, aprovados: nufins.length, ignorados: ignorados, codusu: idusu };
`,

  // DESAPROVAR (remove NUFIN+STATUS) sob a sessão do usuário
  desaprovar: JS_HEAD + USER_DATASET + `
const jsession = event.jsession || event.jsessionid;
if (!jsession) { return { ok:false, message:'Sessao Sankhya ausente. Faca login novamente.' }; }
const itens = event.itens || (event.nufin ? [{ nufin: event.nufin, status: event.status }] : []);
const pks = itens.map(function(it){ return { NUFIN: String(it.nufin), STATUS: String(it.status) }; });
if (!pks.length) return { ok:false, message:'Nada para remover.' };
const r = await datasetRemoveUser(jsession, pks);
const b = r && (r.body || r);
if (!(b && b.status==='1')) return { ok:false, message: _erroGravacao(b) };
return { ok:true, removidos: pks.length };
`,
};

async function main() {
  const l = await listServerFunctionsMitra({ projectId });
  const arr = l?.result || l || [];
  const byName = {};
  for (const f of (Array.isArray(arr) ? arr : [])) byName[f.name] = f.id;

  for (const [name, code] of Object.entries(SFS)) {
    const id = byName[name];
    if (!id) { console.log('SF NAO ENCONTRADA (pulando):', name); continue; }
    await updateServerFunctionMitra({ projectId, serverFunctionId: id, code });
    console.log('SF atualizada:', name, '(id', id + ')');
  }
  console.log('\nHardening de gravação por sessão aplicado.');
}
main().catch(e => { console.error('FALHOU:', e?.response?.data ? JSON.stringify(e.response.data) : (e?.message || e)); process.exit(1); });
