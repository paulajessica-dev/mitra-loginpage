# Tasks — Portal de Aprovação de Títulos Financeiros (MISA)

Base: Escopo Técnico Funcional v2.1 (20/07/2026).

| # | Task | Status | Início | Fim | Duração | Output |
|---|------|--------|--------|-----|---------|--------|
| 0 | Resolver decisões pendentes (referência visual ✅ / estratégia de auth Sankhya ⏳) | 🔄 in-progress | — | — | — | referência ok; auth pendente |
| 1.1 | Planejar feature e arquitetura | ✅ done | — | — | — | featuresearquitetura.md |
| 1.2 | Descobrir referência visual com usuário | ✅ done | — | — | — | Stripe/Notion, dark+light auto (SO) |
| 1.2.1 | Definir UX | ✅ done | — | — | — | ux.md |
| 1.2.2 | Definir design | ✅ done | — | — | — | design.md |
| I.0 | GATE Integração Sankhya — estudar guia + alinhar credenciais/estratégia | ✅ done | — | — | — | híbrida validada com testes reais; queries de referência mapeadas |
| 2.1 | Executar backend (integração Sankhya + SFs) | ✅ done | — | — | — | 12 SFs criadas e testadas no Sankhya real |
| 2.2 | Executar frontend (login, árvore, saldos, painel de ações) | ✅ done | — | — | — | build ok; portal completo |
| 2.4 | Avaliar agente de negócio (opcional para este projeto) | ⏳ pending | — | — | — | decisão registrada |
| 3 | Testes obrigatórios | ⏳ pending | — | — | — | validação completa |
| 4.1 | Validar features e arquitetura | ⏳ pending | — | — | — | ajustes |
| 4.2 | Validar UX | ⏳ pending | — | — | — | ajustes |
| 4.3 | Validar design | ⏳ pending | — | — | — | ajustes |
| 4.4 | Validar gerenciamento de usuários | ⏳ pending | — | — | — | auth e permissões corretos |
| 4.4.2 | Validar permissões business vs dev | ⏳ pending | — | — | — | nenhuma função dev-only em tela de business |
| 4.5 | Revisão final contra o escopo v2.1 (RN, CA, fluxos) | ⏳ pending | — | — | — | nenhum item esquecido |
| 4.6 | Salvar instruções adicionais do projeto | ⏳ pending | — | — | — | additionalInstructions atualizado |

## Notas
- **Task 2.3 (highlight/drill/cross-filter) removida:** este projeto não é um dashboard analítico com gráficos — é um portal operacional de aprovação (árvore hierárquica + widget de saldos + ações). Não se aplica.
- **Task I.0 (GATE Integração):** inserida porque o projeto depende integralmente de dados externos do Sankhya. Nenhuma implementação de conexão pode começar antes do alinhamento (guia de integração + credenciais + estratégia).
- **Decisão crítica em aberto:** estratégia de autenticação (login Sankhya `MobileLoginSP` por usuário vs. login nativo Mitra + credencial de serviço) — ver seção 9 (Riscos) do featuresearquitetura.md.
