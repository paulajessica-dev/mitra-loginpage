# Features e Arquitetura — Portal de Aprovação de Títulos Financeiros (MISA)

> Derivado do **Escopo Técnico Funcional v2.1** (Carbomil / MISA). Este documento descreve as **features finais entregues ao usuário** e a **arquitetura** que as sustenta. É um documento vivo; será usado na fase 4.1 para validar a implementação.

---

## 1. Requisitos

### 1.1 Funcionais (extraídos das RN e CA do escopo)
- **RF-01 — Autenticação Sankhya:** login com credenciais do Sankhya; sessão mantida via token (`mgeSession`/`jsessionid`); expiração ~10 min de inatividade (RN-01, CA-01, FA-01).
- **RF-02 — Limpeza automática de "travados":** ao carregar a tela de aprovação, deletar de `AD_APROFIN` registros com status "Em Análise" (2) e `DHALTER` anterior a hoje (RN-02, CA-07).
- **RF-03 — Widget de Saldos/Vencidos:** exibir consolidado do dia (hoje), **imune aos filtros** de pesquisa (RN-05); excluir `CODEMP = 999` (CA-12).
- **RF-04 — Cálculo de disponível:** `(Saldo Anterior + Encaixe) − (Aprovado + Em Análise)` (RN-04, CA-02).
- **RF-05 — Filtros de pesquisa:** por período/empresa e por NUFIN específico; filtro de NUFIN ignora data e empresa (CA-09); sem resultados → mensagem (FA-02).
- **RF-06 — Árvore hierárquica (5 níveis):** Empresa > Grupo Natureza > Natureza > Parceiro > Vencimento (RN-03); expandir/colapsar todos os níveis (CA-03).
- **RF-07 — Seleção em cascata:** marcar nó pai seleciona todos os filhos (RN-07, CA-05).
- **RF-08 — Totalizador flutuante:** painel que atualiza valores em tempo real conforme seleção dos checkboxes (CA-08).
- **RF-09 — Transições de status:** Pendente→Em Análise (grava status 2); Em Análise→Aprovado (grava status 3 e limpa análises não selecionadas) (RN-08).
- **RF-10 — Desaprovação:** títulos aprovados hoje exibem botão "Desaprovar" na linha (CA-04).
- **RF-11 — Concorrência "vence o último":** última gravação no NUFIN prevalece (RN-06).
- **RF-12 — Logout:** invocar `MobileLoginSP.logout` e limpar `sessionStorage` (CA-10).
- **RF-13 — Tratamento de erro do ERP:** erros da API Sankhya exibidos em toast de alerta (FA-03).

### 1.2 Não Funcionais
- **RNF-01 — Responsividade:** utilizável em smartphones (CA-06).
- **RNF-02 — Volume:** suportar retorno de até 5.000 registros sem travar a UI (CA-11) — atenção ao limite de 5.000 linhas do `DbExplorerSP` (paginação via SQL se necessário).
- **RNF-03 — Tempo real:** widget de saldos e recarga de lista após ações refletem estado atual imediatamente.
- **RNF-04 — Segurança:** nenhuma credencial/token fixo no bundle do frontend.

---

## 2. Funcionalidades finais (visão do usuário)
Tela única de trabalho (portal operacional), composta por:
1. **Login** (credenciais Sankhya).
2. **Cabeçalho de Saldos** — cards com Saldo Anterior, Encaixe, Aprovado, Em Análise, **Disponível** e Vencidos, do dia atual.
3. **Barra de Filtros** — período, empresa, e busca por NUFIN.
4. **Árvore de Títulos** — 5 níveis, expandir/colapsar, checkbox com seleção em cascata; linha de aprovados-hoje com "Desaprovar".
5. **Painel de Ações Flutuante** — totalizador em tempo real + botões "Salvar Análise" e "Aprovar".
6. **Feedback** — toasts de sucesso/erro; estados de loading/empty.
7. **Logout**.

---

## 3. Arquitetura de Dados
> Este projeto **consome dados do ERP Sankhya**; não modela um banco novo. As entidades vivem no Sankhya.

