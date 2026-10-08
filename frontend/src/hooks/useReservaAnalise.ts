import { useCallback, useRef, useState } from 'react';
import { gravarAnalise, desaprovar, STATUSWEB } from '../lib/sankhya';

// ============================================================================
// Análise pela seleção
// ----------------------------------------------------------------------------
// Selecionar um título PENDENTE grava "Em Análise" (status 2) no Sankhya.
// Desmarcar remove a análise e devolve o título para Pendente.
//
// A análise é ESTADO QUE FICA, não reserva temporária: atualizar a tela, trocar
// a pesquisa, fechar a aba ou voltar depois não desfazem nada. Sai só quando o
// usuário desmarca, usa "Voltar p/ Pendente", ou na limpeza automática do dia
// seguinte (RN-02) — igual ao que já valia para a análise gravada à mão.
//
// Os cliques NÃO viram requisição imediata: entram numa fila com um pequeno
// atraso e saem em UMA chamada em lote (marcar 60 títulos = 1 requisição).
// Marcar e desmarcar antes do envio se anulam — nada chega a ser gravado.
//
// Só mexe em títulos PENDENTES, e só remove a análise que a própria seleção
// criou: título que já estava Em Análise (outro usuário, análise gravada pelo
// modal de detalhe, ou marcada antes de atualizar a tela) nunca é alterado
// pela seleção.
// ============================================================================

type TituloRef = { nufin: number; statusweb: number };

const ATRASO_MS = 800;

function soltar(nufins: number[]): Promise<any> {
  return desaprovar(nufins.map(n => ({ nufin: n, status: STATUSWEB.EM_ANALISE })));
}

export function useReservaAnalise(cfg: {
  titulos: TituloRef[];
  aplicarStatus: (nufins: number[], statusweb: number) => void;
  desmarcar: (nufins: number[]) => void;
  aoGravar: () => void;
  onErro: (msg: string) => void;
}) {
  const cfgRef = useRef(cfg); cfgRef.current = cfg;
  const [reservas, setReservas] = useState<Set<number>>(new Set());
  const st = useRef({
    gravados: new Set<number>(),  // já gravados no Sankhya por esta seleção
    marcar: new Set<number>(),    // fila de gravação
    remover: new Set<number>(),   // fila de remoção
    timer: 0 as any,
    cadeia: Promise.resolve() as Promise<any>, // serializa as chamadas (nunca fora de ordem)
  });

  const sincronizar = useCallback(() => {
    const s = st.current;
    setReservas(new Set<number>([...s.gravados, ...s.marcar]));
  }, []);

  const enfileirar = useCallback((op: () => Promise<any>) => {
    const s = st.current;
    s.cadeia = s.cadeia.then(op, op);
    return s.cadeia;
  }, []);

  // Esvazia as filas numa única ida ao Sankhya (uma para marcar, uma para remover).
  // Em caso de falha, desfaz o otimismo da tela e avisa o usuário.
  const enviar = useCallback(() => {
    const s = st.current;
    clearTimeout(s.timer);
    const marcar = [...s.marcar];
    const remover = [...s.remover];
    s.marcar.clear(); s.remover.clear();
    if (!marcar.length && !remover.length) return s.cadeia;
    marcar.forEach(n => s.gravados.add(n));
    sincronizar();
    return enfileirar(async () => {
      if (marcar.length) {
        try {
          const r: any = await gravarAnalise(marcar);
          if (r && r.ok === false) throw new Error(r.message);
        } catch (e: any) {
          marcar.forEach(n => s.gravados.delete(n));
          sincronizar();
          cfgRef.current.aplicarStatus(marcar, STATUSWEB.PENDENTE);
          cfgRef.current.desmarcar(marcar);
          cfgRef.current.onErro(e?.message || 'Não foi possível colocar em análise.');
        }
      }
      if (remover.length) {
        try {
          const r: any = await soltar(remover);
          if (r && r.ok === false) throw new Error(r.message);
        } catch (e: any) {
          remover.forEach(n => s.gravados.add(n));
          sincronizar();
          cfgRef.current.aplicarStatus(remover, STATUSWEB.EM_ANALISE);
          cfgRef.current.onErro(e?.message || 'Não foi possível remover a análise.');
        }
      }
      // O Sankhya já tem a mudança: a tela pede os saldos novos por conta própria.
      cfgRef.current.aoGravar();
    });
  }, [enfileirar, sincronizar]);

  // Chamado a cada marcação/desmarcação da grid (um título ou o lote inteiro).
  const aoSelecionar = useCallback((nufins: number[], on: boolean) => {
    const s = st.current;
    const porNufin = new Map(cfgRef.current.titulos.map(t => [t.nufin, t]));
    const mudaram: number[] = [];
    for (const nf of nufins) {
      if (on) {
        if (s.gravados.has(nf) || s.marcar.has(nf)) continue;
        // remoção ainda na fila: cancela e mantém a análise
        if (s.remover.has(nf)) { s.remover.delete(nf); s.gravados.add(nf); mudaram.push(nf); continue; }
        if (porNufin.get(nf)?.statusweb !== STATUSWEB.PENDENTE) continue;
        s.marcar.add(nf); mudaram.push(nf);
      } else {
        // gravação ainda na fila: cancela (nada foi escrito no Sankhya)
        if (s.marcar.has(nf)) { s.marcar.delete(nf); mudaram.push(nf); continue; }
        if (s.remover.has(nf)) continue;
        if (s.gravados.has(nf)) { s.gravados.delete(nf); s.remover.add(nf); mudaram.push(nf); continue; }
        // análise que já existia (gravada antes de recarregar a tela, ou por
        // outro usuário): desmarcar também a remove — é o mesmo que o botão
        // "Voltar p/ Pendente" faz com a seleção.
        if (porNufin.get(nf)?.statusweb === STATUSWEB.EM_ANALISE) { s.remover.add(nf); mudaram.push(nf); continue; }
      }
    }
    if (!mudaram.length) return;
    cfgRef.current.aplicarStatus(mudaram, on ? STATUSWEB.EM_ANALISE : STATUSWEB.PENDENTE);
    sincronizar();
    clearTimeout(s.timer);
    s.timer = setTimeout(enviar, ATRASO_MS);
  }, [enviar, sincronizar]);

  // Antes de qualquer ação em lote (aprovar/remover): garante que a fila já foi
  // gravada, para nenhuma escrita atrasada passar por cima da ação.
  const aguardar = useCallback(async () => { await enviar(); }, [enviar]);

  // A ação consumiu esses títulos (aprovou/removeu) — para de acompanhá-los sem
  // mandar nada ao Sankhya, senão desfaríamos o que a ação acabou de gravar.
  const esquecer = useCallback((nufins: number[]) => {
    const s = st.current;
    for (const nf of nufins) { s.gravados.delete(nf); s.marcar.delete(nf); s.remover.delete(nf); }
    sincronizar();
  }, [sincronizar]);

  // A lista vai ser recarregada: manda o que estiver na fila (nenhum clique se
  // perde) e zera o acompanhamento. As análises FICAM no Sankhya — a lista nova
  // já vem com elas, e a partir daí passam a ser análise comum.
  const finalizar = useCallback(() => {
    const s = st.current;
    enviar();
    s.gravados.clear();
    sincronizar();
  }, [enviar, sincronizar]);

  return { reservas, aoSelecionar, aguardar, esquecer, finalizar };
}
