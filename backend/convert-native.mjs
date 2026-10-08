// ============================================================================
// Converte as Server Functions do Sankhya de JAVASCRIPT (callIntegrationMitra,
// que toma 403 em execucao publica) para INTEGRATION NATIVO (executado direto
// pelo motor de integracao — funciona em modo publico/sem sessao).
//  - Mantem os MESMOS IDs (updateServerFunctionMitra aceita trocar o type).
//  - O pos-processamento (decode do idusu, mapeamento de linhas, agregacao,
//    elegibilidade das gravacoes) passa para o frontend (src/lib/sankhya.ts).
//  - Conexoes (porta 9860): sankhya-svc-v2 (servico, cred IURY c/ DbExplorer) e
//    sankhya-calviva-v2 (passthrough por-sessao, login + gravacoes com ;jsessionid=).
//  - Gravacoes: 1 registro por chamada (frontend faz o loop por NUFIN) -> so
//    parametros escalares, sem interpolar arrays.
// Idempotente: atualiza por nome; cria buscarNome se nao existir.
// ============================================================================
import 'dotenv/config';
import {
  configureSdkMitra, listServerFunctionsMitra,
  createServerFunctionMitra, updateServerFunctionMitra, togglePublicExecutionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});
const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const SVC = 'sankhya-svc-v2';       // servico (leituras) - 9860, cred IURY (tem DbExplorer)
const RAW = 'sankhya-calviva-v2';   // passthrough por-sessao (login + gravacoes) - 9860

const EP_QUERY = '/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json';
const EP_LOGIN = '/mge/service.sbr?serviceName=MobileLoginSP.login&outputType=json';
const EP_SAVE = (js) => '/mge/service.sbr;jsessionid=' + js + '?serviceName=DatasetSP.save&outputType=json';
const EP_REMOVE = (js) => '/mge/service.sbr;jsessionid=' + js + '?serviceName=DatasetSP.removeRecord&outputType=json';

// helper: SF INTEGRATION que roda um SELECT no servico
const querySF = (sql) => JSON.stringify({
  connection: SVC, method: 'POST', endpoint: EP_QUERY,
  body: { serviceName: 'DbExplorerSP.executeQuery', requestBody: { sql } },
});

// ---- SQLs (fixos no servidor; filtros opcionais via guardas event.x) ----
const SQL_EMPRESAS = "SELECT CODEMP, NOMEFANTASIA FROM TSIEMP WHERE CODEMP <> 999 ORDER BY CODEMP";

const SQL_NOME = "SELECT NOMEUSU FROM TSIUSU WHERE CODUSU = event.codusu";

const SQL_TITULOS =
  "SELECT STATUS,CODEMP,NOMEFANTASIA,DESCRNAT,GRUPNAT,VLRDESDOB,DTVENC,NUMNOTA,HISTORICO,NUFIN,STATUSWEB,CODPARC,NOMEPARC,TIPOTITULO" +
  " FROM MOV_DIARIO_MISA WHERE 1=1" +
  " AND ('event.nufins' = '' OR CHARINDEX(',' + CAST(NUFIN AS VARCHAR(20)) + ',', ',event.nufins,') > 0)" +
  " AND ('event.dataInicial' = '' OR DTVENC >= 'event.dataInicial')" +
  " AND ('event.dataFinal' = '' OR DTVENC <= 'event.dataFinal')" +
  " AND ('event.empresas' = '' OR CHARINDEX(',' + CAST(CODEMP AS VARCHAR(20)) + ',', ',event.empresas,') > 0)" +
  " AND ('event.statusweb' = '' OR CHARINDEX(',' + CAST(STATUSWEB AS VARCHAR(20)) + ',', ',event.statusweb,') > 0)" +
  " AND ('event.status' = '' OR CHARINDEX('|' + STATUS + '|', '|event.status|') > 0)" +
  " ORDER BY DTVENC, GRUPNAT, CODEMP, DESCRNAT";