**Fonte externa (Sankhya):**
- View `MOV_DIARIO_MISA` — movimento diário/títulos (leitura, tempo real).
- Tabela `AD_APROFIN` — registros de análise/aprovação (`STATUSWEB` 1/2/3, `DHALTER`, `NUFIN`, usuário).
- Tabela `AD_SALDOS` — base do widget de saldos.
- Entidades base: `TGFFIN` (financeiro/NUFIN), empresa (`CODEMP`), naturezas/grupos, parceiros.

**Serviços Sankhya usados:**
- `MobileLoginSP` — login/logout (token de sessão).
- `DbExplorerSP.executeQuery` — leituras (saldos, árvore, títulos).
- `DatasetSP` — persistência (insert/update/delete em `AD_APROFIN`).

**Lado Mitra:** não há tabelas de negócio próprias. Possível uso de **Variáveis de Projeto** apenas para configs não sensíveis. Nenhuma tabela de usuários (regra da plataforma).

---

## 4. Arquitetura de Backend (Mitra)
- **Integração Sankhya** criada via `createIntegrationMitra` (template `sankhya_gateway_mitra` → fallback `sankhya_oauth` → `sankhya_oauth_sandbox`, conforme versão do cliente). Auth `DYNAMIC_TOKEN`.
- **Server Functions tipo INTEGRATION** encapsulando cada operação:
  - `saldosDia` — consulta consolidada do dia (exclui CODEMP 999).
  - `limparTravados` — delete de "Em Análise" de dias anteriores.
  - `listarTitulos` — árvore/títulos com filtros (período, empresa, NUFIN), paginada.
  - `gravarAnalise` — grava status 2 em `AD_APROFIN` (via DatasetSP).
  - `aprovar` — grava status 3 + limpa análises não selecionadas.
  - `desaprovar` — remove aprovação do dia.
- **Padrão de leitura:** `DbExplorerSP.executeQuery` com `sql` como string direta; tratar `burstLimit` (limite 5.000).
- **Sem chamadas HTTP diretas** em SF JAVASCRIPT — toda comunicação externa pela feature de Integrations.

> ⚠️ **Detalhamento e credenciais das SFs de integração dependem do GATE de Integração (task I.0).** Esta seção é o desenho-alvo, não a implementação.

---

## 5. Arquitetura de Frontend
- React 19 + TS + Vite 7 + Tailwind 4; UI via componentes do template (shadcn) + `lucide-react`.
- **Handsontable NÃO se aplica** à árvore (é hierárquica com cascata) — usar componente de árvore custom sobre os componentes do template. (Reavaliar se surgir visão tabular plana.)
- Estado: filtros, seleção (Set de NUFIN), dados de saldos e de árvore em hooks dedicados.
- Chamadas ao backend exclusivamente via `mitra-interactions-sdk` (`executeServerFunctionMitra`).
- Responsividade mobile-first (RNF-01).

---

## 6. Integrações

### 6.1 Sankhya ERP (única integração)
Sujeita ao **gate obrigatório de integração de dados** antes de qualquer código de conexão.

**Modelo de consumo: ONLINE / tempo real / bidirecional.** Diferente do padrão de import em lote do guia (Data Loaders, IMP_, cron, bandeja de monitoramento) — que **NÃO se aplica** aqui. Este portal lê ao vivo (saldos, títulos) e **grava de volta** no Sankhya (análise/aprovação em `AD_APROFIN`). Logo:
- Sem Data Loaders / tabelas IMP_ / cron de importação / bandeja de monitoramento.
- Toda operação = SF tipo INTEGRATION chamando serviços Sankhya (`DbExplorerSP.executeQuery` para leitura; `DatasetSP` para escrita) na hora.

