// ============================================================================
// Portal de Aprovacao de Titulos Financeiros (MISA) — setup do backend
// Arquitetura HIBRIDA validada no gate:
//  - Login por-usuario (MobileLoginSP) captura o idusu + jsessionid do aprovador
//  - LEITURA via integracao de SERVICO (sankhya-svc)
//  - ESCRITA (aprovar/analise/desaprovar) executa sob a SESSAO do usuario
//    (jsessionid embutido no path do servlet, via passthrough sankhya-calviva):
//    o Sankhya exige sessao ativa e aplica as permissoes do proprio usuario.
//  - limparTravados (housekeeping) segue pela conexao de servico.
// Idempotente: cria ou atualiza (update se ja existir por nome).
// ============================================================================
import 'dotenv/config';
import {
  configureSdkMitra, runDdlMitra,
  listIntegrationsMitra, createIntegrationMitra,
  listServerFunctionsMitra, createServerFunctionMitra, updateServerFunctionMitra,
  togglePublicExecutionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});
const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const BASE = 'http://calviva.nuvemdatacom.com.br:9861';
const SVC = 'sankhya-svc';       // sessao de servico (dados)
const RAW = 'sankhya-calviva';   // passthrough (login por-usuario)

// ---------- helpers ----------
async function ensureIntegration(slug, payload) {
  const l = await listIntegrationsMitra({ projectId });
  const arr = l?.result || l || [];
  if ((Array.isArray(arr) ? arr : []).some(i => i.slug === slug)) { console.log('integracao ok:', slug); return; }
  await createIntegrationMitra(payload);
  console.log('integracao criada:', slug);
}

let SF_CACHE = null;
async function sfIdByName(name) {
  if (!SF_CACHE) { const l = await listServerFunctionsMitra({ projectId }); SF_CACHE = l?.result || l || []; }
  const f = (Array.isArray(SF_CACHE) ? SF_CACHE : []).find(x => x.name === name);
  return f?.id;
}
async function upsertSF({ name, type, code, description, jdbcId }) {
  const existing = await sfIdByName(name);
  if (existing) {
    await updateServerFunctionMitra({ projectId, serverFunctionId: existing, code, description });
    console.log('SF atualizada:', name, '(id', existing + ')');
    return existing;
  }
  const c = await createServerFunctionMitra({ projectId, name, type, code, description, ...(jdbcId ? { jdbcId } : {}) });
  const id = c?.result?.serverFunctionId || c?.serverFunctionId || c?.result?.id;
  SF_CACHE.push({ id, name });
  console.log('SF criada:', name, '(id', id + ')');
  return id;
}

// Cabecalho comum das SFs JS que chamam o Sankhya
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

