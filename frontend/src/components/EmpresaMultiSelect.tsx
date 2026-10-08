import { useState, useRef, useEffect, useMemo } from 'react';
import { Building2, ChevronDown, ChevronRight, Search, Check, Minus } from 'lucide-react';
import type { EmpresaOpcao } from '../lib/sankhya';

interface Props {
  empresas: EmpresaOpcao[];
  selecionadas: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}

interface Grupo { codmat: number; nomemat: string; filiais: EmpresaOpcao[]; }

// Caixa de seleção tri-state (grupo/matriz pode ficar parcialmente marcado)
function TriBox({ state }: { state: 'on' | 'off' | 'part' }) {
  return (
    <span className="w-[16px] h-[16px] rounded border flex items-center justify-center shrink-0"
      style={{ borderColor: state !== 'off' ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: state !== 'off' ? 'var(--color-primary)' : 'transparent' }}>
      {state === 'on' && <Check size={11} strokeWidth={3} color="#fff" />}
      {state === 'part' && <Minus size={11} strokeWidth={3} color="#fff" />}
    </span>
  );
}

export default function EmpresaMultiSelect({ empresas, selecionadas, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState('');
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    if (open) { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onEsc); }
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const sel = useMemo(() => new Set(selecionadas), [selecionadas]);

  // Agrupa empresas por matriz. Ordena grupos pela matriz (nome) e filiais por código.
  const grupos = useMemo<Grupo[]>(() => {
    const map = new Map<number, Grupo>();
    for (const e of empresas) {
      if (!map.has(e.codmat)) map.set(e.codmat, { codmat: e.codmat, nomemat: e.nomemat, filiais: [] });
      map.get(e.codmat)!.filiais.push(e);
    }
    const arr = [...map.values()];
    arr.forEach(g => g.filiais.sort((a, b) => a.codemp - b.codemp));
    arr.sort((a, b) => a.nomemat.localeCompare(b.nomemat, 'pt-BR') || a.codmat - b.codmat);
    return arr;
  }, [empresas]);

  // Filtro de busca: casa por nome/código da matriz ou de qualquer filial.
  const gruposFiltrados = useMemo<Grupo[]>(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return grupos;
    return grupos
      .map(g => {
        const matrizCasa = g.nomemat.toLowerCase().includes(q) || String(g.codmat).includes(q);
        const filiais = matrizCasa ? g.filiais : g.filiais.filter(e => e.nome.toLowerCase().includes(q) || String(e.codemp).includes(q));
        return { ...g, filiais };
      })
      .filter(g => g.filiais.length > 0);
  }, [grupos, busca]);

  function toggleExp(codmat: number) {
    setExpandidos(prev => { const n = new Set(prev); n.has(codmat) ? n.delete(codmat) : n.add(codmat); return n; });
  }
  function toggleEmpresa(id: number) {
    onChange(sel.has(id) ? selecionadas.filter(x => x !== id) : [...selecionadas, id]);
  }
  // Selecionar o grupo = considerar todas as filiais da matriz. Se já estão todas
  // marcadas, desmarca o grupo inteiro.
  function toggleGrupo(g: Grupo) {
    const ids = g.filiais.map(e => e.codemp);
    const todas = ids.every(id => sel.has(id));
    if (todas) onChange(selecionadas.filter(id => !ids.includes(id)));
    else { const n = new Set(selecionadas); ids.forEach(id => n.add(id)); onChange([...n]); }
  }
  function estadoGrupo(g: Grupo): 'on' | 'off' | 'part' {
    const marcadas = g.filiais.filter(e => sel.has(e.codemp)).length;
    if (marcadas === 0) return 'off';
    return marcadas === g.filiais.length ? 'on' : 'part';
  }

  const label = selecionadas.length === 0 ? 'Todas as empresas'
    : selecionadas.length === 1 ? (empresas.find(e => e.codemp === selecionadas[0])?.nome || '1 empresa')
    : `${selecionadas.length} empresas`;

  return (
    <div className="flex flex-col gap-1.5" ref={ref}>
      <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Empresa</label>
      <div className="relative">
        <button type="button" disabled={disabled} onClick={() => !disabled && setOpen(o => !o)}
          className="w-full h-10 px-3 text-sm rounded-lg border flex items-center justify-between gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2"
          style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)', ['--tw-ring-color' as any]: 'var(--color-primary-light)' }}>
          <span className="flex items-center gap-2 truncate"><Building2 size={15} style={{ color: 'var(--color-text-secondary)' }} /><span className="truncate">{label}</span></span>
          <ChevronDown size={15} style={{ color: 'var(--color-text-secondary)' }} />
        </button>

        {open && (
          <div className="absolute z-30 mt-1 rounded-xl border shadow-lg animate-scaleIn w-full min-w-[280px] overflow-hidden"
            style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            <div className="p-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2 px-2 h-9 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
                <Search size={14} style={{ color: 'var(--color-text-secondary)' }} />
                <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar empresa ou matriz..."
                  className="w-full bg-transparent text-sm focus:outline-none" style={{ color: 'var(--color-text)' }} />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              <button type="button" onClick={() => onChange([])} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--color-nav-hover)]" style={{ color: 'var(--color-text)' }}>
                <TriBox state={selecionadas.length === 0 ? 'on' : 'off'} />
                Todas as empresas
              </button>

              {gruposFiltrados.map(g => {
                const est = estadoGrupo(g);
                // Grupo com só uma empresa (matriz sem filiais) = linha simples, sem expandir.
                const soUma = g.filiais.length === 1;
                const aberto = expandidos.has(g.codmat) || !!busca.trim();
                return (
                  <div key={g.codmat}>
                    <div className="w-full flex items-center gap-1.5 pr-3 hover:bg-[var(--color-nav-hover)]">
                      {soUma ? <span className="w-[22px] shrink-0" /> : (
                        <button type="button" onClick={() => toggleExp(g.codmat)} className="pl-2 py-2 shrink-0" title={aberto ? 'Recolher' : 'Expandir'}>
                          <ChevronRight size={15} className="transition-transform" style={{ color: 'var(--color-text-secondary)', transform: aberto ? 'rotate(90deg)' : 'none' }} />
                        </button>
                      )}
                      <button type="button" onClick={() => (soUma ? toggleEmpresa(g.filiais[0].codemp) : toggleGrupo(g))}
                        className="flex-1 min-w-0 flex items-center gap-2 py-2 text-sm text-left" style={{ color: 'var(--color-text)' }}>
                        <TriBox state={est} />
                        <span className="truncate font-medium">{g.nomemat}</span>
                        {!soUma && <span className="text-xs shrink-0" style={{ color: 'var(--color-text-secondary)' }}>({g.filiais.length})</span>}
                        {soUma && <span className="text-xs shrink-0" style={{ color: 'var(--color-text-secondary)' }}>#{g.filiais[0].codemp}</span>}
                      </button>
                    </div>
                    {!soUma && aberto && g.filiais.map(e => {
                      const on = sel.has(e.codemp);
                      return (
                        <button key={e.codemp} type="button" onClick={() => toggleEmpresa(e.codemp)}
                          className="w-full flex items-center gap-2 pl-9 pr-3 py-1.5 text-sm text-left hover:bg-[var(--color-nav-hover)]" style={{ color: 'var(--color-text)' }}>
                          <TriBox state={on ? 'on' : 'off'} />
                          <span className="truncate">{e.nome} <span style={{ color: 'var(--color-text-secondary)' }}>#{e.codemp}</span></span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {gruposFiltrados.length === 0 && <div className="px-3 py-3 text-sm text-center" style={{ color: 'var(--color-text-secondary)' }}>Nenhuma empresa</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
