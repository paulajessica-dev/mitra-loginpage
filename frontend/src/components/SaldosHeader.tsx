import { useMemo, useState } from 'react';
import { Wallet, TrendingUp, Clock, CheckCircle2, PiggyBank, ChevronDown } from 'lucide-react';
import { fmtMoeda } from '../lib/sankhya';
import type { SaldoEmpresa, Vencidos } from '../lib/sankhya';

interface Props { saldos: SaldoEmpresa[]; vencidos: Vencidos; loading?: boolean; previstoAnalise?: number; }

function KpiCard({ icon: Icon, label, valor, cor, bg, destaque, negativo, hint, realce }: any) {
  return (
    <div className="rounded-lg border px-3 py-2 flex items-center gap-2.5 animate-fadeIn"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: realce ? cor : (destaque ? 'var(--color-primary)' : 'var(--color-border)'), boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
      <span className="rounded-full p-1.5 shrink-0" style={{ backgroundColor: bg }}><Icon size={14} style={{ color: cor }} /></span>
      <div className="flex flex-col min-w-0">
        <span className="text-[11px] font-medium leading-tight truncate" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
        <span className="text-sm font-semibold tabular-nums leading-tight"
          style={{ color: realce ? cor : (negativo ? 'var(--color-danger)' : (destaque ? 'var(--color-primary)' : 'var(--color-text)')) }}>
          {fmtMoeda(valor)}
        </span>
        {hint && <span className="text-[10px] leading-tight tabular-nums" style={{ color: cor }}>{hint}</span>}
      </div>
    </div>
  );
}

export default function SaldosHeader({ saldos, loading, previstoAnalise = 0 }: Props) {
  const [aberto, setAberto] = useState(false);
  const tot = useMemo(() => saldos.reduce((a, s) => ({
    inicial: a.inicial + s.saldoInicial, encaixe: a.encaixe + s.saldoEncaixe,
    analise: a.analise + s.totalAnalise, aprovado: a.aprovado + s.totalAprovado, disponivel: a.disponivel + s.disponivel,
  }), { inicial: 0, encaixe: 0, analise: 0, aprovado: 0, disponivel: 0 }), [saldos]);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
        <KpiCard icon={Wallet} label="Saldo Anterior" valor={tot.inicial} cor="var(--color-info)" bg="var(--kpi-bg-cyan)" negativo={tot.inicial < 0} />
        <KpiCard icon={TrendingUp} label="Encaixe" valor={tot.encaixe} cor="var(--color-success)" bg="var(--kpi-bg-green)" />
        <KpiCard icon={Clock} label="Em Análise" valor={tot.analise + previstoAnalise} cor="var(--color-warning)" bg="var(--kpi-bg-amber)"
          hint={previstoAnalise > 0 ? `+${fmtMoeda(previstoAnalise)} a analisar` : undefined} realce={previstoAnalise > 0} />
        <KpiCard icon={CheckCircle2} label="Aprovado" valor={tot.aprovado} cor="var(--color-success)" bg="var(--kpi-bg-green)" />
        <KpiCard icon={PiggyBank} label="Disponível" valor={tot.disponivel} cor="var(--color-primary)" bg="var(--kpi-bg-blue)" destaque negativo={tot.disponivel < 0} />
      </div>

      {saldos.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <button onClick={() => setAberto(a => !a)} className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            <span>Saldo por empresa ({saldos.length})</span>
            <ChevronDown size={16} className="transition-transform" style={{ color: 'var(--color-text-secondary)', transform: aberto ? 'rotate(180deg)' : 'none' }} />
          </button>
          {aberto && (
            <div className="overflow-x-auto border-t animate-fadeIn" style={{ borderColor: 'var(--color-border)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--color-text-secondary)' }} className="text-xs">
                    <th className="text-left font-medium px-4 py-2">Empresa</th>
                    <th className="text-right font-medium px-4 py-2">Anterior</th>
                    <th className="text-right font-medium px-4 py-2">Encaixe</th>
                    <th className="text-right font-medium px-4 py-2">Análise</th>
                    <th className="text-right font-medium px-4 py-2">Aprovado</th>
                    <th className="text-right font-medium px-4 py-2">Disponível</th>
                  </tr>
                </thead>
                <tbody>
                  {saldos.map(s => (
                    <tr key={s.codemp} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                      <td className="px-4 py-2 truncate max-w-[220px]" style={{ color: 'var(--color-text)' }}>{s.empresa}</td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: s.saldoInicial < 0 ? 'var(--color-danger)' : 'var(--color-text)' }}>{fmtMoeda(s.saldoInicial)}</td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--color-text)' }}>{fmtMoeda(s.saldoEncaixe)}</td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--color-warning)' }}>{fmtMoeda(s.totalAnalise)}</td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--color-success)' }}>{fmtMoeda(s.totalAprovado)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium" style={{ color: s.disponivel < 0 ? 'var(--color-danger)' : 'var(--color-primary)' }}>{fmtMoeda(s.disponivel)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {loading && <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Atualizando saldos...</div>}
    </div>
  );
}
