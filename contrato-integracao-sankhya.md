# Contrato de Integração Sankhya — Portal MISA (Checkpoint Fase 4)

> Artefato do gate de integração. **Implementação só começa após seu aval neste contrato.** Baseado no mecanismo real fornecido pelo usuário (20/07/2026).

## 1. Fonte e ambiente
- **Sistema:** Sankhya ERP (Carbomil/MISA).
- **Base URL (exemplo fornecido):** `http://calviva.nuvemdatacom.com.br:9861`
- **Acesso:** Web services Sankhya (`service.sbr`) — **API, não JDBC**.
- **Modelo de consumo:** **ONLINE / tempo real / bidirecional** (lê ao vivo, grava de volta). Sem Data Loader / IMP_ / cron / bandeja de monitoramento.

## 2. Autenticação — DECIDIDA: login Sankhya real por usuário (opção B)
- **Licenciamento:** login nativo do Mitra (gate da plataforma) — mantido.
- **Sessão Sankhya:** cada usuário autentica no Sankhya com as próprias credenciais e recebe um `jsessionid` próprio, usado nas chamadas de leitura/gravação → o "quem aprovou" é naturalmente o usuário Sankhya (`idusu`).

### Fluxo de login (MobileLoginSP)
`POST {base_url}/mge/service.sbr?serviceName=MobileLoginSP.login&outputType=json`
```json
{ "serviceName": "MobileLoginSP.login",
  "requestBody": {
    "NOMUSU": { "$": "<usuario>" },
    "INTERNO": { "$": "<senha>" },
    "KEEPCONNECTED": { "$": "S" } } }
```
Resposta relevante: `responseBody.jsessionid.$`, `responseBody.callID.$`, `responseBody.idusu.$` (base64), `transactionId`.

### Uso da sessão (DbExplorerSP)
`POST {base_url}/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json&mgeSession=<sessao>`
- Cookie: `JSESSIONID=<jsessionid>.master`
- Body: `{ "serviceName": "DbExplorerSP.executeQuery", "requestBody": { "sql": "<SELECT>" } }`

### Logout
`MobileLoginSP.logout` (CA-10) + limpar `sessionStorage` no frontend.

### Expiração
~10 min de inatividade (RN-01). Em erro de sessão → re-login (FA-01).

## 3. Arquitetura no Mitra (proposta)
- **Integração custom** (`blueprintId: null`, `STATIC_KEY`) com `credentials.base_url` apontando para o Sankhya — **sem** auth automática do template (a sessão é por usuário, não de serviço).
- **SFs tipo INTEGRATION** que recebem `jsessionid`/`mgeSession` como parâmetros (`event.*`) e os injetam na chamada Sankhya:
  - `sankhyaLogin` — recebe usuário/senha, chama MobileLoginSP.login, devolve `jsessionid`/`idusu`.
  - `sankhyaLogout` — MobileLoginSP.logout.
  - `saldosDia` — DbExplorerSP em `AD_SALDOS` (exclui `CODEMP = 999`, CA-12), do dia.
  - `listarTitulos` — DbExplorerSP em `MOV_DIARIO_MISA` com filtros (DTVENC, CODEMP, NUFIN), paginado (limite 5.000).
  - `limparTravados` — DatasetSP DELETE em `AD_APROFIN` (status 2, `DHALTER` < hoje) (RN-02).
  - `gravarAnalise` — DatasetSP INSERT status 2 (RN-08).
  - `aprovar` — DatasetSP status 3 + limpa análises não selecionadas (RN-08).
  - `desaprovar` — DatasetSP remove aprovação do dia (CA-04).
- **Frontend:** guarda `jsessionid` em `sessionStorage`; passa em cada SF; re-login on expiry.

### Colunas conhecidas de `MOV_DIARIO_MISA` (do exemplo fornecido)
`STATUS, CODEMP, NOMEFANTASIA, CODNAT, DESCRNAT, IMPACTO, VLRDESDOB, DTVENC, NUMNOTA, HISTORICO, GRUPNAT, NUFIN`
- Datas em formato **DD/MM/YYYY** (ex: `'02/06/2026'`).
- Hierarquia RN-03 (a confirmar o campo de "Parceiro"): Empresa (`CODEMP`/`NOMEFANTASIA`) > Grupo Natureza (`GRUPNAT`) > Natureza (`CODNAT`/`DESCRNAT`) > Parceiro (**campo a confirmar**) > Vencimento (`DTVENC`).

