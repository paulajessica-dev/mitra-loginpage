import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { ChevronRight, Minus, Check, Rows3, ChevronsDownUp, ChevronsUpDown, Undo2, Eye, ArrowUp, ArrowDown, Layers, X, Plus, Filter, Search } from 'lucide-react';
import { fmtMoeda, fmtVencimento, chaveVenc, STATUSWEB } from '../lib/sankhya';
import type { Titulo } from '../lib/sankhya';

// ── Dimensões de agrupamento (a hierarquia é montada na ordem escolhida) ──
type DimId = 'empresa' | 'grupoNatureza' | 'natureza' | 'parceiro' | 'vencimento';
interface DimDef { id: DimId; label: string; chave: (t: Titulo) => string; ordena: (a: string, b: string, ta: Titulo, tb: Titulo) => number; }

const DIMENSOES: Record<DimId, DimDef> = {
  empresa:       { id: 'empresa',       label: 'Empresa',            chave: t => t.empresa || `Empresa ${t.codemp}`, ordena: (a, b) => a.localeCompare(b, 'pt-BR') },
  grupoNatureza: { id: 'grupoNatureza', label: 'Grupo de Natureza',  chave: t => t.grupoNatureza || '(Sem grupo)',    ordena: (a, b) => a.localeCompare(b, 'pt-BR') },
  natureza:      { id: 'natureza',      label: 'Natureza',           chave: t => t.natureza || '(Sem natureza)',      ordena: (a, b) => a.localeCompare(b, 'pt-BR') },
  parceiro:      { id: 'parceiro',      label: 'Parceiro',           chave: t => t.parceiro || `Parceiro ${t.codparc}`, ordena: (a, b) => a.localeCompare(b, 'pt-BR') },
  vencimento:    { id: 'vencimento',    label: 'Vencimento',         chave: t => fmtVencimento(t.vencimento),          ordena: (_a, _b, ta, tb) => chaveVenc(ta.vencimento).localeCompare(chaveVenc(tb.vencimento)) },
};
const DIM_ORDER: DimId[] = ['empresa', 'grupoNatureza', 'natureza', 'parceiro', 'vencimento'];
const HIERARQUIA_COMPLETA: DimId[] = ['empresa', 'grupoNatureza', 'natureza', 'parceiro', 'vencimento'];

interface TNode { id: string; label: string; valor: number; nufins: number[]; depth: number; children?: TNode[]; titulo?: Titulo; }

function build(titulos: Titulo[], dims: DimId[]): { nodes: TNode[]; allIds: string[] } {
  const allIds: string[] = [];
  function rec(items: Titulo[], depth: number, prefix: string): TNode[] {
    if (depth === dims.length) {
      return items.map(t => ({ id: `${prefix}/t${t.nufin}`, label: '', valor: t.valor || 0, nufins: [t.nufin], depth, titulo: t }));
    }
    const def = DIMENSOES[dims[depth]];
    const groups = new Map<string, Titulo[]>();
    for (const t of items) { const k = def.chave(t); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(t); }
    const entries = [...groups.entries()].sort((a, b) => def.ordena(a[0], b[0], a[1][0], b[1][0]));
    return entries.map(([label, sub]) => {
      const id = `${prefix}/${depth}:${label}`;
      allIds.push(id);
      const children = rec(sub, depth + 1, id);
      return { id, label, valor: sub.reduce((s, t) => s + (t.valor || 0), 0), nufins: sub.map(t => t.nufin), depth, children };
    });
  }
  const nodes = rec(titulos, 0, 'r');
  return { nodes, allIds };
}

// ── Estilo por nível de hierarquia ──
const FAIXAS = ['var(--tree-l0-bg)', 'var(--tree-l1-bg)', 'var(--tree-l2-bg)', 'var(--tree-l3-bg)', 'var(--tree-l4-bg)'];
function faixa(depth: number): string { return FAIXAS[Math.min(depth, FAIXAS.length - 1)]; }
function corTexto(depth: number): string { return depth === 0 ? 'var(--tree-l0-text)' : 'var(--color-text)'; }
function corTextoFraco(depth: number): string { return depth === 0 ? 'var(--tree-l0-text)' : 'var(--color-text-secondary)'; }
function pesoLabel(depth: number): string {
  if (depth === 0) return 'text-[13px] font-semibold tracking-wide';
  if (depth === 1) return 'text-[13px] font-semibold';
  if (depth === 2) return 'text-[13px] font-medium';
  return 'text-[13px] font-normal';
}
function alturaLinha(depth: number): string { return depth <= 1 ? 'py-3' : 'py-2.5'; }
function indentDe(dims: DimId[]): number { return 12 + dims.length * 20; }