**Templates disponíveis na plataforma (descobertos via `listIntegrationTemplatesMitra`), todos `DYNAMIC_TOKEN`:**
| Template | Modelo | Campos |
|---|---|---|
| `sankhya_gateway_mitra` | login/senha (gateway) | `base_url`, `username`, `password` |
| `sankhya_oauth` | OAuth (produção) | `client_id`, `client_secret`, `x_token` (+ `base_url`) |
| `sankhya_oauth_sandbox` | OAuth (sandbox) | `client_id`, `client_secret`, `x_token` (+ `base_url`) |
Ordem de tentativa: `sankhya_gateway_mitra` → `sankhya_oauth` → `sankhya_oauth_sandbox`.

**Nota de arquitetura (a fechar na Fase 3):** os templates armazenam **uma** credencial no nível do projeto (uma sessão de serviço). Para "sessão por usuário" existem 2 caminhos:
- **(A) Conexão de serviço + carimbo do aprovador:** uma credencial de serviço faz as chamadas; a identidade de quem aprovou vem do **usuário logado do Mitra (`INT_USER`)** e é gravada em `AD_APROFIN`. Simples, robusto, e ainda satisfaz o rastreio de quem aprovou. **(Recomendado)**
- **(B) Login Sankhya real por usuário:** cada usuário autentica no Sankhya (MobileLoginSP), token por usuário é gerido/armazenado e passado a cada chamada. Fiel ao RN-01, porém mais complexo (ciclo de vida do token, expiração de 10 min por usuário, armazenamento seguro). Provável integração custom.

---

## 7. Plano de Implementação por Etapas
1. **Fase 1 (atual):** planejamento — este doc + `ux.md` + `design.md`.
2. **GATE Integração (I.0):** estudar guia, definir template Sankhya, obter/validar credenciais, decidir estratégia de auth.
3. **Backend (2.1):** criar integração + SFs de leitura e escrita; validar contra dados reais.
4. **Frontend (2.2):** login → saldos → filtros → árvore/cascata → painel de ações → desaprovação → logout.
5. **Testes (3)** e **validações (4.x)**.

---

## 8. Critérios de Aceite (rastreabilidade)
Herdados do escopo v2.1 (CA-01 a CA-12). Cada RF acima mapeia 1..N CAs; a fase 4.5 fará a checagem item a item contra o escopo original.

---

## 9. Riscos e Mitigação
| # | Risco | Impacto | Mitigação |
|---|-------|---------|-----------|
| R-01 | **Conflito de autenticação:** escopo exige login Sankhya por usuário (`MobileLoginSP`); a plataforma Mitra exige login nativo (controle de licença) e proíbe auth custom. | Alto — decisão arquitetural estruturante | **DECIDIDO (20/07): Login nativo Mitra (gating/licença) + sessão Sankhya por usuário.** Cada aprovador conecta sua credencial Sankhya; o token de sessão (`mgeSession`/`jsessionid`) é obtido por usuário e usado nas chamadas de leitura/gravação, preservando o rastreio de quem aprovou. Detalhamento técnico do armazenamento/uso do token por usuário será fechado no gate de integração (Fase 3). |
| R-02 | Limite de 5.000 linhas do `DbExplorerSP` (`burstLimit`). | Médio — dados truncados | Paginação via SQL (ROWNUM/OFFSET) e/ou filtros server-side. |
| R-03 | Expiração de sessão (~10 min) durante uso. | Médio — UX | Detectar 401/erro de sessão → redirecionar ao login (FA-01) com mensagem. |
| R-04 | Concorrência entre aprovadores no mesmo NUFIN. | Baixo — definido | "Vence o último" (RN-06); recarregar lista após cada ação. |
| R-05 | Versão/config do gateway Sankhya do cliente varia. | Médio — conexão | Estratégia de fallback de template (gateway → oauth → sandbox). |
| R-06 | Performance da view `MOV_DIARIO_MISA` em tempo real. | Médio | Depende de PC-03; validar no gate; considerar filtros obrigatórios mínimos. |

---

## 10. Decisões pendentes (bloqueiam próximos passos)
1. **Referência visual** (para `ux.md`/`design.md`) — aguardando escolha.
2. **Estratégia de autenticação Sankhya** (R-01) — a resolver no gate de integração / com o usuário.