## 4. RESULTADO DO SPIKE (validado em 20/07/2026 contra o Sankhya real)
Testado ponta a ponta contra `calviva.nuvemdatacom.com.br:9861` (usuário `giovanna`).

| Teste | Resultado |
|---|---|
| Login `MobileLoginSP.login` via integração custom | ✅ **OK** — retorna `jsessionid` + `idusu` (base64 `NzA=` = **70**). O login por-usuário É viável. |
| Query `DbExplorerSP` passando `mgeSession=<jsessionid>` (query param) | ❌ "Não autorizado" (status 3) |
| Query `DbExplorerSP` com `mgeSession=<jsessionid>.master` | ❌ "Não autorizado" |
| Query via SF INTEGRATION com `headers.Cookie=JSESSIONID=<jsessionid>.master` | ❌ "Não autorizado" — **o engine ignora cookie/header dinâmico por chamada** |
| Query com **cookie hardcoded de sessão fresca** (3 formatos: objeto, array, sem mgeSession) | ❌ Todos "Não autorizado" — **prova definitiva:** o header `Cookie` NUNCA é encaminhado ao Sankhya pelo engine |
| Query via **template oficial `sankhya_gateway_mitra`** (sessão gerida pelo engine) | ✅ **OK** — `testIntegration` sucesso; query real retornou **91 linhas** de `MOV_DIARIO_MISA` |

**Conclusão técnica:** o engine de integração do Mitra **não injeta sessão por-usuário por-chamada** (não anexa cookie dinâmico). Ele só autentica corretamente quando **ele mesmo** gerencia o login (nível de projeto = credencial de serviço). Logo, **operações de dados (leitura/escrita) exigem a sessão de serviço** (template oficial), que está **provado funcionando**.

- Colunas reais confirmadas de `MOV_DIARIO_MISA`: `STATUS, CODEMP, NOMEFANTASIA, CODNAT, DESCRNAT, IMPACTO, VLRDESDOB, DTVENC, NUMNOTA, HISTORICO, GRUPNAT, NUFIN`.
- Linhas retornam como **array posicional** + `responseBody.fieldsMetadata[].name`. `DTVENC` retorna `DDMMYYYY HH:mm:ss` (ex: `02062026 00:00:00`); filtro entra como `DD/MM/YYYY`.
- Integração de serviço criada e validada: slug **`sankhya-svc`** (template `sankhya_gateway_mitra`).

## 4.1 Arquitetura recomendada — HÍBRIDA (ajuste ao achado do spike)
Como a sessão por-usuário não funciona para dados, o modelo que **entrega os mesmos objetivos de negócio** é:
- **Autenticação por usuário (identidade):** cada aprovador entra no Mitra (licença) e autentica no Sankhya com **a própria credencial** via `MobileLoginSP` → valida que é usuário Sankhya real (RN-01) e captura o `idusu` dele. **(Funciona — comprovado.)**
- **Dados (leitura + escrita) via sessão de serviço `sankhya-svc`:** consultas e gravações em `AD_APROFIN` passam pela sessão gerida pelo engine (comprovada). Cada aprovação grava o `idusu` do aprovador (capturado no login dele) → **rastreio de quem aprovou preservado**.

Resultado: mantém login Sankhya real por usuário para acesso/atribuição, e usa o caminho confiável para os dados. Substitui a "opção B pura" (inviável tecnicamente) sem perder o objetivo.

**APROVADO pelo usuário (20/07).**

## 4.2 Estruturas reais confirmadas (SQL Server) e resolução do "quem aprovou"
Banco Sankhya deste ambiente é **SQL Server** (usar `TOP`, `INFORMATION_SCHEMA`, sem `ROWNUM`/`DUAL`).

**`AD_APROFIN`** (PK composta NUFIN+STATUS):
| Coluna | Tipo | Papel |
|---|---|---|
| `NUFIN` | int | título financeiro |
| `STATUS` | int | 1=Pendente, 2=Em Análise, 3=Aprovado |
| `DHALTER` | datetime | preenchido **automaticamente** pelo Sankhya |
| `CODUSU` | smallint | **usuário aprovador** |

