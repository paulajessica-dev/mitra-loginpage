# UX — Portal de Aprovação de Títulos Financeiros (MISA)

> Referência: **Stripe / Notion (corporativo suave)**. Tom: **claro + escuro automático conforme o SO** (`prefers-color-scheme`). Mobile-first / responsivo (CA-06, RNF-01). Deriva das features do `featuresearquitetura.md`.

---

## 1. Princípios de UX
- **Produtividade acima de decoração:** o aprovador precisa ver saldos, filtrar, selecionar e aprovar com o mínimo de cliques.
- **Contexto sempre visível:** saldos do dia e totalizador de seleção permanecem à vista durante a operação.
- **Densidade controlada:** a árvore é densa por natureza (até 5.000 registros) — usar hierarquia colapsável, espaçamento consistente e tipografia legível para não cansar.
- **Feedback imediato:** toda ação (análise, aprovação, desaprovação, erro de ERP) gera retorno visual (toast + recarga).

---

## 2. Estrutura de Telas
Portal de **tela única de trabalho** (não há necessidade de menu multi-página), além do login.

### 2.1 Login (`/login`)
- Campos: usuário e senha do Sankhya.
- Botão "Entrar"; estados de loading e erro (credenciais inválidas → CA-01).
- Mensagem informativa quando redirecionado por sessão expirada (FA-01).
- Sem SSO/cadastro próprio nesta tela (auth é contra o Sankhya) — ver decisão de auth (R-01) no featuresearquitetura.

### 2.2 Portal de Aprovação (`/`)
Layout em 3 regiões verticais + painel flutuante:

**A) Cabeçalho de Saldos (fixo no topo)**
- Cards compactos: Saldo Anterior · Encaixe · Aprovado · Em Análise · **Disponível** (destaque) · Vencidos.
- Sempre do **dia atual**, imune aos filtros (RN-05). Exclui CODEMP 999 (CA-12).
- No mobile: vira carrossel/scroll horizontal ou grid 2 colunas.

**B) Barra de Filtros**
- Período (data inicial/final), Empresa (select custom), Busca por NUFIN.
- Regra visual: ao preencher NUFIN, os campos de data/empresa ficam esmaecidos/desabilitados (indicando que serão ignorados — CA-09).
- Botão "Pesquisar" + botão "Limpar".

**C) Árvore de Títulos**
- 5 níveis: Empresa > Grupo Natureza > Natureza > Parceiro > Vencimento (RN-03).
- Cada nó: chevron expandir/colapsar, checkbox, rótulo e valor agregado do nó.
- Ações globais: "Expandir tudo" / "Colapsar tudo" (CA-03).
- Checkbox em cascata: marcar pai marca todos os filhos; estado indeterminado quando seleção parcial (RN-07, CA-05).
- Linha de título aprovado **hoje**: badge "Aprovado" + botão "Desaprovar" (CA-04).
- Estado vazio: "Nenhum título encontrado para os filtros selecionados" (FA-02).
- Estado loading: skeleton/spinner. Volume alto: virtualização/paginação (RNF-02).

**D) Painel de Ações Flutuante (aparece com seleção > 0)**
- Fixo no rodapé (mobile) / canto inferior (desktop).
- Totalizador em tempo real: nº de títulos + soma dos valores selecionados (CA-08).
- Botões: "Salvar Análise" (status 2) e "Aprovar" (status 3).
- Confirmação antes de aprovar (ConfirmDialog).

**E) Cabeçalho do app**
- Nome do usuário logado + botão de logout (invoca `MobileLoginSP.logout` + limpa sessão — CA-10).

---

## 3. Fluxos de Interação (mapeados ao Caminho Feliz do escopo)
1. Login → validação → entra no portal.
2. Ao carregar o portal: dispara limpeza de travados (RN-02) e carrega saldos do dia.
3. Usuário ajusta filtros → "Pesquisar" → árvore renderiza.
4. Usuário expande/navega e seleciona nós (cascata).
5. Painel flutuante mostra totalizador → "Salvar Análise" ou "Aprovar".
6. Sistema grava (DatasetSP) → toast de sucesso → recarrega lista e saldos.
7. Erros do ERP → toast de alerta (FA-03).

---

## 4. Estados obrigatórios por componente
- **Saldos:** loading, carregado, erro.
- **Filtros:** normal, NUFIN-ativo (data/empresa esmaecidos), pesquisando.
- **Árvore:** loading, com dados, vazia, erro, volume alto (paginado/virtualizado).
- **Ações:** oculto (sem seleção), ativo (com seleção), enviando, confirmação de aprovação.
- **Sessão:** ativa, expirando/expirada → redirecionar login.

---

## 5. Responsividade
- **Desktop:** saldos em linha (6 cards), árvore ocupa largura total, painel de ações no canto inferior direito.
- **Tablet:** saldos em grid 3x2, árvore full-width.
- **Mobile:** saldos em grid 2 colunas ou scroll horizontal; filtros colapsáveis em "Filtros"; árvore com recuo reduzido por nível; painel de ações fixo no rodapé (barra) — sempre acessível com o polegar.

---

## 6. Acessibilidade
- Contraste WCAG AA em ambos os tons.
- Alvos de toque ≥ 40px no mobile.
- Checkboxes/expansão navegáveis por teclado; Escape fecha dropdowns/diálogos.
- Estado indeterminado do checkbox comunicado visualmente (não só por cor).
