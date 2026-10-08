import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, CheckCircle2, MinusCircle } from 'lucide-react';
import Layout, { type View } from '../components/Layout';
import Filtros from '../components/Filtros';
import SaldosHeader from '../components/SaldosHeader';
import ArvoreTitulos from '../components/ArvoreTitulos';
import PainelAcoes from '../components/PainelAcoes';
import Modal from '../components/ui/Modal';
import { ToastContainer } from '../components/ui/Toast';
import { useToast } from '../hooks/useToast';
import { useReservaAnalise } from '../hooks/useReservaAnalise';
import {
  listarEmpresas, listarTitulos, saldosDia, vencidos, limparTravados,
  aprovar, desaprovar, fmtMoeda, fmtVencimento, STATUSWEB, STATUS_PADRAO,
} from '../lib/sankhya';
import type { EmpresaOpcao, Titulo, SaldoEmpresa, Vencidos, FiltrosTitulos } from '../lib/sankhya';

function hoje() { return new Date().toISOString().slice(0, 10); }

function statusWebLabel(sw: number): string {
  if (sw === STATUSWEB.APROVADO) return 'Aprovado';
  if (sw === STATUSWEB.EM_ANALISE) return 'Em Análise';
  return 'Pendente';
}
function statusWebStyle(sw: number) {
  if (sw === STATUSWEB.APROVADO) return { backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)' };
  if (sw === STATUSWEB.EM_ANALISE) return { backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' };
  return { backgroundColor: 'var(--color-nav-hover)', color: 'var(--color-text-secondary)' };
}
// Botão de ação do modal de detalhe — mesmo vocabulário visual do painel de ações
function BtnAcao({ icon: Icon, onClick, disabled, variant = 'default', children }: {
  icon: any; onClick: () => void; disabled?: boolean; variant?: 'default' | 'primary' | 'danger'; children: React.ReactNode;
}) {
  const estilo = variant === 'primary'
    ? { backgroundColor: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
    : variant === 'danger'
      ? { backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)', borderColor: 'var(--color-danger-bg)' }
      : { backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' };
  return (
    <button onClick={onClick} disabled={disabled} style={estilo}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-200 disabled:opacity-50">
      <Icon size={15} /> {children}
    </button>
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span className="text-sm break-words" style={{ color: 'var(--color-text)' }}>{valor}</span>
    </div>
  );
}

export default function PortalPage({ onLogout, onNavigate }: { onLogout: () => void; onNavigate: (v: View) => void }) {
  const { toasts, addToast, removeToast } = useToast();
  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([]);
  const [saldos, setSaldos] = useState<SaldoEmpresa[]>([]);
  const [venc, setVenc] = useState<Vencidos>({ quantidade: 0, total: 0 });
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [loadingTit, setLoadingTit] = useState(false);
  const [loadingSaldos, setLoadingSaldos] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [confirmacao, setConfirmacao] = useState<{ titulo: string; count: number; total: number; run: () => void } | null>(null);
  const [detalhe, setDetalhe] = useState<Titulo | null>(null);
  const ultimoFiltro = useRef<FiltrosTitulos>({ dataInicial: hoje(), dataFinal: hoje(), status: [...STATUS_PADRAO] });

  // ── Análise pela seleção ──
  // A marcação do título É a análise: marcar um pendente grava "Em Análise" no
  // Sankhya, desmarcar remove. O hook cuida da fila e do envio em lote; a
  // análise em si é estado que fica (não se desfaz ao recarregar a tela).
  const aplicarStatus = useCallback((nufins: number[], statusweb: number) => {
    const alvo = new Set(nufins);
    setTitulos(prev => prev.map(t => (alvo.has(t.nufin) ? { ...t, statusweb } : t)));
  }, []);
  const desmarcarSel = useCallback((nufins: number[]) => {
    setSelected(prev => { const n = new Set(prev); for (const nf of nufins) n.delete(nf); return n; });
  }, []);
  // Ajuste de marcação sem tocar na análise (usado pela grid para espelhar o
  // que está visível e Em Análise).
  const sincronizarSel = useCallback((nufins: number[], on: boolean) => {
    setSelected(prev => {
      const n = new Set(prev);
      for (const nf of nufins) { if (on) n.add(nf); else n.delete(nf); }
      return n;
    });
  }, []);
  // Definido mais abaixo (depende de carregarSaldos); o ref quebra a ordem.
  const aoGravarRef = useRef<() => void>(() => {});
  const reserva = useReservaAnalise({
    titulos, aplicarStatus, desmarcar: desmarcarSel,
    aoGravar: () => aoGravarRef.current(),
    onErro: (msg: string) => addToast('error', msg),
  });
  const { aoSelecionar, aguardar, esquecer, finalizar } = reserva;

  const carregarSaldos = useCallback(async () => {
    setLoadingSaldos(true);
    try {
      const [s, v] = await Promise.all([saldosDia(), vencidos()]);
      setSaldos(s); setVenc(v);
    } catch (e: any) { addToast('error', e?.message || 'Erro ao carregar saldos.'); }
    finally { setLoadingSaldos(false); }
  }, [addToast]);

  // Marcar/desmarcar mexe nos saldos (Disponível, Em Análise, saldo por empresa).
  // Depois que a gravação sai, os cards se atualizam sozinhos — sem o usuário
  // precisar apertar o refresh. O atraso agrupa uma sequência de cliques.
  const saldosTimer = useRef<any>(0);
  aoGravarRef.current = useCallback(() => {
    clearTimeout(saldosTimer.current);
    saldosTimer.current = setTimeout(() => { carregarSaldos(); }, 600);
  }, [carregarSaldos]);

  const carregarTitulos = useCallback(async (f: FiltrosTitulos) => {
    ultimoFiltro.current = f;
    // A lista vai ser trocada: garante o envio do que estiver na fila e para de
    // acompanhar. As análises FICAM gravadas — a lista nova já vem com elas.
    finalizar();
    setLoadingTit(true);
    try {
      const t = await listarTitulos(f);
      setTitulos(t);
      setSelected(new Set());
    } catch (e: any) { addToast('error', e?.message || 'Erro ao listar títulos.'); }
    finally { setLoadingTit(false); }
  }, [addToast, finalizar]);

  // Inicialização: limpar travados (RN-02) + carregar tudo
  useEffect(() => {
    (async () => {
      try { await limparTravados(); } catch { /* silencioso */ }
      try {
        const emp = await listarEmpresas(); setEmpresas(emp);
      } catch (e: any) { addToast('error', 'Erro ao carregar empresas.'); }
      await carregarSaldos();
      await carregarTitulos(ultimoFiltro.current);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSel = useCallback((nufins: number[], on: boolean) => {
    setSelected(prev => {
      const n = new Set(prev);
      for (const nf of nufins) { if (on) n.add(nf); else n.delete(nf); }
      return n;
    });
    aoSelecionar(nufins, on); // pendente marcado -> Em Análise; desmarcado -> volta a Pendente
  }, [aoSelecionar]);

  const selecionados = useMemo(() => titulos.filter(t => selected.has(t.nufin)), [titulos, selected]);
  // Títulos que a grid está mostrando (já com os filtros de coluna aplicados)
  const [visiveis, setVisiveis] = useState<number[]>([]);
  const registrarVisiveis = useCallback((nufins: number[]) => setVisiveis(nufins), []);
  const todosMarcados = visiveis.length > 0 && visiveis.every(n => selected.has(n));

  // Atualiza o status dos títulos afetados na hora (otimista) e reconcilia com o
  // Sankhya em segundo plano — a tela responde na hora, sem esperar as leituras
  // pesadas da view. Se algo divergir, a recarga em background corrige.
  function posAcao(msg: string, otimista?: { nufins: number[]; statusweb: number }) {
    if (otimista) {
      const alvo = new Set(otimista.nufins);
      // A ação já resolveu esses títulos — a reserva sai sem tocar no Sankhya
      // (removê-la aqui desfaria justamente o que acabou de ser gravado).
      esquecer(otimista.nufins);
      setTitulos(prev => prev.map(t => (alvo.has(t.nufin) ? { ...t, statusweb: otimista.statusweb } : t)));
      setSelected(new Set());
    }
    addToast('success', msg);
    Promise.all([carregarSaldos(), carregarTitulos(ultimoFiltro.current)]).catch(() => {});
  }

  // Seleção agrupada por status (para o balão totalizador)
  const analiseSel = useMemo(() => selecionados.filter(t => t.statusweb === STATUSWEB.EM_ANALISE), [selecionados]);
  const aprovadosSel = useMemo(() => selecionados.filter(t => t.statusweb === STATUSWEB.APROVADO), [selecionados]);
  const somaVal = (a: Titulo[]) => a.reduce((s, t) => s + (t.valor || 0), 0);

  async function executar(fn: () => Promise<any>, msg: string, erro: string, otimista?: { nufins: number[]; statusweb: number }) {
    setEnviando(true);
    // Garante que a fila de reserva já foi gravada, para nenhuma escrita
    // atrasada da seleção cair em cima do resultado da ação.
    try { await aguardar(); } catch { /* o próprio hook avisa o erro */ }
    try { await fn(); posAcao(msg, otimista); }
    catch (e: any) { addToast('error', e?.message || erro); }
    finally { setEnviando(false); }
  }

  // Pendente -> Em Análise acontece sozinho, ao selecionar (ver useReservaAnalise).
  // Por isso não existe mais "Salvar Análise" nem "Aprovar diretamente": todo
  // título selecionado já entra em análise, e a aprovação parte sempre dali.

  // Em Análise -> Aprovado (com confirmação)
  function handleAprovarAnalise() {
    if (!analiseSel.length) return;
    setConfirmacao({ titulo: 'Aprovar análise', count: analiseSel.length, total: somaVal(analiseSel),
      run: () => executar(() => aprovar(analiseSel.map(t => t.nufin)), `${analiseSel.length} título(s) aprovado(s).`, 'Erro ao aprovar.',
        { nufins: analiseSel.map(t => t.nufin), statusweb: STATUSWEB.APROVADO }) });
  }
  // Remove a Análise (status 2)
  function handleRemoverAnalise() {
    if (!analiseSel.length) return;
    executar(() => desaprovar(analiseSel.map(t => ({ nufin: t.nufin, status: 2 }))), `${analiseSel.length} análise(s) removida(s).`, 'Erro ao remover análise.',
      { nufins: analiseSel.map(t => t.nufin), statusweb: STATUSWEB.PENDENTE });
  }
  // Remove a Aprovação (status 3, com confirmação)
  function handleRemoverAprovacao() {
    if (!aprovadosSel.length) return;
    setConfirmacao({ titulo: 'Remover aprovação', count: aprovadosSel.length, total: somaVal(aprovadosSel),
      run: () => executar(() => desaprovar(aprovadosSel.map(t => ({ nufin: t.nufin, status: 3 }))), `${aprovadosSel.length} aprovação(ões) removida(s).`, 'Erro ao remover aprovação.',
        { nufins: aprovadosSel.map(t => t.nufin), statusweb: STATUSWEB.PENDENTE }) });
  }
  function handleMarcarTodos() {
    // Só o que está visível na grid — marcar grava análise, e isso não pode
    // acontecer em título escondido por filtro de coluna.
    if (todosMarcados) toggleSel(visiveis, false);
    else toggleSel(visiveis.filter(n => !selected.has(n)), true);
  }

  // ── Ações individuais, disparadas do modal de detalhe ──
  // Espelham exatamente a regra do painel em lote: aprovação (e remoção de
  // aprovação) pedem confirmação; as de análise executam direto.
  function handleAprovarTitulo(t: Titulo) {
    setDetalhe(null);
    setConfirmacao({
      titulo: t.statusweb === STATUSWEB.EM_ANALISE ? 'Aprovar análise' : 'Aprovar diretamente',
      count: 1, total: t.valor || 0,
      run: () => executar(() => aprovar([t.nufin]), `Título ${t.nufin} aprovado.`, 'Erro ao aprovar.',
        { nufins: [t.nufin], statusweb: STATUSWEB.APROVADO }),
    });
  }
  function handleReverterTitulo(t: Titulo) {
    setDetalhe(null);
    const eraAprovado = t.statusweb === STATUSWEB.APROVADO;
    const run = () => executar(
      () => desaprovar([{ nufin: t.nufin, status: t.statusweb }]),
      eraAprovado ? `Aprovação do título ${t.nufin} removida.` : `Análise do título ${t.nufin} removida.`,
      eraAprovado ? 'Erro ao remover aprovação.' : 'Erro ao remover análise.',
      { nufins: [t.nufin], statusweb: STATUSWEB.PENDENTE },
    );
    if (eraAprovado) setConfirmacao({ titulo: 'Voltar aprovação', count: 1, total: t.valor || 0, run });
    else run();
  }

  async function handleDesaprovar(t: Titulo) {
    setEnviando(true);
    try { await aguardar(); } catch { /* o próprio hook avisa o erro */ }
    try { await desaprovar([{ nufin: t.nufin, status: t.statusweb }]); posAcao(`Título ${t.nufin} desaprovado.`, { nufins: [t.nufin], statusweb: STATUSWEB.PENDENTE }); }
    catch (e: any) { addToast('error', e?.message || 'Erro ao desaprovar.'); }
    finally { setEnviando(false); }
  }

  return (
    <Layout
      active="portal" onNavigate={onNavigate} onLogout={onLogout} title="Aprovação de Títulos"
      headerActions={
        <button onClick={() => { carregarSaldos(); carregarTitulos(ultimoFiltro.current); }} title="Atualizar"
          className="p-2 rounded-lg hover:bg-[var(--color-nav-hover)]"><RefreshCw size={16} style={{ color: 'var(--color-text-secondary)' }} /></button>
      }
    >
      <main className="w-full max-w-7xl mx-auto px-4 py-5 flex flex-col gap-4 pb-28">
        <Filtros empresas={empresas} loading={loadingTit} onPesquisar={carregarTitulos} />
        <SaldosHeader saldos={saldos} vencidos={venc} loading={loadingSaldos} />
        <ArvoreTitulos titulos={titulos} loading={loadingTit} selected={selected} reservas={reserva.reservas} onToggleSel={toggleSel} onSincronizarSel={sincronizarSel} onVisiveis={registrarVisiveis} onDesaprovar={handleDesaprovar} onVer={setDetalhe} />
      </main>

      <PainelAcoes
        selecionados={selecionados} vencidos={venc} enviando={enviando}
        temTitulos={titulos.length > 0}
        todosMarcados={todosMarcados}
        onMarcarTodos={handleMarcarTodos}
        onAprovarAnalise={handleAprovarAnalise}
        onRemoverAnalise={handleRemoverAnalise}
        onRemoverAprovacao={handleRemoverAprovacao}
        onDesaprovarTitulo={handleDesaprovar}
      />

      <Modal isOpen={!!confirmacao} onClose={() => setConfirmacao(null)} title={confirmacao?.titulo || 'Confirmar'} size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {confirmacao?.titulo} — <strong style={{ color: 'var(--color-text)' }}>{confirmacao?.count}</strong> título(s) no total de <strong style={{ color: 'var(--color-text)' }}>{fmtMoeda(confirmacao?.total || 0)}</strong>?
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmacao(null)} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>Cancelar</button>
            <button onClick={() => { const c = confirmacao; setConfirmacao(null); c?.run(); }} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: 'var(--color-primary)' }}>Confirmar</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!detalhe} onClose={() => setDetalhe(null)} title="Detalhe do Título" size="lg">
        {detalhe && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <Campo label="NUFIN" valor={String(detalhe.nufin)} />
              <Campo label="Status Financeiro" valor={detalhe.status || '—'} />
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Situação Web</span>
                <span>
                  <span className="px-2 py-0.5 text-[11px] font-medium rounded-full" style={statusWebStyle(detalhe.statusweb)}>{statusWebLabel(detalhe.statusweb)}</span>
                </span>
              </div>
              <Campo label="Empresa" valor={detalhe.empresa || `Empresa ${detalhe.codemp}`} />
              <Campo label="Parceiro" valor={detalhe.parceiro || `Parceiro ${detalhe.codparc}`} />
              <Campo label="Natureza" valor={detalhe.natureza || '—'} />
              <Campo label="Grupo de Natureza" valor={detalhe.grupoNatureza || '—'} />
              <Campo label="Número da Nota" valor={detalhe.numnota != null ? String(detalhe.numnota) : '—'} />
              <Campo label="Data de Vencimento" valor={fmtVencimento(detalhe.vencimento)} />
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Valor</span>
                <span className="text-base font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>{fmtMoeda(detalhe.valor)}</span>
              </div>
              <Campo label="Tipo de Título" valor={detalhe.tipotitulo || '—'} />
              {detalhe.historico && <Campo label="Histórico" valor={detalhe.historico} />}
            </div>
            {/* Ações do título — só aparecem as válidas para a situação atual */}
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              {/* Pendente -> Em Análise não tem botão: é o próprio checkbox do título. */}
              {detalhe.statusweb === STATUSWEB.PENDENTE && (
                <BtnAcao icon={CheckCircle2} disabled={enviando} variant="primary" onClick={() => handleAprovarTitulo(detalhe)}>Aprovar diretamente</BtnAcao>
              )}
              {detalhe.statusweb === STATUSWEB.EM_ANALISE && (
                <>
                  <BtnAcao icon={CheckCircle2} disabled={enviando} variant="primary" onClick={() => handleAprovarTitulo(detalhe)}>Aprovar análise</BtnAcao>
                  <BtnAcao icon={MinusCircle} disabled={enviando} variant="danger" onClick={() => handleReverterTitulo(detalhe)}>Remover análise</BtnAcao>
                </>
              )}
              {detalhe.statusweb === STATUSWEB.APROVADO && (
                <BtnAcao icon={MinusCircle} disabled={enviando} variant="danger" onClick={() => handleReverterTitulo(detalhe)}>Voltar aprovação</BtnAcao>
              )}
              <button onClick={() => setDetalhe(null)} className="ml-auto px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>Fechar</button>
            </div>
          </div>
        )}
      </Modal>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </Layout>
  );
}