**Resolução do requisito "saber de dentro do Sankhya quem aprovou":** testado que `DatasetSP.save` **respeita `CODUSU` explícito** (enviado 88 → gravado 88; NÃO forçou o usuário de serviço 70). Logo, na gravação eu seto `CODUSU = idusu do aprovador real` (capturado no login por-usuário). `DHALTER` é automático. → **requisito 100% atendido pela híbrida.**

**`AD_SALDOS`**:
| Coluna | Tipo |
|---|---|
| `CODEMP` | int |
| `DATA` | datetime |
| `SALDOINICIAL` | float |
| `SALDOENCAIXE` | float |
Amostra: `CODEMP=1, DATA=01062026, SALDOINICIAL=385706.32, SALDOENCAIXE=397928.25`.

**Formato DatasetSP (validado):**
- Save: `{ serviceName:'DatasetSP.save', requestBody:{ entityName:'AD_APROFIN', standAlone:false, fields:['NUFIN','STATUS','CODUSU'], records:[{ values:{ '0':nufin, '1':status, '2':codusu } }] } }`
- Remove: `{ serviceName:'DatasetSP.removeRecord', requestBody:{ entityName:'AD_APROFIN', pks:[{ NUFIN:..., STATUS:... }] } }`

**Mapa de hierarquia (RN-03) — CONFIRMADO pela implementação Angular de referência:**
Empresa (`CODEMP` + `NOMEFANTASIA` de `TSIEMP`) > Grupo Natureza (`GRUPNAT`) > Natureza (`DESCRNAT`) > Parceiro (`CODPARC`/`NOMEPARC`) > Vencimento (`DTVENC`).
- `MOV_DIARIO_MISA` também tem: `STATUSWEB` (1=Pend, 2=Análise, 3=Aprov), `CODPARC`, `NOMEPARC`, `TIPOTITULO`, `DHBAIXA`, `STATUS` (texto: 'Previsto'/'Realizado'/'Não Pago').
- Empresas (para filtro/nome): `SELECT CODEMP, NOMEFANTASIA FROM TSIEMP WHERE CODEMP <> 999`.

**NUFINs de teste (pendentes, sem registro em AD_APROFIN):** 511434, 512581, 512587, 512595, 513488, 513496, 513513, 513538, 513560, 514963.

## 4.4 Arquitetura de backend VALIDADA (padrão dos SFs)
Testado ✅: **SF tipo JAVASCRIPT** monta o SQL no servidor e chama a integração via `require('mitra-sdk').callIntegrationMitra({ connection:'sankhya-svc', ... })`. SQL nunca vai ao frontend. Rows posicionais → objetos nomeados. Retorno limpo em JSON.

**SFs a criar (baseadas na implementação Angular de referência do cliente):**
| SF | Tipo | Base (query de referência) |
|---|---|---|
| `sankhyaLogin` | JS | MobileLoginSP.login → retorna `{ status, idusu }` (valida usuário + captura aprovador) |
| `listarEmpresas` | JS | `SELECT CODEMP, NOMEFANTASIA FROM TSIEMP WHERE CODEMP<>999` |
| `listarTitulos` | JS | `MOV_DIARIO_MISA` com filtros (nufins OU data+empresa+statusweb+status); NUFIN ignora data/empresa (CA-09) |
| `saldosDia` | JS | join TSIEMP+MOV+AD_APROFIN+AD_SALDOS (saldo inicial, encaixe, análise, aprovado por empresa; hoje; exclui 999) |
| `vencidos` | JS | `MOV_DIARIO_MISA` DTVENC<hoje, DHBAIXA IS NULL, STATUS='Não Pago', STATUSWEB=1 |
| `listarTravados` | JS | AD_APROFIN DHALTER<hoje GROUP BY NUFIN HAVING MAX(STATUS)=2 (RN-02) |
| `limparTravados` | JS | removeRecord dos travados retornados acima |
| `gravarAnalise` | JS | DatasetSP.save STATUS=2 **+ CODUSU=idusu do aprovador** |
| `aprovar` | JS | DatasetSP.save STATUS=3 **+ CODUSU** + limpa análises não selecionadas (RN-08) |
| `desaprovar` | JS | DatasetSP.removeRecord (NUFIN+STATUS) (CA-04) |

**Diferença vs. referência (crítica):** o app Angular NÃO envia `CODUSU` (o navegador está logado como o usuário → Sankhya auto-carimba). Na híbrida, os SFs de gravação **DEVEM enviar `CODUSU` = idusu do aprovador**.

