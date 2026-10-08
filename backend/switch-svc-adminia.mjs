// ============================================================================
// Troca o USUARIO DE SERVICO das leituras: IURY -> ADMIN.IA.
// A plataforma nao permite editar credencial de integracao existente, entao:
//  1) cria a conexao sankhya-svc-v3 (porta 9860, template sankhya_gateway_mitra,
//     cred ADMIN.IA) -- mesma config da svc-v2, so muda usuario/senha.
//  2) testa DbExplorer (ADMIN.IA tem acesso total, incl. tela DbExplorer).
//  3) repona as 8 SFs de leitura de sankhya-svc-v2 -> sankhya-svc-v3.
// Login e gravacoes NAO mudam (rodam sob a sessao do usuario, via calviva-v2).
// Idempotente: se a v3 ja existe, so testa e repona.
// ============================================================================
import 'dotenv/config';
import {
  configureSdkMitra, listIntegrationsMitra, createIntegrationMitra,
  callIntegrationMitra, listServerFunctionsMitra, readServerFunctionMitra,
  updateServerFunctionMitra, togglePublicExecutionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});
const projectId = parseInt(process.env.MITRA_PROJECT_ID);

const BASE = 'http://calviva.nuvemdatacom.com.br:9860';
const OLD_SVC = 'sankhya-svc-v2';   // IURY
const NEW_SVC = 'sankhya-svc-v3';   // ADMIN.IA
const READ_SFS = [9, 10, 11, 12, 13, 18, 30, 31]; // SFs de leitura (usam o servico)

async function main() {
  // ---- 1) criar conexao v3 (ADMIN.IA) se ainda nao existir ----
  const li = await listIntegrationsMitra({ projectId });
  const arr = li?.result || li || [];
  if (arr.some(i => i.slug === NEW_SVC)) {
    console.log('conexao', NEW_SVC, 'ja existe -> reaproveitando');
  } else {
    // A senha NAO fica no codigo. Para recriar a conexao do zero, rode com a
    // variavel de ambiente: SANKHYA_SVC_PASSWORD=... node switch-svc-adminia.mjs
    const senha = process.env.SANKHYA_SVC_PASSWORD;
    if (!senha) {
      console.error('ABORTANDO: defina SANKHYA_SVC_PASSWORD para criar a conexao', NEW_SVC);
      process.exit(1);
    }
    await createIntegrationMitra({
      projectId, name: 'Sankhya Servico ADMINIA', slug: NEW_SVC,
      blueprintId: 'sankhya_gateway_mitra', blueprintType: 'HTTP_REQUEST', authType: 'DYNAMIC_TOKEN',
      credentials: { base_url: BASE, username: 'ADMIN.IA', password: senha },
    });
    console.log('conexao criada:', NEW_SVC, '(cred ADMIN.IA)');
  }

  // ---- 2) testar DbExplorer pela nova conexao ----
  const test = await callIntegrationMitra({
    projectId, connection: NEW_SVC, method: 'POST',
    endpoint: '/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json',
    body: { serviceName: 'DbExplorerSP.executeQuery',
            requestBody: { sql: 'SELECT COUNT(*) FROM TSIEMP WHERE CODEMP <> 999' } },
  });
  const tb = test?.body || test;
  const st = tb?.status;
  const rows = tb?.responseBody?.rows;
  console.log('teste DbExplorer -> status:', st, '| retorno:', JSON.stringify(rows), '| msg:', tb?.statusMessage || '');
  if (st !== '1') {
    console.error('ABORTANDO: a nova conexao ADMIN.IA nao passou no DbExplorer. Nenhuma SF foi repontada.');
    process.exit(1);
  }

  // ---- 3) repontar as SFs de leitura: svc-v2 -> svc-v3 ----
  let changed = 0;
  for (const id of READ_SFS) {
    const r = await readServerFunctionMitra({ projectId, serverFunctionId: id });
    const res = r?.result || r || {};
    const code = res.code || '';
    if (!code.includes(OLD_SVC)) {
      console.log('SF', id, res.name || '', '-> sem', OLD_SVC, '(pula)');
      continue;
    }
    const newCode = code.split(OLD_SVC).join(NEW_SVC);
    await updateServerFunctionMitra({
      projectId, serverFunctionId: id,
      code: newCode, description: res.description,
    });
    // garante execucao publica (nao deve mudar, mas reforcamos)
    try { await togglePublicExecutionMitra({ projectId, serverFunctionId: id, publicExecution: true }); } catch {}
    console.log('SF', id, res.name || '', '-> repontada para', NEW_SVC);
    changed++;
  }
  console.log('OK. SFs repontadas:', changed, '/', READ_SFS.length);
}

main().catch(e => { console.error('ERRO:', e?.message || e); process.exit(1); });