const SQL_SALDOS =
  "SELECT E.CODEMP, EMP.NOMEFANTASIA," +
  " COALESCE(SAL.SALDOINICIAL,0), COALESCE(SAL.SALDOENCAIXE,0)," +
  " COALESCE(A.TOTALANALISE,0), COALESCE(A.TOTALAPROVADO,0)" +
  " FROM (" +
  "   SELECT CODEMP FROM AD_SALDOS WHERE CAST(DATA AS DATE)=CAST(GETDATE() AS DATE) AND CODEMP<>999" +
  "   UNION SELECT DISTINCT CODEMP FROM MOV_DIARIO_MISA WHERE CODEMP<>999" +
  " ) E" +
  " JOIN TSIEMP EMP ON EMP.CODEMP=E.CODEMP" +
  " LEFT JOIN AD_SALDOS SAL ON SAL.CODEMP=E.CODEMP AND CAST(SAL.DATA AS DATE)=CAST(GETDATE() AS DATE)" +
  " LEFT JOIN (" +
  "   SELECT FIN.CODEMP," +
  "     SUM(CASE WHEN APR.STATUS=2 AND CAST(APR.DHALTER AS DATE)=CAST(GETDATE() AS DATE) THEN FIN.VLRDESDOB ELSE 0 END) AS TOTALANALISE," +
  "     SUM(CASE WHEN APR.STATUS=3 AND CAST(APR.DHALTER AS DATE)=CAST(GETDATE() AS DATE) THEN FIN.VLRDESDOB ELSE 0 END) AS TOTALAPROVADO" +
  "   FROM MOV_DIARIO_MISA FIN" +
  "   JOIN (SELECT NUFIN, MAX(STATUS) AS STATUS, MAX(DHALTER) AS DHALTER FROM AD_APROFIN GROUP BY NUFIN) APR ON APR.NUFIN=FIN.NUFIN" +
  "   GROUP BY FIN.CODEMP" +
  " ) A ON A.CODEMP=E.CODEMP" +
  " ORDER BY E.CODEMP";

const SQL_VENCIDOS =
  "SELECT COUNT(*) AS QTD, COALESCE(SUM(VLRDESDOB),0) AS TOTAL FROM MOV_DIARIO_MISA" +
  " WHERE DTVENC < CAST(GETDATE() AS DATE) AND DHBAIXA IS NULL AND STATUS=N'Não Pago' AND STATUSWEB=1" +
  " AND ('event.empresas' = '' OR CHARINDEX(',' + CAST(CODEMP AS VARCHAR(20)) + ',', ',event.empresas,') > 0)";

const SQL_TRAVADOS =
  "SELECT NUFIN FROM AD_APROFIN WHERE CAST(DHALTER AS DATE) < CAST(GETDATE() AS DATE) GROUP BY NUFIN HAVING MAX(STATUS)=2";

const SQL_FLUXO =
  "SELECT S.CODEMP, EMP.NOMEFANTASIA, COALESCE(EMP.CODEMPMATRIZ, EMP.CODEMP) AS CODMAT," +
  " COALESCE(MAT.NOMEFANTASIA, EMP.NOMEFANTASIA) AS NOMEMAT, CONVERT(varchar(10), S.DATA, 23) AS DIA," +
  " COALESCE(S.SALDOINICIAL,0) AS SINI, COALESCE(S.SALDOENCAIXE,0) AS ENC," +
  " COALESCE(A.ANALISE,0) AS ANA, COALESCE(A.APROVADO,0) AS APR" +
  " FROM AD_SALDOS S" +
  " JOIN TSIEMP EMP ON EMP.CODEMP=S.CODEMP" +
  " LEFT JOIN TSIEMP MAT ON MAT.CODEMP=COALESCE(EMP.CODEMPMATRIZ, EMP.CODEMP)" +
  " LEFT JOIN (" +
  "   SELECT FIN.CODEMP, CAST(APR.DHALTER AS DATE) AS DIA," +
  "     SUM(CASE WHEN APR.STATUS=2 THEN FIN.VLRDESDOB ELSE 0 END) AS ANALISE," +
  "     SUM(CASE WHEN APR.STATUS=3 THEN FIN.VLRDESDOB ELSE 0 END) AS APROVADO" +
  "   FROM MOV_DIARIO_MISA FIN" +
  "   JOIN (SELECT NUFIN, MAX(STATUS) AS STATUS, MAX(DHALTER) AS DHALTER FROM AD_APROFIN GROUP BY NUFIN) APR ON APR.NUFIN=FIN.NUFIN" +
  "   GROUP BY FIN.CODEMP, CAST(APR.DHALTER AS DATE)" +
  " ) A ON A.CODEMP=S.CODEMP AND A.DIA=CAST(S.DATA AS DATE)" +
  " WHERE S.CODEMP<>999 AND CAST(S.DATA AS DATE) BETWEEN 'event.dataInicial' AND 'event.dataFinal'" +
  " ORDER BY CODMAT, S.CODEMP, S.DATA";