## 4.5 Decisão de design pendente — origem do CODUSU na gravação (segurança)
Como carimbar o aprovador de forma confiável:
- **(A) Frontend envia o `idusu`** (obtido no login por-usuário, guardado no sessionStorage). Simples; risco: usuário logado poderia forjar outro idusu.
- **(B) Servidor resolve o `idusu`** a partir do usuário Mitra logado (mapa persistido no login). Mais seguro; mais complexo.

## 4.7 Backend implementado (IDs das SFs — usar no frontend)
Criado e testado ✅ no Sankhya real (setup-backend.mjs). Integrações: `sankhya-svc` (dados/serviço), `sankhya-calviva` (passthrough/login). Tabela Mitra: `MISA_SESSAO (MITRA_USER_ID PK, IDUSU, ATUALIZADO_EM)`.

| ID | SF | Tipo | Uso no frontend |
|----|----|----|----|
| 8 | `sankhyaLogin` | JS | `input:{usuario,senha}` → `{ok, idusu}`. Chamar após login Mitra; vincula server-side. |
| 6 | `vincularSessao` | SQL | interno (chamado pela sankhyaLogin) |
| 7 | `meuIdusu` | SQL | interno (resolve CODUSU) |
| 9 | `listarEmpresas` | JS | `{empresas:[{codemp,nome}]}` |
| 10 | `listarTitulos` | JS | `input:{filtros:{nufins[]|dataInicial,dataFinal,empresas[],statusweb[],status[]}}` → `{titulos:[...]}` |
| 11 | `saldosDia` | JS | `{saldos:[{codemp,empresa,saldoInicial,saldoEncaixe,totalAnalise,totalAprovado,disponivel}]}` |
| 12 | `vencidos` | JS | `input:{empresas[]?}` → `{quantidade,total}` |
| 13 | `listarTravados` | JS | `{nufins:[]}` |
| 17 | `limparTravados` | JS | RN-02 — chamar ao carregar o portal |
| 14 | `gravarAnalise` | JS | `input:{nufins[]}` → grava STATUS=2, CODUSU server-side |
| 15 | `aprovar` | JS | `input:{nufins[]}` → STATUS=3 + remove análise, CODUSU server-side |
| 16 | `desaprovar` | JS | `input:{itens:[{nufin,status}]}` |

**Observação p/ revisão (saldosDia):** a query de referência usa INNER JOIN com `AD_APROFIN`, então **só aparecem empresas que já têm registro em AD_APROFIN**. Na base de teste apareceu 1 empresa. Avaliar se o widget deve mostrar **todas** as empresas (LEFT JOIN) mesmo sem aprovações. → confirmar com o usuário.

## 4.6 Status do gate
✅ Gate de integração **CONCLUÍDO** — arquitetura validada ponta a ponta com testes reais (login, leitura via JS SF, escrita com CODUSU explícito, estruturas confirmadas, queries de referência em mãos). Pronto para construir o backend (2.1). Pendências menores: decisão 4.5 (origem do CODUSU) e credencial de serviço de produção.

## 5. Riscos herdados
- R-02 (limite 5.000 linhas `DbExplorerSP` → paginação SQL).
- R-03 (expiração 10 min → re-login).
- R-06 (performance da view em tempo real).
- **UX:** login duplo (Mitra + Sankhya) — consequência aceita da opção B.

## 6. Pendências para destravar a implementação
1. ✅ Credenciais de teste — autorizadas (`giovanna`/`calviva`), spike executado.
2. ✅ `MOV_DIARIO_MISA` existe e retorna dados. **Falta confirmar** `AD_APROFIN` e `AD_SALDOS` (PC-02) — testar via query no build.
3. **Aprovar a arquitetura híbrida (4.1)** — decisão do usuário: seguimos com autenticação por-usuário + dados via serviço?
4. Campo de "Parceiro" na hierarquia (RN-03): no retorno aparece `NOMEFANTASIA` (ex: "MISA - MINERAIS LIMOEIRO") — confirmar se é o Parceiro ou se há outra coluna.
5. Para produção: definir a **credencial de serviço** oficial (hoje usando `giovanna`; idealmente um usuário de serviço Sankhya dedicado, com permissão de SELECT nas views e INSERT/DELETE em `AD_APROFIN`).
