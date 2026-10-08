import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { RefreshCw, Clock, Search, CheckCircle2, Wallet, X, ExternalLink } from 'lucide-react';
import Layout, { type View } from '../components/Layout';
import Modal from '../components/ui/Modal';
import { ChartContainer, ShadcnBarChart, ShadcnPieChart, ShadcnDataTable, FORMATTERS } from '../components/ui/Chart';
import { ToastContainer } from '../components/ui/Toast';
import { useToast } from '../hooks/useToast';
import { listarTitulos, saldosDia, fmtMoeda, fmtVencimento, STATUSWEB } from '../lib/sankhya';
import type { Titulo, SaldoEmpresa } from '../lib/sankhya';

function hojeISO() { return new Date().toISOString().slice(0, 10); }
function hojeBR() { const d = new Date(); return d.toLocaleDateString('pt-BR'); }

// ── Dimensões do cross-filter ──
type Dim = 'empresa' | 'grupo' | 'parceiro' | 'statusweb';
interface Filtro { empresa?: string; grupo?: string; parceiro?: string; statusweb?: number }

const gEmpresa = (t: Titulo) => t.empresa || `Empresa ${t.codemp}`;
const gGrupo = (t: Titulo) => t.grupoNatureza || '(Sem grupo)';
const gParceiro = (t: Titulo) => t.parceiro || `Parceiro ${t.codparc}`;