async function main() {
  // ---------- 1) Integracoes ----------
  await ensureIntegration(SVC, {
    projectId, name: 'Sankhya Servico', slug: SVC,
    blueprintId: 'sankhya_gateway_mitra', blueprintType: 'HTTP_REQUEST', authType: 'DYNAMIC_TOKEN',
    credentials: { base_url: BASE, username: 'giovanna', password: '123456' },
  });
  await ensureIntegration(RAW, {
    projectId, name: 'Sankhya Calviva', slug: RAW,
    blueprintId: null, blueprintType: 'HTTP_REQUEST', authType: 'STATIC_KEY',
    credentials: { base_url: BASE },
    authorizationConfig: { type: 'header', config: { name: 'X-Mitra-Passthrough', value: '1' } },
  });

  // ---------- 2) Tabela de vinculo (banco Mitra / MySQL) ----------
  await runDdlMitra({ projectId, sql:
    `CREATE TABLE IF NOT EXISTS MISA_SESSAO (
      MITRA_USER_ID INT PRIMARY KEY,
      IDUSU INT,
      ATUALIZADO_EM VARCHAR(19)
    );` });
  console.log('tabela MISA_SESSAO ok');

  // ---------- 3) SFs SQL (banco Mitra) para o vinculo server-side ----------
  const idVincular = await upsertSF({
    name: 'vincularSessao', type: 'SQL',
    description: 'Vincula o usuario Mitra logado (:VAR_USER) ao idusu Sankhya. Chamada apos o login por-usuario.',
    code: `INSERT INTO MISA_SESSAO (MITRA_USER_ID, IDUSU, ATUALIZADO_EM)
           VALUES (:VAR_USER, {{idusu}}, '{{agora}}')
           ON DUPLICATE KEY UPDATE IDUSU = {{idusu}}, ATUALIZADO_EM = '{{agora}}'`,
  });
  const idMeuIdusu = await upsertSF({
    name: 'meuIdusu', type: 'SQL',
    description: 'Retorna o idusu Sankhya do usuario Mitra logado (:VAR_USER). Uso interno das SFs de gravacao.',
    code: `SELECT IDUSU FROM MISA_SESSAO WHERE MITRA_USER_ID = :VAR_USER`,
  });

  // ---------- 4) SF JS de LOGIN (publica) — valida credencial Sankhya real ----------
  await upsertSF({
    name: 'sankhyaLogin', type: 'JAVASCRIPT',
    description: 'Login publico: valida usuario/senha REAIS do Sankhya (MobileLoginSP) e retorna o idusu + nome. Autenticacao delegada ao ERP. O idusu volta ao front para carimbar o CODUSU nas gravacoes.',
    code: JS_HEAD + `
const r = await sdk.callIntegrationMitra({ projectId, connection: '${RAW}', method: 'POST', endpoint: '/mge/service.sbr',
  params: { serviceName: 'MobileLoginSP.login', outputType: 'json' },
  body: { serviceName: 'MobileLoginSP.login', requestBody: { NOMUSU: { '$': event.usuario }, INTERNO: { '$': event.senha }, KEEPCONNECTED: { '$': 'S' } } } });
const b = r && (r.body || r);
if (!b || b.status !== '1') { return { ok: false, message: (b && b.statusMessage) || 'Usuario ou senha invalidos.' }; }
const rb = b.responseBody || {};
function dec(s){ try { const v = Buffer.from(String(s||'').trim(), 'base64').toString('utf8').trim(); if (v==='') return null; const n = parseInt(v, 10); return isNaN(n) ? null : n; } catch(e){ return null; } }
const idusu = dec(rb.idusu && rb.idusu['$']); // CODUSU pode ser 0 (usuario SUP/supervisor)
if (idusu === null) { return { ok: false, message: 'Login sem idusu.' }; }
const jsession = (rb.jsessionid && rb.jsessionid['$']) || null; // sessao do usuario (autoriza as gravacoes)
// nome do usuario (para exibicao)
let nome = event.usuario;
try { const q = await sankhyaQuery("SELECT NOMEUSU FROM TSIUSU WHERE CODUSU=" + idusu); const rows = rowsOf(q); if (rows[0]) nome = trim(rows[0][0]); } catch(e){}
return { ok: true, idusu: idusu, nome: nome, jsession: jsession };
`,
  });

  // resolvedor de idusu para as gravacoes: vem do front (event.codusu), capturado no login
  // Aceita CODUSU = 0 (usuario SUP/supervisor); so rejeita ausente/invalido.
  const RESOLVE_IDUSU = `
const idusu = (event.codusu !== undefined && event.codusu !== null && event.codusu !== '') ? parseInt(event.codusu, 10) : null;
if (idusu === null || isNaN(idusu)) { return { ok: false, message: 'Usuario nao identificado. Faca login novamente.' }; }
`;

  // ---------- 5) SFs JS de LEITURA (dados via servico) ----------
  await upsertSF({
    name: 'listarEmpresas', type: 'JAVASCRIPT',
    description: 'Lista empresas (TSIEMP) exceto CODEMP 999.',
    code: JS_HEAD + `
const r = await sankhyaQuery("SELECT CODEMP, NOMEFANTASIA FROM TSIEMP WHERE CODEMP <> 999 ORDER BY CODEMP");
return { ok: statusOf(r)==='1', empresas: rowsOf(r).map(function(x){ return { codemp:x[0], nome:trim(x[1]) }; }) };
`,
  });

  await upsertSF({
    name: 'listarTitulos', type: 'JAVASCRIPT',
    description: 'Lista titulos de MOV_DIARIO_MISA. Filtros: nufins[] OU (dataInicial,dataFinal,empresas[],statusweb[],status[]). NUFIN ignora data/empresa (CA-09). Datas em YYYY-MM-DD.',
    code: JS_HEAD + `
const f = event.filtros || event || {};
const cols = "STATUS,CODEMP,NOMEFANTASIA,DESCRNAT,GRUPNAT,VLRDESDOB,DTVENC,NUMNOTA,HISTORICO,NUFIN,STATUSWEB,CODPARC,NOMEPARC,TIPOTITULO";
let sql = "SELECT " + cols + " FROM MOV_DIARIO_MISA WHERE 1=1";
const nufins = (f.nufins||[]).map(function(n){ return parseInt(n); }).filter(Boolean);
if (nufins.length) {
  sql += " AND NUFIN IN (" + nufins.join(',') + ")";
} else {
  const di = f.dataInicial ? isoToBR(f.dataInicial) : null;
  const df = f.dataFinal ? isoToBR(f.dataFinal) : null;
  if (di) sql += " AND DTVENC >= '" + di + "'";
  if (df) sql += " AND DTVENC <= '" + df + "'";
  const emp = (f.empresas||[]).map(function(n){ return parseInt(n); }).filter(Boolean);
  if (emp.length) sql += " AND CODEMP IN (" + emp.join(',') + ")";
  const sw = (f.statusweb||[]).map(function(n){ return parseInt(n); }).filter(function(n){ return !isNaN(n); });
  if (sw.length) sql += " AND STATUSWEB IN (" + sw.join(',') + ")";
  const st = (f.status||[]).filter(Boolean).map(function(s){ return "'" + String(s).replace(/'/g,"''") + "'"; });
  if (st.length) sql += " AND STATUS IN (" + st.join(',') + ")";
}
sql += " ORDER BY DTVENC, GRUPNAT, CODEMP, DESCRNAT";
const r = await sankhyaQuery(sql);
if (statusOf(r)!=='1'){ const b=r&&(r.body||r); return { ok:false, message:(b&&b.statusMessage)||'Erro na consulta' }; }
const titulos = rowsOf(r).map(function(x){ return {
  status:x[0], codemp:x[1], empresa:trim(x[2]), natureza:trim(x[3]), grupoNatureza:trim(x[4]),
  valor:x[5], vencimento:x[6], numnota:x[7], historico:x[8], nufin:x[9],
  statusweb:x[10], codparc:x[11], parceiro:trim(x[12]), tipotitulo:trim(x[13]) }; });
return { ok:true, total:titulos.length, titulos:titulos };
`,
  });

  await upsertSF({
    name: 'saldosDia', type: 'JAVASCRIPT',
    description: 'Saldos consolidados do dia por empresa (RN-05, exclui 999). So retorna empresas com saldo hoje (AD_SALDOS) OU com aprovacao/analise hoje. Empresas 100% zeradas sao omitidas. Retorna saldoInicial, encaixe, analise, aprovado, disponivel.',
    code: JS_HEAD + `
const sql = "SELECT E.CODEMP, EMP.NOMEFANTASIA,"
 + " COALESCE(SAL.SALDOINICIAL,0), COALESCE(SAL.SALDOENCAIXE,0),"
 + " COALESCE(A.TOTALANALISE,0), COALESCE(A.TOTALAPROVADO,0)"
 + " FROM ("
 + "   SELECT CODEMP FROM AD_SALDOS WHERE CAST(DATA AS DATE)=CAST(GETDATE() AS DATE) AND CODEMP<>999"
 + "   UNION SELECT DISTINCT CODEMP FROM MOV_DIARIO_MISA WHERE CODEMP<>999"
 + " ) E"
 + " JOIN TSIEMP EMP ON EMP.CODEMP=E.CODEMP"
 + " LEFT JOIN AD_SALDOS SAL ON SAL.CODEMP=E.CODEMP AND CAST(SAL.DATA AS DATE)=CAST(GETDATE() AS DATE)"
 + " LEFT JOIN ("
 + "   SELECT FIN.CODEMP,"
 + "     SUM(CASE WHEN APR.STATUS=2 AND CAST(APR.DHALTER AS DATE)=CAST(GETDATE() AS DATE) THEN FIN.VLRDESDOB ELSE 0 END) AS TOTALANALISE,"
 + "     SUM(CASE WHEN APR.STATUS=3 AND CAST(APR.DHALTER AS DATE)=CAST(GETDATE() AS DATE) THEN FIN.VLRDESDOB ELSE 0 END) AS TOTALAPROVADO"
 + "   FROM MOV_DIARIO_MISA FIN"
 + "   JOIN (SELECT NUFIN, MAX(STATUS) AS STATUS, MAX(DHALTER) AS DHALTER FROM AD_APROFIN GROUP BY NUFIN) APR ON APR.NUFIN=FIN.NUFIN"
 + "   GROUP BY FIN.CODEMP"
 + " ) A ON A.CODEMP=E.CODEMP"
 + " ORDER BY E.CODEMP";
const r = await sankhyaQuery(sql);
if (statusOf(r)!=='1'){ const b=r&&(r.body||r); return { ok:false, message:(b&&b.statusMessage)||'Erro' }; }
const saldos = rowsOf(r).map(function(x){ const ini=Number(x[2])||0, enc=Number(x[3])||0, ana=Number(x[4])||0, apr=Number(x[5])||0;
  return { codemp:x[0], empresa:trim(x[1]), saldoInicial:ini, saldoEncaixe:enc, totalAnalise:ana, totalAprovado:apr, disponivel:(ini+enc)-(apr+ana) }; })
  .filter(function(s){ return s.saldoInicial || s.saldoEncaixe || s.totalAnalise || s.totalAprovado; });
return { ok:true, saldos:saldos };
`,
  });

  await upsertSF({
    name: 'vencidos', type: 'JAVASCRIPT',
    description: 'Resumo de titulos vencidos (DTVENC<hoje, DHBAIXA null, STATUS Nao Pago, STATUSWEB 1). Filtro opcional empresas[].',
    code: JS_HEAD + `
const emp = (event.empresas||[]).map(function(n){ return parseInt(n); }).filter(Boolean);
let sql = "SELECT COUNT(*) AS QTD, COALESCE(SUM(VLRDESDOB),0) AS TOTAL FROM MOV_DIARIO_MISA"
 + " WHERE DTVENC < CAST(GETDATE() AS DATE) AND DHBAIXA IS NULL AND STATUS=N'Não Pago' AND STATUSWEB=1";
if (emp.length) sql += " AND CODEMP IN (" + emp.join(',') + ")";
const r = await sankhyaQuery(sql);
const row = rowsOf(r)[0] || [0,0];
return { ok: statusOf(r)==='1', quantidade: Number(row[0])||0, total: Number(row[1])||0 };
`,
  });

  await upsertSF({
    name: 'listarTravados', type: 'JAVASCRIPT',
    description: 'Titulos "Em Analise" (status 2) de dias anteriores (RN-02). Retorna NUFINs.',
    code: JS_HEAD + `
const sql = "SELECT NUFIN FROM AD_APROFIN WHERE CAST(DHALTER AS DATE) < CAST(GETDATE() AS DATE) GROUP BY NUFIN HAVING MAX(STATUS)=2";
const r = await sankhyaQuery(sql);
return { ok: statusOf(r)==='1', nufins: rowsOf(r).map(function(x){ return x[0]; }) };
`,
  });

  // ---------- 6) SFs JS de ESCRITA (CODUSU resolvido server-side) ----------
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

  // Gravacoes do USUARIO (aprovar/analise/desaprovar) executam sob a SESSAO dele
  // (jsessionid embutido no path do servlet) — o Sankhya exige sessao ativa e
  // aplica as permissoes do usuario. limparTravados (housekeeping) segue no servico.
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
  // Guard de sessao ativa (alem do idusu)
  const SESSION_GUARD = `
const jsession = event.jsession || event.jsessionid;
if (!jsession) { return { ok: false, message: 'Sessao Sankhya ausente. Faca login novamente.' }; }
`;

  await upsertSF({
    name: 'gravarAnalise', type: 'JAVASCRIPT',
    description: 'Grava STATUS=2 (Em Analise) em AD_APROFIN. Maquina de estados (RN): so entra em analise quem esta pendente (sem registro ou MAX(STATUS)<2). Ja em analise/aprovado sao ignorados (nao gera chave duplicada). Carimba CODUSU server-side.',
    code: JS_HEAD + USER_DATASET + RESOLVE_IDUSU + SESSION_GUARD + `
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
  });

  await upsertSF({
    name: 'aprovar', type: 'JAVASCRIPT',
    description: 'Aprova (STATUS=3, CODUSU server-side). Maquina de estados (RN): so aprova quem ainda nao esta aprovado (MAX(STATUS)<3) — pendente ou em analise. Ja aprovado e ignorado (nao gera chave duplicada). MANTEM o registro de Analise (STATUS=2) de quem passou por analise, para que "cancelar aprovacao" volte a Em Analise (ou a Pendente, se foi aprovado direto).',
    code: JS_HEAD + USER_DATASET + RESOLVE_IDUSU + SESSION_GUARD + `
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
// NAO remove o registro de Analise (STATUS=2): mantido de proposito para que "cancelar aprovacao"
// (remover o STATUS=3) faca o titulo voltar a Em Analise (MAX(STATUS)=2) quando passou por analise,
// ou a Pendente (sem registro) quando foi aprovado direto do pendente.
return { ok:true, aprovados: nufins.length, ignorados: ignorados, codusu: idusu };
`,
  });

  await upsertSF({
    name: 'desaprovar', type: 'JAVASCRIPT',
    description: 'Remove registro de AD_APROFIN (NUFIN + STATUS) — desaprovar/cancelar analise (CA-04).',
    code: JS_HEAD + USER_DATASET + SESSION_GUARD + `
const itens = event.itens || (event.nufin ? [{ nufin: event.nufin, status: event.status }] : []);
const pks = itens.map(function(it){ return { NUFIN: String(it.nufin), STATUS: String(it.status) }; });
if (!pks.length) return { ok:false, message:'Nada para remover.' };
const r = await datasetRemoveUser(jsession, pks);
const b = r && (r.body || r);
if (!(b && b.status==='1')) return { ok:false, message: _erroGravacao(b) };
return { ok:true, removidos: pks.length };
`,
  });

  await upsertSF({
    name: 'limparTravados', type: 'JAVASCRIPT',
    description: 'RN-02: remove de AD_APROFIN as Analises (status 2) de dias anteriores. Idempotente.',
    code: JS_HEAD + DATASET + `
const sql = "SELECT NUFIN FROM AD_APROFIN WHERE CAST(DHALTER AS DATE) < CAST(GETDATE() AS DATE) GROUP BY NUFIN HAVING MAX(STATUS)=2";
const r = await sankhyaQuery(sql);
const nufins = rowsOf(r).map(function(x){ return x[0]; });
if (!nufins.length) return { ok:true, removidos:0 };
const pks = nufins.map(function(n){ return { NUFIN: String(n), STATUS: '2' }; });
const rr = await datasetRemove(pks);
const b = rr && (rr.body || rr);
return { ok: b && b.status==='1', removidos: nufins.length, message: b && b.statusMessage };
`,
  });

  // ---------- IDs finais ----------
  const l = await listServerFunctionsMitra({ projectId });
  const arr = l?.result || l || [];

  // ---------- 7) Tornar PUBLICAS as SFs de runtime (app como tela publica) ----------
  const PUBLICAS = ['sankhyaLogin','listarEmpresas','listarTitulos','saldosDia','vencidos','listarTravados','gravarAnalise','aprovar','desaprovar','limparTravados'];
  for (const f of (Array.isArray(arr) ? arr : [])) {
    if (PUBLICAS.includes(f.name)) {
      try { await togglePublicExecutionMitra({ projectId, serverFunctionId: f.id, publicExecution: true }); console.log('publica:', f.name, '(id', f.id + ')'); }
      catch (e) { console.log('FALHA ao tornar publica', f.name, '-', e?.message || e); }
    }
  }

  console.log('\n===== SERVER FUNCTIONS (id : nome : tipo) =====');
  for (const f of (Array.isArray(arr) ? arr : [])) console.log(`  ${f.id} : ${f.name} : ${f.type}`);
  console.log('\nBackend criado com sucesso.');
}

main().catch(e => { console.error('SETUP FALHOU:', e?.response?.data ? JSON.stringify(e.response.data) : (e?.message || e)); process.exit(1); });