function TriCheck({ state, onClick, escuro = false }: { state: 'on' | 'off' | 'part'; onClick: (e: React.MouseEvent) => void; escuro?: boolean }) {
  const vazio = escuro ? 'transparent' : 'var(--color-surface)';
  const borda = escuro ? 'rgba(255,255,255,0.55)' : 'var(--color-border)';
  return (
    <button type="button" onClick={onClick}
      className="w-[18px] h-[18px] rounded shrink-0 border flex items-center justify-center transition-all focus:outline-none"
      style={{ backgroundColor: state !== 'off' ? 'var(--color-primary)' : vazio, borderColor: state !== 'off' ? 'var(--color-primary)' : borda }}>
      {state === 'on' && <Check size={12} strokeWidth={3} color="#fff" />}
      {state === 'part' && <Minus size={12} strokeWidth={3} color="#fff" />}
    </button>
  );
}
function StatusBadge({ sw }: { sw: number }) {
  if (sw === STATUSWEB.APROVADO) return <span className="px-2 py-0.5 text-[11px] font-medium rounded-full" style={{ backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)' }}>Aprovado</span>;
  if (sw === STATUSWEB.EM_ANALISE) return <span className="px-2 py-0.5 text-[11px] font-medium rounded-full" style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>Em Análise</span>;
  return <span className="px-2 py-0.5 text-[11px] font-medium rounded-full" style={{ backgroundColor: 'var(--color-nav-hover)', color: 'var(--color-text-secondary)' }}>Pendente</span>;
}

// ── Definição de colunas ──
type ColId = DimId | 'nufin' | 'status' | 'historico' | 'nota' | 'valor' | 'tipotitulo' | 'situacao';
interface ColDef {
  id: ColId; label: string; w: number; dim?: DimId; align?: 'right'; cls?: string;
  cell: (t: Titulo) => React.ReactNode; cmp: (a: Titulo, b: Titulo) => number;
  filtro?: (t: Titulo) => string;   // valor textual p/ o filtro por coluna (só nas que têm repetição)
  soma?: (t: Titulo) => number;     // se definido, a coluna ganha totalizador no rodapé
}
const s = (v: any) => String(v ?? '');
const COLDEF: Record<ColId, ColDef> = {
  empresa:       { id: 'empresa', label: 'Empresa', w: 170, dim: 'empresa', cell: t => t.empresa || `Empresa ${t.codemp}`, cmp: (a, b) => s(a.empresa).localeCompare(s(b.empresa), 'pt-BR'), filtro: t => t.empresa || `Empresa ${t.codemp}` },
  grupoNatureza: { id: 'grupoNatureza', label: 'Grupo de Natureza', w: 150, dim: 'grupoNatureza', cell: t => t.grupoNatureza || '—', cmp: (a, b) => s(a.grupoNatureza).localeCompare(s(b.grupoNatureza), 'pt-BR'), filtro: t => t.grupoNatureza || '(vazio)' },
  natureza:      { id: 'natureza', label: 'Natureza', w: 150, dim: 'natureza', cell: t => t.natureza || '—', cmp: (a, b) => s(a.natureza).localeCompare(s(b.natureza), 'pt-BR'), filtro: t => t.natureza || '(vazio)' },
  parceiro:      { id: 'parceiro', label: 'Parceiro', w: 170, dim: 'parceiro', cell: t => t.parceiro || `Parceiro ${t.codparc}`, cmp: (a, b) => s(a.parceiro).localeCompare(s(b.parceiro), 'pt-BR'), filtro: t => t.parceiro || `Parceiro ${t.codparc}` },
  nufin:         { id: 'nufin', label: 'Nro Único', w: 100, cls: 'font-medium tabular-nums', cell: t => t.nufin, cmp: (a, b) => a.nufin - b.nufin },
  status:        { id: 'status', label: 'Status', w: 110, cell: t => t.status || '—', cmp: (a, b) => s(a.status).localeCompare(s(b.status), 'pt-BR'), filtro: t => t.status || '(vazio)' },
  vencimento:    { id: 'vencimento', label: 'Vencimento', w: 110, dim: 'vencimento', cls: 'tabular-nums', cell: t => fmtVencimento(t.vencimento), cmp: (a, b) => chaveVenc(a.vencimento).localeCompare(chaveVenc(b.vencimento)), filtro: t => fmtVencimento(t.vencimento) },
  historico:     { id: 'historico', label: 'Histórico', w: 220, cls: 'text-[var(--color-text-secondary)]', cell: t => t.historico || '', cmp: (a, b) => s(a.historico).localeCompare(s(b.historico), 'pt-BR') },
  nota:          { id: 'nota', label: 'Nota', w: 92, align: 'right', cls: 'tabular-nums', cell: t => (t.numnota != null ? t.numnota : '—'), cmp: (a, b) => (a.numnota ?? -Infinity) - (b.numnota ?? -Infinity) },
  valor:         { id: 'valor', label: 'Valor', w: 130, align: 'right', cls: 'font-medium tabular-nums', cell: t => fmtMoeda(t.valor), cmp: (a, b) => (a.valor || 0) - (b.valor || 0), soma: t => t.valor || 0 },
  tipotitulo:    { id: 'tipotitulo', label: 'Tipo de Título', w: 130, cell: t => t.tipotitulo || '—', cmp: (a, b) => s(a.tipotitulo).localeCompare(s(b.tipotitulo), 'pt-BR'), filtro: t => t.tipotitulo || '(vazio)' },
  situacao:      { id: 'situacao', label: 'Situação', w: 120, cell: t => <StatusBadge sw={t.statusweb} />, cmp: (a, b) => a.statusweb - b.statusweb, filtro: t => (t.statusweb === STATUSWEB.APROVADO ? 'Aprovado' : t.statusweb === STATUSWEB.EM_ANALISE ? 'Em Análise' : 'Pendente') },
};
const DATA_DEFAULT: ColId[] = ['empresa', 'grupoNatureza', 'natureza', 'parceiro', 'nufin', 'status', 'vencimento', 'historico', 'nota', 'valor', 'tipotitulo', 'situacao'];
const CHECK_W = 36, ACOES_W = 80, COL_MIN = 60;

// Layout do usuário (ordem + larguras) — persistido no navegador
const LS_KEY = 'misa-grid-layout-v1';
function carregarLayout(): { order: ColId[]; widths: Record<string, number> } {
  let order = [...DATA_DEFAULT]; let widths: Record<string, number> = {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p.order)) {
        const val = p.order.filter((x: any) => DATA_DEFAULT.includes(x));
        order = [...val, ...DATA_DEFAULT.filter(x => !val.includes(x))];
      }
      if (p.widths && typeof p.widths === 'object') widths = p.widths;
    }
  } catch { /* ignora */ }
  return { order, widths };
}

