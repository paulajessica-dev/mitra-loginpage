import { useState } from 'react';
import { Search, X, Hash, Loader2, Activity, Globe, SlidersHorizontal, ChevronDown } from 'lucide-react';
import DatePicker from './DatePicker';
import EmpresaMultiSelect from './EmpresaMultiSelect';
import OpcaoMultiSelect from './OpcaoMultiSelect';
import { STATUSWEB_OPCOES, STATUS_OPCOES, STATUS_PADRAO } from '../lib/sankhya';
import type { EmpresaOpcao, FiltrosTitulos } from '../lib/sankhya';

interface Props { empresas: EmpresaOpcao[]; loading: boolean; onPesquisar: (f: FiltrosTitulos) => void; }

export default function Filtros({ empresas, loading, onPesquisar }: Props) {
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [empresasSel, setEmpresasSel] = useState<number[]>([]);
  const [statuswebSel, setStatuswebSel] = useState<(string | number)[]>([]);
  const [statusSel, setStatusSel] = useState<(string | number)[]>([...STATUS_PADRAO]);
  const [nufinText, setNufinText] = useState('');
  const [aberto, setAberto] = useState(true);

  const nufinAtivo = nufinText.trim().length > 0;
  // NUFINs colados de uma planilha vêm separados por espaço ou quebra de linha (\n).
  // Também aceitamos vírgula/ponto-e-vírgula por conveniência.
  const nufinsParse = nufinText.split(/[\s,;]+/).map(s => parseInt(s, 10)).filter(n => Number.isFinite(n) && n > 0);
  const qtdFiltros = (dataInicial ? 1 : 0) + (dataFinal ? 1 : 0) + (empresasSel.length ? 1 : 0) + (statuswebSel.length ? 1 : 0) + (statusSel.length ? 1 : 0) + (nufinAtivo ? 1 : 0);

  function pesquisar() {
    if (nufinAtivo) {
      const nufins = nufinsParse;
      onPesquisar({ nufins });
    } else {
      // Sem data preenchida -> filtra apenas a data atual (evita trazer volume demais e sobrecarregar).
      const hoje = new Date().toISOString().slice(0, 10);
      const di = dataInicial || dataFinal || hoje;
      const df = dataFinal || dataInicial || hoje;
      onPesquisar({
        dataInicial: di, dataFinal: df, empresas: empresasSel,
        statusweb: statuswebSel.map(Number), status: statusSel.map(String),
      });
    }
  }
  function limpar() {
    setDataInicial(''); setDataFinal(''); setEmpresasSel([]); setStatuswebSel([]); setStatusSel([]); setNufinText('');
  }

  return (
    <div className="rounded-xl border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
      <button onClick={() => setAberto(a => !a)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
        <span className="flex items-center gap-2"><SlidersHorizontal size={15} style={{ color: 'var(--color-primary)' }} /> Filtros
          {qtdFiltros > 0 && <span className="text-xs font-normal px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>{qtdFiltros}</span>}
        </span>
        <ChevronDown size={16} className="transition-transform" style={{ color: 'var(--color-text-secondary)', transform: aberto ? 'rotate(180deg)' : 'none' }} />
      </button>
      {aberto && (
      <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-end pt-2">
        <div style={{ opacity: nufinAtivo ? 0.5 : 1, pointerEvents: nufinAtivo ? 'none' : 'auto' }}>
          <DatePicker label="Vencimento de" value={dataInicial} onChange={setDataInicial} disabled={nufinAtivo} />
        </div>
        <div style={{ opacity: nufinAtivo ? 0.5 : 1, pointerEvents: nufinAtivo ? 'none' : 'auto' }}>
          <DatePicker label="Vencimento até" value={dataFinal} onChange={setDataFinal} disabled={nufinAtivo} />
        </div>
        <div style={{ opacity: nufinAtivo ? 0.5 : 1, pointerEvents: nufinAtivo ? 'none' : 'auto' }}>
          <EmpresaMultiSelect empresas={empresas} selecionadas={empresasSel} onChange={setEmpresasSel} disabled={nufinAtivo} />
        </div>
        <div style={{ opacity: nufinAtivo ? 0.5 : 1, pointerEvents: nufinAtivo ? 'none' : 'auto' }}>
          <OpcaoMultiSelect label="Status Aprovação" icon={Globe} todosLabel="Todos os status de aprovação" opcoes={STATUSWEB_OPCOES}
            selecionadas={statuswebSel} onChange={setStatuswebSel} disabled={nufinAtivo} />
        </div>
        <div style={{ opacity: nufinAtivo ? 0.5 : 1, pointerEvents: nufinAtivo ? 'none' : 'auto' }}>
          <OpcaoMultiSelect label="Status" icon={Activity} todosLabel="Todos os status" opcoes={STATUS_OPCOES}
            selecionadas={statusSel} onChange={setStatusSel} disabled={nufinAtivo} />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label className="flex items-center justify-between text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="flex items-center gap-1.5"><Hash size={14} /> Lista de Títulos</span>
            {nufinAtivo && <span className="text-xs font-normal px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>{nufinsParse.length} Título(s)</span>}
          </label>
          <div className="relative">
            <textarea value={nufinText} onChange={e => setNufinText(e.target.value)} rows={2}
              placeholder="Coloque o número único dos Títulos separados por espaço ou quebra de linha. Ex: 511434 512581 512900"
              className="w-full pl-3 pr-8 py-2 text-sm rounded-lg border resize-y focus:outline-none focus:ring-2"
              style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)', ['--tw-ring-color' as any]: 'var(--color-primary-light)' }} />
            {nufinText && <button onClick={() => setNufinText('')} className="absolute right-2 top-2" title="Limpar"><X size={14} style={{ color: 'var(--color-text-secondary)' }} /></button>}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <button onClick={pesquisar} disabled={loading}
            className="flex-1 h-10 flex items-center justify-center gap-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Pesquisar
          </button>
          <button onClick={limpar} className="h-10 px-3 flex items-center justify-center rounded-lg text-sm border" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>Limpar</button>
        </div>
      </div>
      {nufinAtivo && <p className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>Busca por NUFIN ignora os filtros de data e empresa.</p>}
      </div>
      )}
    </div>
  );
}
