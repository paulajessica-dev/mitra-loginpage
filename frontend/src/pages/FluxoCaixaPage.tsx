import { useState, useCallback, useMemo, type ReactNode } from 'react';
import { Search, CalendarRange, TrendingUp, ArrowDownCircle, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import Layout, { type View } from '../components/Layout';
import DatePicker from '../components/DatePicker';
import { ToastContainer } from '../components/ui/Toast';
import { useToast } from '../hooks/useToast';
import { fluxoCaixa } from '../lib/sankhya';
import type { FluxoCaixaResult, FluxoDiaVals, FluxoEmpresa } from '../lib/sankhya';

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function rotuloDia(iso: string): { dia: string; sem: string } {
  const d = new Date(iso + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return { dia: `${dd}/${mm}`, sem: SEMANA[d.getDay()] };
}
function fmt(v: number): string {
  return (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const zero: FluxoDiaVals = { sini: 0, enc: 0, ana: 0, apr: 0, disp: 0 };

function Cel({ v, forte, negOk }: { v: number; forte?: boolean; negOk?: boolean }) {
  const neg = v < 0;
  return (
    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap border-b"
      style={{ borderColor: 'var(--color-border)', color: neg && negOk ? 'var(--color-danger)' : 'var(--color-text)', fontWeight: forte ? 600 : 400 }}>
      {fmt(v)}
    </td>
  );
}

const primeiraCol = 'sticky left-0 z-10 px-3 py-1.5 text-left whitespace-nowrap border-b';

export default function FluxoCaixaPage({ onLogout, onNavigate }: { onLogout: () => void; onNavigate: (v: View) => void }) {
  const { toasts, addToast, removeToast } = useToast();
  const [di, setDi] = useState('');
  const [df, setDf] = useState('');
  const [loading, setLoading] = useState(false);
  const [fluxo, setFluxo] = useState<FluxoCaixaResult | null>(null);
  const [colapsados, setColapsados] = useState<Set<number>>(new Set());

  const pesquisar = useCallback(async () => {
    if (!di || !df) { addToast('info', 'Selecione a data inicial e a data final para montar o fluxo.'); return; }
    if (di > df) { addToast('error', 'A data inicial não pode ser maior que a data final.'); return; }
    setLoading(true);
    try {
      const r = await fluxoCaixa(di, df);
      setFluxo(r);
      if (!r.dias?.length) addToast('info', 'Nenhum dado de fluxo para o período selecionado.');
    } catch (e: any) { addToast('error', e?.message || 'Erro ao montar o fluxo de caixa.'); }
    finally { setLoading(false); }
  }, [di, df, addToast]);

  const dias = fluxo?.dias || [];
  const totais = fluxo?.totais || {};
  const empresas = useMemo(() => fluxo?.empresas || [], [fluxo]);
  const tot = (d: string): FluxoDiaVals => totais[d] || zero;
  const val = (e: FluxoEmpresa, d: string): FluxoDiaVals => e.dias[d] || zero;

  // Agrupamento por matriz (CODEMPMATRIZ) — grupo societário
  const grupos = useMemo(() => {
    const m = new Map<number, { codmat: number; nome: string; empresas: FluxoEmpresa[] }>();
    for (const e of empresas) {
      if (!m.has(e.codmat)) m.set(e.codmat, { codmat: e.codmat, nome: (e.nomemat || e.nome).trim(), empresas: [] });
      m.get(e.codmat)!.empresas.push(e);
    }
    return [...m.values()].sort((a, b) => a.codmat - b.codmat);
  }, [empresas]);

  const toggleGrupo = useCallback((codmat: number) => {
    setColapsados(prev => { const n = new Set(prev); n.has(codmat) ? n.delete(codmat) : n.add(codmat); return n; });
  }, []);

  const primeiraColBg = { backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' };

  function LinhaSecao({ titulo, icon }: { titulo: string; icon?: ReactNode }) {
    return (
      <tr>
        <td className={primeiraCol} style={{ ...primeiraColBg, backgroundColor: 'var(--color-nav-hover)' }}>
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>{icon}{titulo}</span>
        </td>
        {dias.map(d => <td key={d} className="border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-nav-hover)' }} />)}
      </tr>
    );
  }

  // Renderiza, por grupo (matriz): cabeçalho clicável com subtotal + empresas (quando expandido)
  function linhasAgrupadas(campo: keyof FluxoDiaVals, negOk: boolean, secao: string): ReactNode[] {
    const out: ReactNode[] = [];
    grupos.forEach(g => {
      const aberto = !colapsados.has(g.codmat);
      // Cabeçalho do grupo (matriz) — clicável, mostra o subtotal
      out.push(
        <tr key={secao + '-h' + g.codmat} className="cursor-pointer hover:bg-[var(--color-nav-hover)]" onClick={() => toggleGrupo(g.codmat)}>
          <td className={primeiraCol} style={{ ...primeiraColBg }}>
            <span className="flex items-center gap-1 font-semibold" style={{ color: 'var(--color-text)' }}>
              <ChevronRight size={14} className="shrink-0" style={{ color: 'var(--color-text-secondary)', transform: aberto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
              {g.nome}
              <span className="text-[11px] font-normal" style={{ color: 'var(--color-text-secondary)' }}>({g.empresas.length})</span>
            </span>
          </td>
          {dias.map(d => <Cel key={d} v={g.empresas.reduce((s, e) => s + (val(e, d)[campo] || 0), 0)} forte negOk={negOk} />)}
        </tr>
      );
      // Empresas do grupo (só quando expandido)
      if (aberto) {
        g.empresas.forEach(e => {
          out.push(
            <tr key={secao + '-e' + e.codemp} className="hover:bg-[var(--color-nav-hover)]">
              <td className={primeiraCol} style={{ ...primeiraColBg }}>
                <span className="pl-7 block" style={{ color: 'var(--color-text-secondary)' }}>{e.nome.trim()}</span>
              </td>
              {dias.map(d => <Cel key={d} v={val(e, d)[campo]} negOk={negOk} />)}
            </tr>
          );
        });
      }
    });
    return out;
  }

  return (
    <Layout active="fluxo" onNavigate={onNavigate} onLogout={onLogout} title="Fluxo de Caixa">
      <main className="w-full max-w-full mx-auto px-4 py-5 flex flex-col gap-4">
        {/* Filtro obrigatório de período */}
        <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            <CalendarRange size={16} style={{ color: 'var(--color-primary)' }} /> Período do fluxo
            <span className="text-xs font-normal" style={{ color: 'var(--color-text-secondary)' }}>(obrigatório — o fluxo só é montado ao pesquisar)</span>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40"><DatePicker label="De" value={di} onChange={setDi} /></div>
            <div className="w-40"><DatePicker label="Até" value={df} onChange={setDf} /></div>
            <button onClick={pesquisar} disabled={loading || !di || !df}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white transition-all"
              style={{ backgroundColor: (!di || !df) ? 'var(--color-text-secondary)' : 'var(--color-primary)', opacity: loading ? 0.7 : 1, cursor: (!di || !df) ? 'not-allowed' : 'pointer' }}>
              <Search size={16} /> {loading ? 'Montando...' : 'Pesquisar'}
            </button>
          </div>
        </div>

        {/* Resultado */}
        {!fluxo ? (
          <div className="rounded-xl border py-24 text-center" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            <CalendarRange size={32} className="mx-auto mb-3" style={{ color: 'var(--color-text-secondary)' }} />
            <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Selecione o período e clique em <strong>Pesquisar</strong> para montar o fluxo de caixa.</div>
          </div>
        ) : loading ? (
          <div className="py-24 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>Montando fluxo de caixa...</div>
        ) : dias.length === 0 ? (
          <div className="rounded-xl border py-24 text-center text-sm" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
            Nenhum dado de fluxo para o período selecionado.
          </div>
        ) : (
          <>
          <div className="flex items-center justify-end gap-1">
            <button onClick={() => setColapsados(new Set())} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-[var(--color-nav-hover)]" style={{ color: 'var(--color-text-secondary)' }}><ChevronsUpDown size={13} /> Expandir tudo</button>
            <button onClick={() => setColapsados(new Set(grupos.map(g => g.codmat)))} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-[var(--color-nav-hover)]" style={{ color: 'var(--color-text-secondary)' }}><ChevronsDownUp size={13} /> Recolher tudo</button>
          </div>
          <div className="rounded-xl border overflow-auto" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', maxHeight: '70vh' }}>
            <table className="text-sm border-collapse">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className={primeiraCol + ' z-30'} style={{ ...primeiraColBg, backgroundColor: 'var(--color-nav)', color: 'var(--color-text)' }}>Fluxo de Caixa</th>
                  {dias.map(d => {
                    const r = rotuloDia(d);
                    return (
                      <th key={d} className="px-3 py-1.5 text-right whitespace-nowrap border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-nav)' }}>
                        <div className="font-semibold" style={{ color: 'var(--color-text)' }}>{r.dia}</div>
                        <div className="text-[10px] font-normal" style={{ color: 'var(--color-text-secondary)' }}>{r.sem}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {/* SALDO ANTERIOR */}
                <tr>
                  <td className={primeiraCol} style={{ ...primeiraColBg }}>
                    <span className="font-semibold" style={{ color: 'var(--color-text)' }}>Saldo Anterior</span>
                  </td>
                  {dias.map(d => <Cel key={d} v={tot(d).sini} forte negOk />)}
                </tr>

                {/* ENCAIXES (agrupado por matriz) */}
                <LinhaSecao titulo="Encaixes" icon={<TrendingUp size={12} />} />
                {linhasAgrupadas('enc', false, 'enc')}
                <tr>
                  <td className={primeiraCol} style={{ ...primeiraColBg }}>
                    <span className="font-semibold" style={{ color: 'var(--color-success)' }}>Total de Encaixes</span>
                  </td>
                  {dias.map(d => <Cel key={d} v={tot(d).enc} forte />)}
                </tr>

                {/* MOVIMENTACAO (Portal) */}
                <LinhaSecao titulo="Movimentação (Portal)" icon={<ArrowDownCircle size={12} />} />
                <tr className="hover:bg-[var(--color-nav-hover)]">
                  <td className={primeiraCol} style={{ ...primeiraColBg }}><span style={{ color: 'var(--color-warning)' }}>Em Análise</span></td>
                  {dias.map(d => <Cel key={d} v={tot(d).ana} />)}
                </tr>
                <tr className="hover:bg-[var(--color-nav-hover)]">
                  <td className={primeiraCol} style={{ ...primeiraColBg }}><span style={{ color: 'var(--color-primary)' }}>Aprovado</span></td>
                  {dias.map(d => <Cel key={d} v={tot(d).apr} />)}
                </tr>

                {/* SALDO PROJETADO POR EMPRESA (agrupado por matriz) */}
                <LinhaSecao titulo="Saldo projetado por grupo / empresa" />
                {linhasAgrupadas('disp', true, 'disp')}

                {/* SALDO TOTAL PROJETADO */}
                <tr>
                  <td className={primeiraCol} style={{ ...primeiraColBg, backgroundColor: 'var(--color-primary-bg)' }}>
                    <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>Saldo Total Projetado</span>
                  </td>
                  {dias.map(d => (
                    <td key={d} className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap border-b font-semibold"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-primary-bg)', color: tot(d).disp < 0 ? 'var(--color-danger)' : 'var(--color-primary)' }}>
                      {fmt(tot(d).disp)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          </>
        )}

        {fluxo && dias.length > 0 && (
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Agrupado por <strong>matriz (grupo societário)</strong>. <strong>Saldo Anterior</strong> e <strong>Encaixes</strong> vêm do saldo diário (AD_SALDOS); <strong>Em Análise</strong> e <strong>Aprovado</strong>, do portal.
            <strong> Saldo Projetado</strong> = Saldo Anterior + Encaixes − (Aprovado + Em Análise). O saldo do <strong>dia de hoje</strong> ainda pode variar com receitas entrando ao longo do dia; o de dias anteriores já está fechado.
          </p>
        )}
      </main>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </Layout>
  );
}
