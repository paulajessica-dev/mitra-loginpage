// ============================================================================
// Atualiza APENAS a SF listarEmpresas para trazer a MATRIZ de cada empresa.
//  - Le a SF atual, PRESERVA a conexao dela (hoje sankhya-svc-v3) e troca so o SQL.
//  - Novas colunas: CODMAT (codigo da matriz) e NOMEMAT (razao/nome da matriz),
//    usando TSIEMP.CODEMPMATRIZ (mesmo padrao ja usado no fluxo de caixa).
//  - Nao toca em nenhuma outra SF, tabela ou dado.
// ============================================================================
import 'dotenv/config';
import {
  configureSdkMitra, listServerFunctionsMitra, readServerFunctionMitra,
  updateServerFunctionMitra, executeServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});
const projectId = parseInt(process.env.MITRA_PROJECT_ID);

// Empresa + sua matriz. Grupo (matriz) usa RAZAOSOCIAL; filial usa NOMEFANTASIA.
// Ordena por matriz (razao social) e depois por codigo da empresa.
const NEW_SQL =
  "SELECT E.CODEMP, E.NOMEFANTASIA, COALESCE(E.CODEMPMATRIZ, E.CODEMP) AS CODMAT," +
  " COALESCE(MAT.RAZAOSOCIAL, E.RAZAOSOCIAL, MAT.NOMEFANTASIA, E.NOMEFANTASIA) AS NOMEMAT" +
  " FROM TSIEMP E" +
  " LEFT JOIN TSIEMP MAT ON MAT.CODEMP = COALESCE(E.CODEMPMATRIZ, E.CODEMP)" +
  " WHERE E.CODEMP <> 999" +
  " ORDER BY NOMEMAT, E.CODEMP";

async function main() {
  const l = await listServerFunctionsMitra({ projectId });
  const arr = l?.result || l || [];
  const sf = arr.find((f) => f.name === 'listarEmpresas');
  if (!sf) throw new Error('SF listarEmpresas nao encontrada.');

  const cur = await readServerFunctionMitra({ projectId, serverFunctionId: sf.id });
  const code = cur?.result?.code ?? cur?.code;
  const obj = JSON.parse(code);
  console.log('SF listarEmpresas id=', sf.id, '| conexao preservada:', obj.connection);

  // troca somente o SQL, mantendo connection/method/endpoint
  obj.body.requestBody.sql = NEW_SQL;
  await updateServerFunctionMitra({ projectId, serverFunctionId: sf.id, type: 'INTEGRATION', code: JSON.stringify(obj) });
  console.log('SQL atualizado.');

  // valida: executa e mostra as 3 primeiras linhas (deve vir CODEMP, NOME, CODMAT, NOMEMAT)
  const ex = await executeServerFunctionMitra({ projectId, serverFunctionId: sf.id, input: { projectId } });
  let out = ex?.result?.output ?? ex?.output;
  if (typeof out === 'string') { try { out = JSON.parse(out); } catch { /* keep */ } }
  let body = out?.body ?? out;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* keep */ } }
  const rows = body?.responseBody?.rows || [];
  console.log('linhas retornadas:', rows.length);
  console.log('amostra (CODEMP, NOME, CODMAT, NOMEMAT):');
  rows.slice(0, 6).forEach((r) => console.log('  ', JSON.stringify(r)));
}
main().catch((e) => { console.error('FALHOU:', e?.response?.data ? JSON.stringify(e.response.data) : (e?.message || e)); process.exit(1); });
