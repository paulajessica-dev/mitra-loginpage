import { useState, useMemo, useEffect } from 'react';
import {
  Receipt, ChevronUp, ChevronDown, CheckSquare, Square,
  CheckCircle2, MinusCircle, AlertTriangle, ChevronRight, Undo2,
} from 'lucide-react';
import { fmtMoeda, fmtVencimento, STATUSWEB } from '../lib/sankhya';
import type { Titulo, Vencidos } from '../lib/sankhya';
import Modal from './ui/Modal';

interface Props {
  selecionados: Titulo[];
  vencidos: Vencidos;
  enviando: boolean;
  temTitulos: boolean;
  todosMarcados: boolean;
  onMarcarTodos: () => void;
  // Pendente -> Em Análise não tem botão: acontece ao selecionar o título.
  onAprovarAnalise: () => void;   // Em Análise -> Aprovado
  onRemoverAnalise: () => void;   // remove a Análise de todos (volta a Pendente)
  onRemoverAprovacao: () => void; // remove a Aprovação de todos (volta a Análise/Pendente)
  onDesaprovarTitulo: (t: Titulo) => void; // cancela um título (usa statusweb atual)
}

type Cat = 'pendente' | 'analise' | 'aprovado';

function Btn({ onClick, disabled, icon: Icon, children, variant, small }: any) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex items-center justify-center gap-1.5 rounded-lg font-medium border transition-all disabled:opacity-50 ${small ? 'px-2.5 py-1.5 text-[11px]' : 'flex-1 min-w-[130px] px-3 py-2 text-xs'}`}
      style={{
        backgroundColor: isPrimary ? 'var(--color-primary)' : 'var(--color-surface)',
        color: isPrimary ? '#fff' : (isDanger ? 'var(--color-danger)' : 'var(--color-text)'),
        borderColor: isPrimary ? 'var(--color-primary)' : (isDanger ? 'var(--color-danger)' : 'var(--color-border)'),
      }}>
      <Icon size={small ? 13 : 14} /> {children}
    </button>
  );
}

// Linha-resumo clicável de uma categoria (abre o modal de detalhamento)
function SecaoResumo({ badge, cor, bg, qtd, total, onClick }: any) {
  return (
    <button onClick={onClick}
      className="w-full rounded-lg border p-2.5 flex items-center justify-between gap-2 text-left transition-all hover:brightness-[0.98]"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
      <span className="flex items-center gap-2 min-w-0">
        <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full whitespace-nowrap" style={{ backgroundColor: bg, color: cor }}>{badge}</span>
        <span className="text-xs tabular-nums truncate" style={{ color: 'var(--color-text-secondary)' }}>{qtd} título(s) · <span className="font-medium" style={{ color: 'var(--color-text)' }}>{fmtMoeda(total)}</span></span>
      </span>
      <ChevronRight size={16} style={{ color: 'var(--color-text-secondary)' }} />
    </button>
  );
}

export default function PainelAcoes(p: Props) {
  const [expandido, setExpandido] = useState(false);
  const [catModal, setCatModal] = useState<Cat | null>(null);

  const g = useMemo(() => {
    const pend = p.selecionados.filter(t => t.statusweb === STATUSWEB.PENDENTE);
    const ana = p.selecionados.filter(t => t.statusweb === STATUSWEB.EM_ANALISE);
    const apr = p.selecionados.filter(t => t.statusweb === STATUSWEB.APROVADO);
    const soma = (a: Titulo[]) => a.reduce((s, t) => s + (t.valor || 0), 0);
    return {
      pend, ana, apr,
      totPend: soma(pend), totAna: soma(ana), totApr: soma(apr),
      totalSel: soma(p.selecionados),
    };
  }, [p.selecionados]);

  const lista = catModal === 'pendente' ? g.pend : catModal === 'analise' ? g.ana : catModal === 'aprovado' ? g.apr : [];

  // Fecha o modal automaticamente quando a categoria fica sem títulos selecionados
  // (ex.: após cancelar/aprovar, a seleção é recarregada e esvaziada).
  useEffect(() => {
    if (catModal && lista.length === 0) setCatModal(null);
  }, [catModal, lista.length]);

  const n = p.selecionados.length;
  // Balão só aparece quando há títulos selecionados; sem seleção ele some por completo.
  if (!p.temTitulos || n === 0) return null;

  const modalTitulo = catModal === 'pendente' ? 'Títulos Pendentes selecionados'
    : catModal === 'analise' ? 'Títulos Em Análise selecionados'
    : 'Títulos Aprovados selecionados';
  const totalModal = catModal === 'pendente' ? g.totPend : catModal === 'analise' ? g.totAna : g.totApr;

  return (
    <>
      <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 animate-slideUp ${expandido ? 'w-[92vw] max-w-sm' : 'w-auto'}`}>
        <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-primary)', boxShadow: '0 10px 30px rgba(0,0,0,0.18)' }}>
          {/* Cabeçalho */}
          <button onClick={() => setExpandido(e => !e)} className="w-full flex items-center justify-between px-4 py-3">
            {expandido ? (
              <div className="text-left">
                <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{n} título(s) selecionado(s)</div>
                {n > 0 && <div className="text-base font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>Total: {fmtMoeda(g.totalSel)}</div>}
              </div>
            ) : (
              <span className="flex items-center gap-2">
                <span className="rounded-lg p-1.5" style={{ backgroundColor: 'var(--color-primary-bg)' }}><Receipt size={18} style={{ color: 'var(--color-primary)' }} /></span>
                {n > 0
                  ? <span className="text-sm font-semibold rounded-full px-2.5 py-0.5 text-white" style={{ backgroundColor: '#f59e0b' }}>{n}</span>
                  : <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Nenhum selecionado</span>}
              </span>
            )}
            {expandido ? <ChevronDown size={18} style={{ color: 'var(--color-text-secondary)' }} /> : <ChevronUp size={18} style={{ color: 'var(--color-text-secondary)' }} />}
          </button>

          {expandido && (
            <div className="px-3 pb-3 border-t flex flex-col gap-2 max-h-[60vh] overflow-y-auto" style={{ borderColor: 'var(--color-border)' }}>
              {/* Marcar / desmarcar todos */}
              <button onClick={p.onMarcarTodos} className="mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                {p.todosMarcados ? <Square size={14} /> : <CheckSquare size={14} />} {p.todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
              </button>

              {/* Vencidos (apenas informativo — não abre modal) */}
              {p.vencidos.quantidade > 0 && (
                <div className="rounded-lg border p-2.5 flex items-center justify-between" style={{ borderColor: 'var(--color-danger)', backgroundColor: 'var(--color-danger-bg)' }}>
                  <span className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-full" style={{ backgroundColor: 'var(--kpi-bg-red)', color: 'var(--color-danger)' }}><AlertTriangle size={12} /> Vencidos</span>
                  <span className="text-xs tabular-nums" style={{ color: 'var(--color-danger)' }}>{p.vencidos.quantidade} título(s) · <span className="font-medium">{fmtMoeda(p.vencidos.total)}</span></span>
                </div>
              )}

              {n === 0 && <div className="text-xs text-center py-3" style={{ color: 'var(--color-text-secondary)' }}>Selecione títulos na árvore para ver os detalhes por status.</div>}

              {/* Resumos clicáveis (abrem o modal de detalhamento da categoria) */}
              {g.pend.length > 0 && (
                <SecaoResumo badge="Pendente" cor="var(--color-text-secondary)" bg="var(--color-nav-hover)" qtd={g.pend.length} total={g.totPend} onClick={() => setCatModal('pendente')} />
              )}
              {g.ana.length > 0 && (
                <SecaoResumo badge="Em Análise" cor="var(--color-warning)" bg="var(--color-warning-bg)" qtd={g.ana.length} total={g.totAna} onClick={() => setCatModal('analise')} />
              )}
              {g.apr.length > 0 && (
                <SecaoResumo badge="Aprovado" cor="var(--color-success)" bg="var(--color-success-bg)" qtd={g.apr.length} total={g.totApr} onClick={() => setCatModal('aprovado')} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal de detalhamento por categoria */}
      <Modal isOpen={!!catModal} onClose={() => setCatModal(null)} title={modalTitulo} size="xl">
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0" style={{ backgroundColor: 'var(--color-nav)' }}>
                  <tr>
                    {['Empresa', 'Natureza', 'Parceiro', 'Vencimento', 'Nota', 'Valor'].map((h, i) => (
                      <th key={h} className={`px-3 py-2.5 text-[12px] font-semibold text-white whitespace-nowrap ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                    {catModal !== 'pendente' && <th className="px-3 py-2.5 text-right text-[12px] font-semibold text-white">Ação</th>}
                  </tr>
                </thead>
                <tbody>
                  {lista.map((t, idx) => (
                    <tr key={t.nufin} style={{ backgroundColor: idx % 2 === 0 ? 'var(--color-surface)' : 'var(--color-bg)', borderTop: '1px solid var(--color-border)' }}>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--color-text)' }}>{t.empresa}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--color-text)' }}>{t.natureza}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--color-text)' }}>{t.parceiro}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{fmtVencimento(t.vencimento)}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{t.numnota ?? '—'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums font-medium" style={{ color: 'var(--color-text)' }}>{fmtMoeda(t.valor)}</td>
                      {catModal !== 'pendente' && (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <Btn small onClick={() => p.onDesaprovarTitulo(t)} disabled={p.enviando} icon={Undo2} variant="danger">
                            {catModal === 'analise' ? 'Voltar p/ Pendente' : 'Cancelar aprovação'}
                          </Btn>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: 'var(--color-bg)', borderTop: '2px solid var(--color-border)' }}>
                    <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--color-text)' }}>Total</td>
                    <td colSpan={catModal !== 'pendente' ? 4 : 3}></td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>{fmtMoeda(totalModal)}</td>
                    {catModal !== 'pendente' && <td></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Ações em lote da categoria */}
          <div className="flex flex-wrap gap-2 justify-end">
            {catModal === 'analise' && (
              <>
                <Btn onClick={() => { p.onRemoverAnalise(); }} disabled={p.enviando} icon={MinusCircle} variant="danger">Voltar todos p/ Pendente</Btn>
                <Btn onClick={() => { p.onAprovarAnalise(); }} disabled={p.enviando} icon={CheckCircle2} variant="primary">Aprovar análise</Btn>
              </>
            )}
            {catModal === 'aprovado' && (
              <Btn onClick={() => { p.onRemoverAprovacao(); }} disabled={p.enviando} icon={MinusCircle} variant="danger">Cancelar aprovação de todos</Btn>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