// ── Linha de um título — mesma renderização na tabela plana e nas folhas ──
function LinhaTitulo({ t, cols, template, indent, selected, onToggleSel, onDesaprovar, onVer }: {
  t: Titulo; cols: ColDef[]; template: string; indent: number; selected: Set<number>;
  onToggleSel: (nufins: number[], on: boolean) => void; onDesaprovar: (t: Titulo) => void; onVer: (t: Titulo) => void;
}) {
  const on = selected.has(t.nufin);
  return (
    <div className="tree-row grid items-center gap-x-2 py-2.5 pr-4 border-b"
      style={{ gridTemplateColumns: template, paddingLeft: indent, backgroundColor: 'var(--tree-leaf-bg)', borderColor: 'var(--tree-row-border)' }}>
      <TriCheck state={on ? 'on' : 'off'} onClick={() => onToggleSel([t.nufin], !on)} />
      {cols.map(c => (
        <span key={c.id} className={`text-[13px] truncate ${c.align === 'right' ? 'text-right' : ''} ${c.cls || ''}`}
          title={c.id === 'historico' || c.id === 'empresa' || c.id === 'parceiro' ? s(c.cell(t)) : undefined}
          style={c.cls?.includes('color') ? undefined : { color: 'var(--color-text)' }}>
          {c.cell(t)}
        </span>
      ))}
      <span className="flex items-center justify-end gap-0.5">
        <button onClick={() => onVer(t)} title="Ver detalhes do título" className="p-1.5 rounded-md shrink-0 hover:bg-[var(--color-nav-hover)]" style={{ color: 'var(--color-text-secondary)' }}><Eye size={15} /></button>
        {t.statusweb === STATUSWEB.APROVADO && (
          <button onClick={() => onDesaprovar(t)} title="Desaprovar título" className="p-1.5 rounded-md shrink-0 hover:bg-[var(--color-danger-bg)]" style={{ color: 'var(--color-danger)' }}><Undo2 size={15} /></button>
        )}
      </span>
    </div>
  );
}