// ---- Gravacoes (1 registro por chamada, sob a sessao do usuario) ----
const saveOne = (statusFixo) => JSON.stringify({
  connection: RAW, method: 'POST', endpoint: EP_SAVE('event.jsession'),
  body: { serviceName: 'DatasetSP.save', requestBody: {
    entityName: 'AD_APROFIN', standAlone: false, fields: ['NUFIN', 'STATUS', 'CODUSU'],
    records: [{ values: { '0': 'event.nufin', '1': statusFixo, '2': 'event.codusu' } }],
  } },
});
const removeOne = JSON.stringify({
  connection: RAW, method: 'POST', endpoint: EP_REMOVE('event.jsession'),
  body: { serviceName: 'DatasetSP.removeRecord', requestBody: {
    entityName: 'AD_APROFIN', pks: [{ NUFIN: 'event.nufin', STATUS: 'event.status' }],
  } },
});
// limpeza de travados: remove 1 registro (STATUS=2) via servico (sem sessao de usuario)
const removeOneSvc = JSON.stringify({
  connection: SVC, method: 'POST', endpoint: '/mge/service.sbr?serviceName=DatasetSP.removeRecord&outputType=json',
  body: { serviceName: 'DatasetSP.removeRecord', requestBody: {
    entityName: 'AD_APROFIN', pks: [{ NUFIN: 'event.nufin', STATUS: '2' }],
  } },
});

// nome -> {type, code}. login/writes = INTEGRATION nativo.
const SFS = {
  sankhyaLogin: { code: JSON.stringify({ connection: RAW, method: 'POST', endpoint: EP_LOGIN,
    body: { serviceName: 'MobileLoginSP.login', requestBody: { NOMUSU: { '$': 'event.usuario' }, INTERNO: { '$': 'event.senha' }, KEEPCONNECTED: { '$': 'S' } } } }) },
  listarEmpresas: { code: querySF(SQL_EMPRESAS) },
  listarTitulos: { code: querySF(SQL_TITULOS) },
  saldosDia: { code: querySF(SQL_SALDOS) },
  vencidos: { code: querySF(SQL_VENCIDOS) },
  listarTravados: { code: querySF(SQL_TRAVADOS) },
  fluxoCaixa: { code: querySF(SQL_FLUXO) },
  gravarAnalise: { code: saveOne('2') },
  aprovar: { code: saveOne('3') },
  desaprovar: { code: removeOne },
  removerTravado: { code: removeOneSvc },   // novo: usado por limparTravados (loop no front)
  buscarNome: { code: querySF(SQL_NOME) },  // novo: nome do usuario apos login
};

async function main() {
  const l = await listServerFunctionsMitra({ projectId });
  const arr = l?.result || l || [];
  const byName = {}; for (const f of arr) byName[f.name] = f.id;

  for (const [name, def] of Object.entries(SFS)) {
    let id = byName[name];
    if (id) {
      await updateServerFunctionMitra({ projectId, serverFunctionId: id, type: 'INTEGRATION', code: def.code });
      console.log('convertida:', name.padEnd(16), '(id', id + ')');
    } else {
      const c = await createServerFunctionMitra({ projectId, name, type: 'INTEGRATION', code: def.code, description: 'Sankhya (native) ' + name });
      id = c?.result?.serverFunctionId || c?.serverFunctionId || c?.result?.id;
      console.log('criada:    ', name.padEnd(16), '(id', id + ')');
    }
    // garante execucao publica
    await togglePublicExecutionMitra({ projectId, serverFunctionId: id, publicExecution: true });
  }
  console.log('\nConversao concluida. Rode listServerFunctions para pegar os novos IDs (buscarNome, removerTravado).');
}
main().catch(e => { console.error('FALHOU:', e?.response?.data ? JSON.stringify(e.response.data) : (e?.message || e)); process.exit(1); });
