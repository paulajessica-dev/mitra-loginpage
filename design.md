# Design — Portal de Aprovação de Títulos Financeiros (MISA)

## Referência
**Stripe / Notion (corporativo suave).** Interface confiável de ferramenta financeira: cards bem definidos, sombras leves, bordas sutis, acentos de cor discretos e tipografia clara. Nada de neon ou blocos grandes de cor — a cor entra pelos **dados** (badges de status, valor "Disponível", vencidos).

## Tom
**Automático conforme o Sistema Operacional** via `@media (prefers-color-scheme: dark)`.
- Light por padrão (SO claro); Dark quando o SO estiver em modo escuro.
- Sem toggle manual nesta versão (segue o SO). Ambos os tons devem ter paridade total de contraste e legibilidade.
- **Regra:** nunca misturar tons (nav clara + conteúdo escuro é proibido) — o `prefers-color-scheme` troca o conjunto inteiro de variáveis de uma vez.

## Paleta de Cores
Primary **azul confiança** (domínio financeiro), sóbrio (estilo Stripe).

```css
:root {
  /* LIGHT (padrão) */
  --color-primary: #4f46e5;          /* indigo/azul corporativo */
  --color-primary-hover: #4338ca;
  --color-primary-light: #6366f1;
  --color-primary-bg: #eef2ff;
  --color-bg: #f7f8fa;               /* fundo levemente acinzentado (Notion-like) */
  --color-surface: #ffffff;          /* cards/containers */
  --color-nav: #ffffff;
  --color-nav-text: #334155;
  --color-nav-active: #4f46e5;
  --color-nav-hover: #f1f5f9;
  --color-border: #e6e8ec;
  --color-text: #1a1d23;
  --color-text-secondary: #6b7280;

  /* Semânticas (status/valores) */
  --color-success: #16a34a;          /* aprovado / positivo */
  --color-success-bg: #f0fdf4;
  --color-warning: #d97706;          /* em análise */
  --color-warning-bg: #fffbeb;
  --color-danger: #dc2626;           /* vencidos / erro */
  --color-danger-bg: #fef2f2;
  --color-info: #0891b2;             /* encaixe / informativo */
  --color-info-bg: #ecfeff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-primary: #6366f1;
    --color-primary-hover: #4f46e5;
    --color-primary-light: #818cf8;
    --color-primary-bg: #1e1b4b;
    --color-bg: #0d0f14;             /* fundo bem escuro */
    --color-surface: #171a21;        /* cards levemente mais claros */
    --color-nav: #171a21;
    --color-nav-text: #cbd5e1;
    --color-nav-active: #818cf8;
    --color-nav-hover: #1f232c;
    --color-border: #262b34;
    --color-text: #eef0f3;
    --color-text-secondary: #98a1b0;

    --color-success: #22c55e;
    --color-success-bg: #0f2417;
    --color-warning: #f59e0b;
    --color-warning-bg: #2a2010;
    --color-danger: #ef4444;
    --color-danger-bg: #2a1414;
    --color-info: #22d3ee;
    --color-info-bg: #0c2429;
  }
}
```

## Tipografia
- **Inter** (já no template). Sem fontes decorativas.
- Valores monetários: tabular/medium, alinhados à direita, para leitura de colunas.
- Hierarquia: título de seção `text-lg font-semibold`; labels `text-sm text-secondary`; valores KPI `text-2xl font-semibold`.

## Componentes Principais
- **Cards de Saldo (KPI):** `rounded-xl` + `background: var(--color-surface)` + `border` + `shadow-sm`. Cada KPI com ícone `lucide-react` em círculo suave da cor semântica correspondente (ex.: Vencidos = danger, Encaixe = info, Aprovado = success, Em Análise = warning, Disponível = primary em destaque). Cores diferentes por KPI — nunca todos primary.
- **Barra de Filtros:** inputs/selects custom (nunca nativos), todos com a **mesma altura** (`h-10`), `rounded-lg`, `focus:ring` primary. Campos de data/empresa esmaecem (`opacity-50` + disabled) quando NUFIN preenchido.
- **Árvore:** linhas com `hover:bg-[var(--color-nav-hover)]`, recuo por nível (indent), chevron animado, checkbox custom com estado **indeterminado**. Valor agregado do nó alinhado à direita. Densidade compacta (`py-2`) mas com alvo de toque adequado no mobile.
- **Badges de status:** `Aprovado` (success), `Em Análise` (warning), `Pendente` (neutro). `rounded-full`, `text-xs font-medium`, bg suave da cor.
- **Botão "Desaprovar":** botão sutil/ghost com ícone (aparece só em linhas aprovadas hoje).
- **Painel de Ações Flutuante:** card com `shadow-lg`, `background: var(--color-surface)`, borda superior de destaque; totalizador à esquerda, botões à direita ("Salvar Análise" = secundário; "Aprovar" = primary).
- **Toasts:** sucesso (success), erro do ERP (danger) — componente `Toast` do template.
- **ConfirmDialog:** antes de "Aprovar".

## DNA Visual
- Cards: `rounded-xl shadow-sm p-4/5` + surface sólido (nunca transparente/blur).
- Botões: `rounded-lg`, `transition-all duration-200`.
- Inputs/controles: `rounded-lg`, mesma altura em toda a UI, `focus:ring` primary.
- Ícones: `lucide-react` (nunca emojis). Ícones reutilizados por ação em todas as telas.
- Animações sutis: `animate-fadeIn` na árvore/painel, `animate-scaleIn` em diálogos.

## Detalhes por Tela
- **Login:** card centralizado (`max-w-sm`), logo/nome do portal no topo, campos usuário/senha, botão primary full-width, área de mensagem de erro/sessão expirada abaixo.
- **Portal:**
  - Topo: barra do app (nome do portal à esquerda, usuário + logout à direita).
  - Cabeçalho de saldos: 6 KPI cards, "Disponível" com destaque visual (borda/realce primary).
  - Filtros logo abaixo, em uma linha (desktop) / colapsável (mobile).
  - Árvore ocupando o corpo, com toolbar (Expandir/Colapsar tudo, contador de resultados).
  - Painel de ações flutuante fixo (rodapé no mobile, canto inferior direito no desktop).

## Título e Favicon
- `<title>`: "Portal de Aprovação — MISA" (ajustar se o usuário fornecer nome de marca).
- Favicon: SVG inline (ícone de check/financeiro na cor primary) até que a marca da Carbomil seja fornecida.

## Guardrails
- Sem cores hardcoded em JSX — apenas CSS variables.
- Sem controles nativos (select/checkbox/date) — usar os customizados do template.
- Contraste AA garantido em light e dark.
- Consistência total: mesmo tratamento visual em cards, modais, painel e árvore.

> Este arquivo será usado na fase 4.3 para validar aderência visual.