// Cabeçalho de colunas no nível final (aparece logo antes das linhas de título,
// dentro do agrupamento). Mostra rótulos + funil de filtro, alinhado às colunas.
function CabecalhoColunas({ cols, template, indent, filtros, onAbrirFiltro }: {
  cols: ColDef[]; template: string; indent: number; filtros: Partial<Record<ColId, string[]>>; onAbrirFiltro: (e: React.MouseEvent, col: ColId) => void;
}) {
  return (
    <div className="grid items-center gap-x-2 py-2 pr-4 border-b" style={{ gridTemplateColumns: template, paddingLeft: indent, backgroundColor: 'var(--tree-leaf-bg)', borderColor: 'var(--tree-row-border)', color: 'var(--color-text-secondary)' }}>
      <span />
      {cols.map(c => {
        const temFiltro = filtros[c.id] !== undefined;
        return (
          <div key={c.id} className={`flex items-center gap-1 min-w-0 ${c.align === 'right' ? 'justify-end' : ''}`}>
            <span className="text-[11px] font-medium uppercase tracking-wide truncate">{c.label}</span>
            {c.filtro && (
              <button type="button" onClick={e => onAbrirFiltro(e, c.id)} title="Filtrar coluna" className="p-0.5 rounded shrink-0 hover:bg-[var(--color-nav-hover)]" style={{ color: temFiltro ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                <Filter size={12} fill={temFiltro ? 'currentColor' : 'none'} />
              </button>
            )}
          </div>
        );
      })}
      <span />
    </div>
  );
}

interface NodeProps {
  node: TNode; cols: ColDef[]; template: string; leafIndent: number; selected: Set<number>; expanded: Set<string>;
  filtros: Partial<Record<ColId, string[]>>; onAbrirFiltro: (e: React.MouseEvent, col: ColId) => void;
  onToggleExp: (id: string) => void; onToggleSel: (nufins: number[], on: boolean) => void;
  onDesaprovar: (t: Titulo) => void; onVer: (t: Titulo) => void;
}
function Node({ node, cols, template, leafIndent, selected, expanded, filtros, onAbrirFiltro, onToggleExp, onToggleSel, onDesaprovar, onVer }: NodeProps) {
  if (node.titulo) {
    return <LinhaTitulo t={node.titulo} cols={cols} template={template} indent={leafIndent} selected={selected} onToggleSel={onToggleSel} onDesaprovar={onDesaprovar} onVer={onVer} />;
  }
  const sel = node.nufins.filter(n => selected.has(n)).length;
  const state: 'on' | 'off' | 'part' = sel === 0 ? 'off' : (sel === node.nufins.length ? 'on' : 'part');
  const isOpen = expanded.has(node.id);
  const escuro = node.depth === 0;
  const pad = 12 + node.depth * 20;
  return (
    <div>
      <div className={`tree-row flex items-center gap-2.5 pr-4 border-b cursor-pointer ${alturaLinha(node.depth)}`}
        style={{ paddingLeft: pad, backgroundColor: faixa(node.depth), borderColor: escuro ? 'transparent' : 'var(--tree-row-border)' }}
        onClick={() => onToggleExp(node.id)}>
        <ChevronRight size={15} className="shrink-0 transition-transform" style={{ color: corTextoFraco(node.depth), transform: isOpen ? 'rotate(90deg)' : 'none' }} />
        <div onClick={e => e.stopPropagation()}><TriCheck state={state} escuro={escuro} onClick={() => onToggleSel(node.nufins, state !== 'on')} /></div>
        <span className={`flex-1 min-w-0 truncate ${pesoLabel(node.depth)}`} style={{ color: corTexto(node.depth) }}>{node.label}</span>
        <span className="text-xs shrink-0 tabular-nums" style={{ color: corTextoFraco(node.depth), opacity: escuro ? 0.75 : 1 }}>{node.nufins.length}</span>
        <span className={`tabular-nums shrink-0 ${node.depth === 0 ? 'text-[13px] font-semibold' : 'text-[13px] font-medium'}`} style={{ color: corTexto(node.depth) }}>{fmtMoeda(node.valor)}</span>
      </div>
      {isOpen && node.children && (
        <>
          {node.children[0]?.titulo && <CabecalhoColunas cols={cols} template={template} indent={leafIndent} filtros={filtros} onAbrirFiltro={onAbrirFiltro} />}
          {node.children.map(c => (
            <Node key={c.id} node={c} cols={cols} template={template} leafIndent={leafIndent} selected={selected} expanded={expanded} filtros={filtros} onAbrirFiltro={onAbrirFiltro} onToggleExp={onToggleExp} onToggleSel={onToggleSel} onDesaprovar={onDesaprovar} onVer={onVer} />
          ))}
        </>
      )}
    </div>
  );
}

// ── Controle "Agrupar por" (dimensões + ordem) ──
// Edita um RASCUNHO local; só reflete na grid ao clicar em "Aplicar".
function AgruparControl({ grupo, onChange }: { grupo: DimId[]; onChange: (g: DimId[]) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rascunho, setRascunho] = useState<DimId[]>(grupo);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    if (open) { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onEsc); }
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);
  function toggle() {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left, y: r.bottom + 4 });
    setRascunho(grupo);   // reabre sempre a partir do que está aplicado
    setOpen(true);
  }
  function aplicar() { onChange(rascunho); setOpen(false); }
  const disponiveis = DIM_ORDER.filter(d => !rascunho.includes(d));
  function mover(i: number, dir: -1 | 1) { const j = i + dir; if (j < 0 || j >= rascunho.length) return; const g = [...rascunho];[g[i], g[j]] = [g[j], g[i]]; setRascunho(g); }
  const alterado = rascunho.length !== grupo.length || rascunho.some((d, i) => d !== grupo[i]);
  // Menu com posicao fixa (relativa a tela) para nao ser cortado pelo overflow do card.
  const left = Math.min(pos.x, window.innerWidth - 296);
  const top = Math.min(pos.y, Math.max(8, window.innerHeight - 360));
  return (
    <div className="relative" ref={ref}>
      <button type="button" ref={btnRef} onClick={toggle}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border max-w-full transition-all hover:bg-[var(--color-nav-hover)]"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }} title="Configurar agrupamento">
        <Layers size={13} className="shrink-0" style={{ color: 'var(--color-primary)' }} />
        {grupo.length === 0 ? <span>Sem agrupamento</span> : (
          <span className="flex items-center gap-1 truncate">
            {grupo.map((d, i) => (
              <span key={d} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={11} className="opacity-60 shrink-0" />}
                <span className="font-medium truncate" style={{ color: 'var(--color-text)' }}>{DIMENSOES[d].label}</span>
              </span>
            ))}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed z-50 rounded-xl border shadow-lg animate-scaleIn w-[280px] max-h-[85vh] overflow-y-auto" style={{ left, top, backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <div className="px-3 py-2 border-b text-[11px] font-semibold uppercase tracking-wide" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>Agrupar por (ordem)</div>
          <div className="py-1">
            {rascunho.length === 0 && <div className="px-3 py-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Nenhuma dimensão — exibindo tabela plana.</div>}
            {rascunho.map((d, i) => (
              <div key={d} className="flex items-center gap-1.5 px-2 py-1.5">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>{i + 1}</span>
                <span className="flex-1 min-w-0 truncate text-sm" style={{ color: 'var(--color-text)' }}>{DIMENSOES[d].label}</span>
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="p-1 rounded disabled:opacity-30 hover:bg-[var(--color-nav-hover)]" title="Subir"><ArrowUp size={13} style={{ color: 'var(--color-text-secondary)' }} /></button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === rascunho.length - 1} className="p-1 rounded disabled:opacity-30 hover:bg-[var(--color-nav-hover)]" title="Descer"><ArrowDown size={13} style={{ color: 'var(--color-text-secondary)' }} /></button>
                <button type="button" onClick={() => setRascunho(rascunho.filter(x => x !== d))} className="p-1 rounded hover:bg-[var(--color-danger-bg)]" title="Remover"><X size={13} style={{ color: 'var(--color-danger)' }} /></button>
              </div>
            ))}
          </div>
          {disponiveis.length > 0 && (
            <>
              <div className="px-3 py-1.5 border-t text-[11px] font-semibold uppercase tracking-wide" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>Adicionar</div>
              <div className="py-1">
                {disponiveis.map(d => (
                  <button key={d} type="button" onClick={() => setRascunho([...rascunho, d])} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-[var(--color-nav-hover)]" style={{ color: 'var(--color-text)' }}>
                    <Plus size={13} style={{ color: 'var(--color-primary)' }} /> {DIMENSOES[d].label}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="flex items-center gap-2 px-3 py-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <button type="button" onClick={() => setRascunho([])} className="flex-1 text-xs py-1.5 rounded-md border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>Tabela (sem agrupar)</button>
            <button type="button" onClick={() => setRascunho([...HIERARQUIA_COMPLETA])} className="flex-1 text-xs py-1.5 rounded-md border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>Hierarquia completa</button>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <button type="button" onClick={() => setOpen(false)} className="flex-1 text-xs py-1.5 rounded-md border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>Cancelar</button>
            <button type="button" onClick={aplicar} disabled={!alterado} className="flex-1 text-xs py-1.5 rounded-md font-medium text-white transition-all disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>Aplicar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Popover de filtro por coluna (valores distintos com busca) ──
function FiltroPopover({ x, y, valores, selecionados, onAplicar, onFechar }: {
  x: number; y: number; valores: string[]; selecionados: string[] | undefined;
  onAplicar: (sel: string[] | undefined) => void; onFechar: () => void;
}) {
  const [busca, setBusca] = useState('');
  // Rascunho local — só aplica ao clicar "Aplicar". undefined = todos (sem filtro).
  const [marcadosSet, setMarcadosSet] = useState<Set<string>>(new Set(selecionados ?? valores));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onFechar(); }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onFechar(); }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [onFechar]);
  const filtrados = busca.trim() ? valores.filter(v => v.toLowerCase().includes(busca.trim().toLowerCase())) : valores;
  function toggle(v: string) { setMarcadosSet(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; }); }
  function aplicar() { onAplicar(marcadosSet.size === valores.length ? undefined : [...marcadosSet]); onFechar(); }
  const left = Math.min(x, window.innerWidth - 272);
  const top = Math.min(y, window.innerHeight - 400);
  return (
    <div ref={ref} className="fixed z-50 rounded-xl border shadow-lg animate-scaleIn w-[260px] overflow-hidden" style={{ left, top, backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
      <div className="p-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2 px-2 h-9 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
          <Search size={14} style={{ color: 'var(--color-text-secondary)' }} />
          <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar valor..." className="w-full bg-transparent text-sm focus:outline-none" style={{ color: 'var(--color-text)' }} />
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b text-xs" style={{ borderColor: 'var(--color-border)' }}>
        <button type="button" onClick={() => setMarcadosSet(new Set(valores))} className="hover:underline" style={{ color: 'var(--color-primary)' }}>Todos</button>
        <span style={{ color: 'var(--color-border)' }}>|</span>
        <button type="button" onClick={() => setMarcadosSet(new Set())} className="hover:underline" style={{ color: 'var(--color-text-secondary)' }}>Nenhum</button>
      </div>
      <div className="max-h-56 overflow-y-auto py-1">
        {filtrados.map(v => {
          const on = marcadosSet.has(v);
          return (
            <button key={v} type="button" onClick={() => toggle(v)} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-[var(--color-nav-hover)]" style={{ color: 'var(--color-text)' }}>
              <span className="w-[16px] h-[16px] rounded border flex items-center justify-center shrink-0" style={{ borderColor: on ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: on ? 'var(--color-primary)' : 'transparent' }}>
                {on && <Check size={11} strokeWidth={3} color="#fff" />}
              </span>
              <span className="truncate">{v}</span>
            </button>
          );
        })}
        {filtrados.length === 0 && <div className="px-3 py-3 text-sm text-center" style={{ color: 'var(--color-text-secondary)' }}>Nenhum valor</div>}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <button type="button" onClick={onFechar} className="flex-1 text-xs py-1.5 rounded-md border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>Cancelar</button>
        <button type="button" onClick={aplicar} className="flex-1 text-xs py-1.5 rounded-md font-medium text-white transition-all" style={{ backgroundColor: 'var(--color-primary)' }}>Aplicar</button>
      </div>
    </div>
  );
}

const SEM_RESERVA: Set<number> = new Set();

interface Props {
  titulos: Titulo[]; loading: boolean; selected: Set<number>;
  reservas?: Set<number>; // títulos que a seleção acabou de colocar Em Análise
  onToggleSel: (nufins: number[], on: boolean) => void;   // ação do usuário: grava/remove a análise
  onSincronizarSel: (nufins: number[], on: boolean) => void; // só ajusta a marcação
  onVisiveis: (nufins: number[]) => void; // o que está na tela depois dos filtros
  onDesaprovar: (t: Titulo) => void; onVer: (t: Titulo) => void;
}
export default function ArvoreTitulos({ titulos, loading, selected, reservas = SEM_RESERVA, onToggleSel, onSincronizarSel, onVisiveis, onDesaprovar, onVer }: Props) {
  const inicial = useRef(carregarLayout());
  const [grupo, setGrupo] = useState<DimId[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<ColId>('vencimento');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [order, setOrder] = useState<ColId[]>(inicial.current.order);
  const [widths, setWidths] = useState<Record<string, number>>(inicial.current.widths);
  const [filtros, setFiltros] = useState<Partial<Record<ColId, string[]>>>({});
  const [filtroAberto, setFiltroAberto] = useState<{ col: ColId; x: number; y: number } | null>(null);

  // persiste ordem + larguras
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify({ order, widths })); } catch { /* ignora */ } }, [order, widths]);
  // ao mudar dados/agrupamento, recomeça colapsado
  useEffect(() => { setExpanded(new Set()); }, [titulos, grupo]);

  const larg = useCallback((id: ColId) => widths[id] ?? COLDEF[id].w, [widths]);
  const plano = grupo.length === 0;
  const cols = useMemo(() => order.filter(id => { const d = COLDEF[id].dim; return !d || !grupo.includes(d); }).map(id => COLDEF[id]), [order, grupo]);
  const template = useMemo(() => `${CHECK_W}px ${cols.map(c => `${larg(c.id)}px`).join(' ')} ${ACOES_W}px`, [cols, larg]);
  const leafIndent = indentDe(grupo);
  const minW = useMemo(() => CHECK_W + cols.reduce((sm, c) => sm + larg(c.id), 0) + ACOES_W + (cols.length + 1) * 8 + leafIndent + 16, [cols, larg, leafIndent]);

  // aplica filtros por coluna -> títulos visíveis
  const filtrosAtivos = useMemo(() => (Object.keys(filtros) as ColId[]).filter(k => filtros[k] !== undefined), [filtros]);
  const titulosVis = useMemo(() => {
    if (!filtrosAtivos.length) return titulos;
    return titulos.filter(t => filtrosAtivos.every(k => {
      // Só a Situação é dispensada, e só para quem a seleção acabou de reservar:
      // senão o título sumiria da tela no instante em que fosse marcado (a
      // Situação vira "Em Análise"). Os demais filtros continuam valendo — é o
      // que mantém a poda de seleção do que está escondido.
      if (k === 'situacao' && reservas.has(t.nufin)) return true;
      return (filtros[k] as string[]).includes(COLDEF[k].filtro!(t));
    }));
  }, [titulos, filtros, filtrosAtivos, reservas]);

  const { nodes, allIds } = useMemo(() => build(titulosVis, grupo), [titulosVis, grupo]);

  // Totalizadores do rodapé (soma sobre os títulos visíveis = respeita os filtros)
  const totais = useMemo(() => {
    const acc: Record<string, number> = {};
    const somaveis = cols.filter(c => c.soma);
    for (const c of somaveis) acc[c.id] = 0;
    for (const t of titulosVis) for (const c of somaveis) acc[c.id] += c.soma!(t);
    return acc;
  }, [cols, titulosVis]);
  const temTotais = cols.some(c => c.soma);
  const labelTotalId = cols.find(c => !c.soma)?.id;

  // A marcação espelha a análise: título visível que está Em Análise aparece
  // marcado, e o que saiu de vista sai da marcação — assim o "aprovar" nunca age
  // sobre algo que não está na tela. Isso NÃO mexe na análise em si (só o
  // usuário faz isso, marcando ou desmarcando); é ajuste de marcação apenas.
  const visSet = useMemo(() => new Set(titulosVis.map(t => t.nufin)), [titulosVis]);
  const selRef = useRef(selected); selRef.current = selected;
  useEffect(() => {
    const atual = selRef.current;
    const faltando = titulosVis.filter(t => t.statusweb === STATUSWEB.EM_ANALISE && !atual.has(t.nufin)).map(t => t.nufin);
    const sobrando = [...atual].filter(n => !visSet.has(n));
    if (faltando.length) onSincronizarSel(faltando, true);
    if (sobrando.length) onSincronizarSel(sobrando, false);
  }, [visSet, titulosVis, onSincronizarSel]);

  const toggleExp = useCallback((id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
  const handleSort = useCallback((c: ColId) => { setSortCol(prev => { if (prev === c) { setSortDir(d => (d === 1 ? -1 : 1)); return prev; } setSortDir(1); return c; }); }, []);

  const allNufins = useMemo(() => titulosVis.map(t => t.nufin), [titulosVis]);
  // O painel de ações precisa saber o que está visível: o "marcar todos" de lá
  // não pode gravar análise em título escondido por filtro.
  useEffect(() => { onVisiveis(allNufins); }, [allNufins, onVisiveis]);
  const selCount = useMemo(() => allNufins.filter(n => selected.has(n)).length, [allNufins, selected]);
  const masterState: 'on' | 'off' | 'part' = selCount === 0 ? 'off' : (selCount === allNufins.length ? 'on' : 'part');

  const titulosPlano = useMemo(() => {
    if (!plano) return titulosVis;
    const col = COLDEF[sortCol];
    return [...titulosVis].sort((a, b) => { const r = col.cmp(a, b); return (r !== 0 ? r : a.nufin - b.nufin) * sortDir; });
  }, [titulosVis, plano, sortCol, sortDir]);

  // ── Resize e reorder de colunas ──
  const resizing = useRef<{ id: ColId; startX: number; startW: number } | null>(null);
  const onResizeMove = useCallback((e: MouseEvent) => {
    const r = resizing.current; if (!r) return;
    setWidths(prev => ({ ...prev, [r.id]: Math.max(COL_MIN, r.startW + (e.clientX - r.startX)) }));
  }, []);
  const onResizeUp = useCallback(() => {
    resizing.current = null; document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onResizeMove); document.removeEventListener('mouseup', onResizeUp);
  }, [onResizeMove]);
  const onResizeDown = useCallback((e: React.MouseEvent, id: ColId) => {
    e.preventDefault(); e.stopPropagation();
    resizing.current = { id, startX: e.clientX, startW: larg(id) };
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onResizeMove); document.addEventListener('mouseup', onResizeUp);
  }, [larg, onResizeMove, onResizeUp]);

  const dragId = useRef<ColId | null>(null);
  const reordena = useCallback((alvo: ColId) => {
    const from = dragId.current; dragId.current = null;
    if (!from || from === alvo) return;
    setOrder(prev => { const o = prev.filter(x => x !== from); const idx = o.indexOf(alvo); o.splice(idx, 0, from); return [...o]; });
  }, []);

  const valoresFiltro = useMemo(() => {
    if (!filtroAberto) return [];
    const f = COLDEF[filtroAberto.col].filtro; if (!f) return [];
    const set = new Set<string>(); titulos.forEach(t => set.add(f(t)));
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [filtroAberto, titulos]);

  function abrirFiltro(e: React.MouseEvent, col: ColId) {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setFiltroAberto(prev => (prev?.col === col ? null : { col, x: r.left, y: r.bottom + 4 }));
  }

  return (
    <div className="rounded-xl border overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b gap-2" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2 text-sm font-medium min-w-0" style={{ color: 'var(--color-text)' }}>
          {titulosVis.length > 0 && (
            <label className="flex items-center gap-2 cursor-pointer select-none mr-1" title="Selecionar todos">
              <TriCheck state={masterState} onClick={() => onToggleSel(allNufins, masterState !== 'on')} />
              <span className="text-xs font-normal" style={{ color: 'var(--color-text-secondary)' }}>Todos</span>
            </label>
          )}
          <Rows3 size={16} className="shrink-0" style={{ color: 'var(--color-primary)' }} /> Títulos
          <span className="text-xs font-normal shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
            ({titulosVis.length}{filtrosAtivos.length ? ` de ${titulos.length}` : ''})
          </span>
          <div className="min-w-0"><AgruparControl grupo={grupo} onChange={setGrupo} /></div>
        </div>
        {!plano && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setExpanded(new Set(allIds))} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-[var(--color-nav-hover)]" style={{ color: 'var(--color-text-secondary)' }}><ChevronsUpDown size={13} /> Expandir</button>
            <button onClick={() => setExpanded(new Set())} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-[var(--color-nav-hover)]" style={{ color: 'var(--color-text-secondary)' }}><ChevronsDownUp size={13} /> Colapsar</button>
          </div>
        )}
      </div>

      {/* Chips de filtros ativos */}
      {filtrosAtivos.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-primary-bg)' }}>
          <span className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--color-primary)' }}><Filter size={12} /> Filtros:</span>
          {filtrosAtivos.map(k => (
            <span key={k} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', backgroundColor: 'var(--color-surface)' }}>
              {COLDEF[k].label} ({(filtros[k] as string[]).length})
              <button onClick={() => setFiltros(prev => { const n = { ...prev }; delete n[k]; return n; })} title="Remover filtro"><X size={12} /></button>
            </span>
          ))}
          <button onClick={() => setFiltros({})} className="text-xs underline" style={{ color: 'var(--color-text-secondary)' }}>Limpar filtros</button>
        </div>
      )}

      <div className="overflow-auto" style={{ maxHeight: '58vh' }} onScroll={() => filtroAberto && setFiltroAberto(null)}>
        {loading ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>Carregando títulos...</div>
        ) : titulos.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>Nenhum título encontrado para os filtros selecionados.</div>
        ) : (
          <div style={{ minWidth: minW }}>
            {/* Modo tabela: cabeçalho no topo (sticky), interativo — arrastar p/ reordenar,
                borda direita p/ redimensionar, funil p/ filtrar, clique p/ ordenar.
                Modo agrupado: o cabeçalho não fica no topo; ele aparece no nível final,
                logo antes das linhas de título (dentro do Node). */}
            {plano ? (
              <>
                <div className="grid items-center gap-x-2 py-2 pr-4 border-b sticky top-0 z-10"
                  style={{ gridTemplateColumns: template, paddingLeft: leafIndent, backgroundColor: 'var(--tree-leaf-bg)', borderColor: 'var(--tree-row-border)', color: 'var(--color-text-secondary)' }}>
                  <span />
                  {cols.map(c => {
                    const ativo = sortCol === c.id;
                    const temFiltro = filtros[c.id] !== undefined;
                    return (
                      <div key={c.id} className={`relative flex items-center gap-1 min-w-0 ${c.align === 'right' ? 'justify-end' : ''}`}
                        onDragOver={e => e.preventDefault()} onDrop={() => reordena(c.id)}>
                        <button type="button" draggable onDragStart={() => { dragId.current = c.id; }}
                          onClick={() => handleSort(c.id)} title="Arraste para reordenar"
                          className="flex items-center gap-1 min-w-0 cursor-pointer hover:text-[var(--color-primary)]"
                          style={{ color: ativo ? 'var(--color-primary)' : 'inherit' }}>
                          <span className="text-[11px] font-medium uppercase tracking-wide truncate">{c.label}</span>
                          {ativo && (sortDir === 1 ? <ArrowUp size={11} className="shrink-0" /> : <ArrowDown size={11} className="shrink-0" />)}
                        </button>
                        {c.filtro && (
                          <button type="button" onClick={e => abrirFiltro(e, c.id)} title="Filtrar coluna"
                            className="p-0.5 rounded shrink-0 hover:bg-[var(--color-nav-hover)]" style={{ color: temFiltro ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                            <Filter size={12} fill={temFiltro ? 'currentColor' : 'none'} />
                          </button>
                        )}
                        <div onMouseDown={e => onResizeDown(e, c.id)} className="absolute right-[-5px] top-0 bottom-0 w-2 cursor-col-resize" title="Arraste para redimensionar" />
                      </div>
                    );
                  })}
                  <span />
                </div>
                {titulosPlano.map(t => <LinhaTitulo key={t.nufin} t={t} cols={cols} template={template} indent={leafIndent} selected={selected} onToggleSel={onToggleSel} onDesaprovar={onDesaprovar} onVer={onVer} />)}
              </>
            ) : (
              nodes.map(n => <Node key={n.id} node={n} cols={cols} template={template} leafIndent={leafIndent} selected={selected} expanded={expanded} filtros={filtros} onAbrirFiltro={abrirFiltro} onToggleExp={toggleExp} onToggleSel={onToggleSel} onDesaprovar={onDesaprovar} onVer={onVer} />)
            )}

            {/* Rodapé totalizador — soma as colunas de valor sobre os títulos visíveis (respeita filtros) */}
            {temTotais && (
              <div className="grid items-center gap-x-2 py-2.5 pr-4 border-t sticky bottom-0 z-10"
                style={{ gridTemplateColumns: template, paddingLeft: leafIndent, backgroundColor: 'var(--tree-leaf-bg)', borderColor: 'var(--color-border)', boxShadow: '0 -1px 3px rgba(0,0,0,0.06)' }}>
                <span />
                {cols.map(c => {
                  if (c.soma) return <span key={c.id} className="text-[13px] font-semibold tabular-nums text-right" style={{ color: 'var(--color-text)' }}>{fmtMoeda(totais[c.id] || 0)}</span>;
                  if (c.id === labelTotalId) return <span key={c.id} className="text-[11px] font-semibold uppercase tracking-wide truncate" style={{ color: 'var(--color-text-secondary)' }}>Total ({titulosVis.length})</span>;
                  return <span key={c.id} />;
                })}
                <span />
              </div>
            )}
          </div>
        )}
      </div>

      {filtroAberto && (
        <FiltroPopover key={filtroAberto.col} x={filtroAberto.x} y={filtroAberto.y} valores={valoresFiltro} selecionados={filtros[filtroAberto.col]}
          onAplicar={(selv) => setFiltros(prev => { const n = { ...prev }; if (selv === undefined) delete n[filtroAberto.col]; else n[filtroAberto.col] = selv; return n; })}
          onFechar={() => setFiltroAberto(null)} />
      )}
    </div>
  );
}