function statusLabel(sw: number): string {
  if (sw === STATUSWEB.APROVADO) return 'Aprovado';
  if (sw === STATUSWEB.EM_ANALISE) return 'Em Análise';
  return 'Pendente';
}
function statusStyle(sw: number) {
  if (sw === STATUSWEB.APROVADO) return { backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)' };
  if (sw === STATUSWEB.EM_ANALISE) return { backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' };
  return { backgroundColor: 'var(--color-nav-hover)', color: 'var(--color-text-secondary)' };
}

// filtra os títulos aplicando todos os filtros ativos, exceto a dimensão informada
function aplica(titulos: Titulo[], f: Filtro, exceto: Dim | null): Titulo[] {
  return titulos.filter(t =>
    (exceto === 'empresa' || !f.empresa || gEmpresa(t) === f.empresa) &&
    (exceto === 'grupo' || !f.grupo || gGrupo(t) === f.grupo) &&
    (exceto === 'parceiro' || !f.parceiro || gParceiro(t) === f.parceiro) &&
    (exceto === 'statusweb' || f.statusweb == null || t.statusweb === f.statusweb)
  );
}

function agrupar(titulos: Titulo[], keyFn: (t: Titulo) => string): { name: string; value: number; count: number }[] {
  const m = new Map<string, { value: number; count: number }>();
  for (const t of titulos) {
    const k = keyFn(t);
    const cur = m.get(k) || { value: 0, count: 0 };
    cur.value += t.valor || 0; cur.count += 1;
    m.set(k, cur);
  }
  return [...m.entries()].map(([name, v]) => ({ name, value: v.value, count: v.count })).sort((a, b) => b.value - a.value);
}

function KPICard({ icon, iconBg, iconColor, label, valor, sub, active, onClick }: {
  icon: ReactNode; iconBg: string; iconColor: string; label: string; valor: string; sub?: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border shadow-sm p-4 flex items-center gap-3 text-left transition-all"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: active ? 'var(--color-primary)' : 'var(--color-border)', cursor: onClick ? 'pointer' : 'default' }}
    >
      <span className="rounded-full p-2.5 shrink-0" style={{ backgroundColor: iconBg, color: iconColor }}>{icon}</span>
      <div className="min-w-0">
        <div className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</div>
        <div className="text-lg font-semibold tabular-nums truncate" style={{ color: 'var(--color-text)' }}>{valor}</div>
        {sub && <div className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{sub}</div>}
      </div>
    </button>
  );
}

export default function DashboardPage({ onLogout, onNavigate }: { onLogout: () => void; onNavigate: (v: View) => void }) {
  const { toasts, addToast, removeToast } = useToast();
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [saldos, setSaldos] = useState<SaldoEmpresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>({});
  const [detalhe, setDetalhe] = useState<Titulo | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [t, s] = await Promise.all([
        listarTitulos({ dataInicial: hojeISO(), dataFinal: hojeISO() }),
        saldosDia(),
      ]);
      setTitulos(t); setSaldos(s);
    } catch (e: any) { addToast('error', e?.message || 'Erro ao carregar o dashboard.'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { carregar(); }, [carregar]);

  const toggle = useCallback((dim: Dim, value: string | number) => {
    setFiltro(prev => ({ ...prev, [dim]: prev[dim] === value ? undefined : value }));
  }, []);

  // ── KPIs (respeitam empresa/grupo/parceiro, mas mostram todos os status) ──
  const baseStatus = useMemo(() => aplica(titulos, filtro, 'statusweb'), [titulos, filtro]);
  const porStatus = useMemo(() => {
    const sel = (sw: number) => baseStatus.filter(t => t.statusweb === sw);
    const somar = (a: Titulo[]) => a.reduce((s, t) => s + (t.valor || 0), 0);
    const p = sel(STATUSWEB.PENDENTE), a = sel(STATUSWEB.EM_ANALISE), ap = sel(STATUSWEB.APROVADO);
    return {
      pend: { qtd: p.length, val: somar(p) },
      analise: { qtd: a.length, val: somar(a) },
      aprov: { qtd: ap.length, val: somar(ap) },
    };
  }, [baseStatus]);

  const disponivel = useMemo(() => {
    if (filtro.empresa) return saldos.find(s => s.empresa === filtro.empresa)?.disponivel ?? 0;
    return saldos.reduce((s, x) => s + (x.disponivel || 0), 0);
  }, [saldos, filtro.empresa]);

  // ── Dados dos gráficos ──
  const statusData = useMemo(() => {
    const b = aplica(titulos, filtro, 'statusweb');
    const somar = (sw: number) => b.filter(t => t.statusweb === sw).reduce((s, t) => s + (t.valor || 0), 0);
    return [
      { name: 'Pendente', value: somar(STATUSWEB.PENDENTE), sw: STATUSWEB.PENDENTE },
      { name: 'Em Análise', value: somar(STATUSWEB.EM_ANALISE), sw: STATUSWEB.EM_ANALISE },
      { name: 'Aprovado', value: somar(STATUSWEB.APROVADO), sw: STATUSWEB.APROVADO },
    ];
  }, [titulos, filtro]);
  const statusActive = filtro.statusweb != null ? statusData.findIndex(d => d.sw === filtro.statusweb) : undefined;

  const empresaData = useMemo(() => agrupar(aplica(titulos, filtro, 'empresa'), gEmpresa).slice(0, 8), [titulos, filtro]);
  const empresaActive = filtro.empresa ? empresaData.findIndex(d => d.name === filtro.empresa) : undefined;

  const grupoData = useMemo(() => agrupar(aplica(titulos, filtro, 'grupo'), gGrupo).slice(0, 8), [titulos, filtro]);
  const grupoActive = filtro.grupo ? grupoData.findIndex(d => d.name === filtro.grupo) : undefined;

  const parceiroData = useMemo(() => agrupar(aplica(titulos, filtro, 'parceiro'), gParceiro).slice(0, 8), [titulos, filtro]);
  const parceiroActive = filtro.parceiro ? parceiroData.findIndex(d => d.name === filtro.parceiro) : undefined;

  const maiores = useMemo(() => aplica(titulos, filtro, null).slice().sort((a, b) => (b.valor || 0) - (a.valor || 0)).slice(0, 12), [titulos, filtro]);

  // ── Chips de filtros ativos ──
  const chips: { label: string; dim: Dim }[] = [];
  if (filtro.empresa) chips.push({ label: `Empresa: ${filtro.empresa}`, dim: 'empresa' });
  if (filtro.grupo) chips.push({ label: `Grupo: ${filtro.grupo}`, dim: 'grupo' });
  if (filtro.parceiro) chips.push({ label: `Fornecedor: ${filtro.parceiro}`, dim: 'parceiro' });
  if (filtro.statusweb != null) chips.push({ label: `Situação: ${statusLabel(filtro.statusweb)}`, dim: 'statusweb' });

  const totalDia = useMemo(() => aplica(titulos, filtro, null).reduce((s, t) => s + (t.valor || 0), 0), [titulos, filtro]);
  const qtdDia = aplica(titulos, filtro, null).length;

  return (
    <Layout
      active="dashboard" onNavigate={onNavigate} onLogout={onLogout} title="Dashboard"
      headerActions={
        <button onClick={carregar} title="Atualizar" className="p-2 rounded-lg hover:bg-[var(--color-nav-hover)]">
          <RefreshCw size={16} style={{ color: 'var(--color-text-secondary)' }} />
        </button>
      }
    >
      <main className="w-full max-w-7xl mx-auto px-4 py-5 flex flex-col gap-4">
        {/* Cabeçalho do dia */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Análise do dia</div>
            <div className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{hojeBR()}</div>
          </div>
          <div className="text-right">
            <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Total do dia {chips.length > 0 ? '(filtrado)' : ''}</div>
            <div className="text-lg font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>{fmtMoeda(totalDia)} <span className="text-sm font-normal" style={{ color: 'var(--color-text-secondary)' }}>· {qtdDia} título(s)</span></div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard icon={<Clock size={18} />} iconBg="var(--kpi-bg-amber)" iconColor="var(--color-warning)"
            label="Pendente" valor={fmtMoeda(porStatus.pend.val)} sub={`${porStatus.pend.qtd} título(s)`}
            active={filtro.statusweb === STATUSWEB.PENDENTE} onClick={() => toggle('statusweb', STATUSWEB.PENDENTE)} />
          <KPICard icon={<Search size={18} />} iconBg="var(--kpi-bg-blue)" iconColor="var(--color-primary)"
            label="Em Análise" valor={fmtMoeda(porStatus.analise.val)} sub={`${porStatus.analise.qtd} título(s)`}
            active={filtro.statusweb === STATUSWEB.EM_ANALISE} onClick={() => toggle('statusweb', STATUSWEB.EM_ANALISE)} />
          <KPICard icon={<CheckCircle2 size={18} />} iconBg="var(--kpi-bg-green)" iconColor="var(--color-success)"
            label="Aprovado" valor={fmtMoeda(porStatus.aprov.val)} sub={`${porStatus.aprov.qtd} título(s)`}
            active={filtro.statusweb === STATUSWEB.APROVADO} onClick={() => toggle('statusweb', STATUSWEB.APROVADO)} />
          <KPICard icon={<Wallet size={18} />} iconBg="var(--kpi-bg-cyan)" iconColor="var(--color-info)"
            label={filtro.empresa ? 'Disponível (empresa)' : 'Disponível consolidado'} valor={fmtMoeda(disponivel)} />
        </div>

        {/* Chips de filtros ativos */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Filtros:</span>
            {chips.map(c => (
              <button key={c.dim} onClick={() => setFiltro(prev => ({ ...prev, [c.dim]: undefined }))}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border"
                style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}>
                <span className="max-w-[220px] truncate">{c.label}</span> <X size={12} />
              </button>
            ))}
            <button onClick={() => setFiltro({})} className="text-xs underline" style={{ color: 'var(--color-text-secondary)' }}>Limpar tudo</button>
          </div>
        )}

        {loading ? (
          <div className="py-24 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>Carregando dashboard...</div>
        ) : titulos.length === 0 ? (
          <div className="rounded-xl border py-24 text-center text-sm" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
            Nenhum título com vencimento hoje ({hojeBR()}).
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartContainer title="Situação de aprovação" subtitle="Clique para filtrar todo o painel">
                <ShadcnBarChart data={statusData} xKey="name" bars={[{ dataKey: 'value', name: 'Valor' }]}
                  formatter={FORMATTERS.brl} activeIndex={statusActive}
                  onBarClick={(item) => toggle('statusweb', item.sw)} />
              </ChartContainer>

              <ChartContainer title="Por grupo de natureza" subtitle="Distribuição do valor por categoria de despesa">
                <ShadcnPieChart data={grupoData} formatter={FORMATTERS.brl} activeIndex={grupoActive} showLabel
                  onSliceClick={(item) => toggle('grupo', item.name)} />
              </ChartContainer>

              <ChartContainer title="Por empresa" subtitle="Onde o valor do dia está concentrado">
                <ShadcnBarChart data={empresaData} xKey="name" layout="vertical" bars={[{ dataKey: 'value', name: 'Valor' }]}
                  formatter={FORMATTERS.brl} activeIndex={empresaActive}
                  onBarClick={(item) => toggle('empresa', item.name)} />
              </ChartContainer>

              <ChartContainer title="Por fornecedor" subtitle="Maiores parceiros por valor no dia">
                <ShadcnBarChart data={parceiroData} xKey="name" layout="vertical" bars={[{ dataKey: 'value', name: 'Valor' }]}
                  formatter={FORMATTERS.brl} activeIndex={parceiroActive}
                  onBarClick={(item) => toggle('parceiro', item.name)} />
              </ChartContainer>
            </div>

            <ChartContainer title="Maiores títulos" subtitle="Clique em uma linha para ver os detalhes"
              action={
                <button onClick={() => onNavigate('portal')} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
                  Ir para aprovação <ExternalLink size={13} />
                </button>
              }
            >
              <ShadcnDataTable
                data={maiores}
                onRowClick={(item) => setDetalhe(item as Titulo)}
                columns={[
                  { key: 'nufin', label: 'Título' },
                  { key: 'empresa', label: 'Empresa', formatter: (v: any) => v || '—' },
                  { key: 'parceiro', label: 'Fornecedor', formatter: (v: any) => v || '—' },
                  { key: 'statusweb', label: 'Situação', formatter: (v: any) => statusLabel(v) },
                  { key: 'valor', label: 'Valor', align: 'right', formatter: (v: any) => fmtMoeda(v) },
                ]}
              />
            </ChartContainer>
          </>
        )}
      </main>

      <Modal isOpen={!!detalhe} onClose={() => setDetalhe(null)} title="Detalhe do Título" size="lg">
        {detalhe && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              {[
                ['NUFIN', String(detalhe.nufin)],
                ['Status Financeiro', detalhe.status || '—'],
                ['Empresa', detalhe.empresa || `Empresa ${detalhe.codemp}`],
                ['Parceiro', detalhe.parceiro || `Parceiro ${detalhe.codparc}`],
                ['Natureza', detalhe.natureza || '—'],
                ['Grupo de Natureza', detalhe.grupoNatureza || '—'],
                ['Número da Nota', detalhe.numnota != null ? String(detalhe.numnota) : '—'],
                ['Data de Vencimento', fmtVencimento(detalhe.vencimento)],
                ['Tipo de Título', detalhe.tipotitulo || '—'],
              ].map(([label, valor]) => (
                <div key={label} className="flex flex-col gap-1 min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
                  <span className="text-sm break-words" style={{ color: 'var(--color-text)' }}>{valor}</span>
                </div>
              ))}
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Situação Web</span>
                <span><span className="px-2 py-0.5 text-[11px] font-medium rounded-full" style={statusStyle(detalhe.statusweb)}>{statusLabel(detalhe.statusweb)}</span></span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Valor</span>
                <span className="text-base font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>{fmtMoeda(detalhe.valor)}</span>
              </div>
              {detalhe.historico && (
                <div className="flex flex-col gap-1 min-w-0 sm:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Histórico</span>
                  <span className="text-sm break-words" style={{ color: 'var(--color-text)' }}>{detalhe.historico}</span>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setDetalhe(null)} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>Fechar</button>
            </div>
          </div>
        )}
      </Modal>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </Layout>
  );
}
