// ============================================================================
// Camada de dados do Portal MISA — APP PUBLICO (tela publica, sem login Mitra).
//  - SDK configurado SEM token; as Server Functions estao marcadas como publicas.
//  - As SFs do Sankhya sao do tipo INTEGRATION NATIVO (executadas direto pelo
//    motor de integracao) — unico caminho que funciona em execucao publica.
//    O pos-processamento (decode do idusu, mapeamento de linhas, agregacao e
//    elegibilidade das gravacoes) e feito aqui no frontend.
//  - Autenticacao = login REAL do Sankhya (MobileLoginSP).
//  - Gravacoes rodam sob a SESSAO do usuario (jsessionid capturado no login),
//    1 titulo por chamada (loop) e carimbam o CODUSU do usuario logado.
// ============================================================================
import { configureSdkMitra, executePublicServerFunctionMitra } from 'mitra-interactions-sdk';

const projectId = Number(import.meta.env.VITE_MITRA_PROJECT_ID);
// App publico: configura o SDK sem token (SFs com publicExecution=true)
configureSdkMitra({ baseURL: import.meta.env.VITE_MITRA_BASE_URL, projectId });

// IDs das Server Functions (INTEGRATION nativo — ver backend/convert-native.mjs)
export const SF = {
  login: 8, listarEmpresas: 9, listarTitulos: 10, saldosDia: 11, vencidos: 12,
  listarTravados: 13, gravarAnalise: 14, aprovar: 15, desaprovar: 16,
  fluxoCaixa: 18, removerTravado: 30, buscarNome: 31,
  // Gravacao em LOTE: uma unica requisicao para N titulos (DatasetSP aceita records/pks com N itens)
  gravarAnaliseLote: 41, aprovarLote: 42, desaprovarLote: 43, removerTravadosLote: 44,
} as const;

// Maximo de titulos por requisicao. O Sankhya aceita o lote inteiro numa chamada so;
// o teto existe apenas para nao montar um payload gigante em selecoes de milhares de titulos.
const LOTE_MAX = 200;
function emLotes<T>(itens: T[], tam = LOTE_MAX): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += tam) out.push(itens.slice(i, i + tam));
  return out;
}

// ── Parsing de resposta de SF INTEGRATION nativo ──
// output = { statusCode, body: { status, statusMessage, responseBody: { rows, fieldsMetadata } } }
function sankhyaBody(res: any): any {
  let out = res?.output ?? res?.result?.output;
  if (typeof out === 'string') { try { out = JSON.parse(out); } catch { /* keep */ } }
  let body = out?.body ?? out;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* keep */ } }
  return body;
}
function rowsOf(b: any): any[] { return b?.responseBody?.rows || []; }
function okOf(b: any): boolean { return b?.status === '1'; }
function trim(v: any): any { return typeof v === 'string' ? v.trim() : v; }

// ── Resiliência de rede ──
// Um soluço de conexão (a requisição nem chega a receber resposta) aparecia como
// "Failed to fetch": mensagem sem sentido para o usuário e ação jogada fora.
// Aqui a chamada é repetida algumas vezes antes de desistir, e o erro final vira
// uma frase compreensível. Só repete falha de REDE — erro vindo do Sankhya
// (regra de negócio, sessão expirada) sobe na hora, sem insistir.
const TENTATIVAS = 3;
const ESPERA_MS = [400, 1200];
const MSG_REDE = 'Sem conexão com o servidor. Verifique a internet e tente de novo.';

function ehFalhaDeRede(e: any): boolean {
  if (e instanceof TypeError) return true; // o fetch lança TypeError quando não há resposta
  const m = String(e?.message || e).toLowerCase();
  return /failed to fetch|networkerror|network error|load failed|econnreset|network request failed|socket/.test(m);
}
const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

// repetir=false para operações de REMOÇÃO: se a primeira tentativa chegou a
// gravar e só a resposta se perdeu, repetir reclamaria de um registro que já não
// existe — e o usuário veria um erro para algo que na verdade deu certo.
async function callSF(serverFunctionId: number, input: Record<string, any> = {}, opcoes: { repetir?: boolean } = {}): Promise<any> {
  const max = opcoes.repetir === false ? 1 : TENTATIVAS;
  for (let i = 0; i < max; i++) {
    try {
      const res: any = await executePublicServerFunctionMitra({ projectId, serverFunctionId, input: { projectId, ...input } });
      const status = res?.status ?? res?.result?.executionStatus;
      if (status === 'FAILED') {
        // Marcado como erro de negócio: a resposta CHEGOU, insistir não ajuda —
        // e evita confundir com rede caso o texto do Sankhya cite "timeout".
        const err: any = new Error(res?.error || res?.result?.error || 'Falha ao executar a operação.');
        err.negocio = true;
        throw err;
      }
      return sankhyaBody(res);
    } catch (e: any) {
      if (e?.negocio || !ehFalhaDeRede(e)) throw e;
      if (i < max - 1) await espera(ESPERA_MS[i] ?? 1200);
    }
  }
  throw new Error(MSG_REDE);
}

// ── Sessão (identidade do usuário logado no Sankhya) ──
const SKEY_IDUSU = 'misa-idusu';
const SKEY_NOME = 'misa-nome';
const SKEY_JSESSION = 'misa-jsession'; // sessao Sankhya do usuario (autoriza as gravacoes)
export function isSankhyaLinked(): boolean { return !!sessionStorage.getItem(SKEY_IDUSU); }
export function setSankhyaLinked(v: boolean): void {
  if (!v) { sessionStorage.removeItem(SKEY_IDUSU); sessionStorage.removeItem(SKEY_NOME); sessionStorage.removeItem(SKEY_JSESSION); }
}
export function meuNome(): string { return sessionStorage.getItem(SKEY_NOME) || ''; }
function meuCodusu(): number | null { const v = sessionStorage.getItem(SKEY_IDUSU); return v !== null && v !== '' ? Number(v) : null; }
function meuJsession(): string | null { return sessionStorage.getItem(SKEY_JSESSION); }

// ── Login (valida usuário/senha REAIS do Sankhya via MobileLoginSP) ──
export interface LoginResult { ok: boolean; idusu?: number; nome?: string; jsession?: string; message?: string; }
function decodeIdusu(b64?: string): number | null {
  if (b64 == null) return null;
  try { const v = atob(String(b64).replace(/\s/g, '')).trim(); if (v === '') return null; const n = parseInt(v, 10); return isNaN(n) ? null : n; } catch { return null; }
}
export async function sankhyaLogin(usuario: string, senha: string): Promise<LoginResult> {
  const b = await callSF(SF.login, { usuario, senha });
  if (!okOf(b)) return { ok: false, message: b?.statusMessage || 'Usuário ou senha inválidos.' };
  const rb = b.responseBody || {};
  const idusu = decodeIdusu(rb.idusu && rb.idusu['$']); // idusu pode ser 0 (usuario SUP)
  if (idusu === null) return { ok: false, message: 'Login sem idusu.' };
  const jsession = (rb.jsessionid && rb.jsessionid['$']) || undefined;
  let nome = usuario;
  try { const nb = await callSF(SF.buscarNome, { codusu: idusu }); const r = rowsOf(nb); if (r[0]) nome = trim(r[0][0]); } catch { /* nome fica o login */ }
  sessionStorage.setItem(SKEY_IDUSU, String(idusu));
  sessionStorage.setItem(SKEY_NOME, String(nome));
  if (jsession) sessionStorage.setItem(SKEY_JSESSION, String(jsession));
  return { ok: true, idusu, nome, jsession };
}

// ── Empresas (com matriz p/ agrupamento no filtro) ──
export interface EmpresaOpcao { codemp: number; nome: string; codmat: number; nomemat: string; }
export async function listarEmpresas(): Promise<EmpresaOpcao[]> {
  const b = await callSF(SF.listarEmpresas);
  return rowsOf(b).map((x: any) => ({
    codemp: x[0], nome: trim(x[1]),
    codmat: Number(x[2] ?? x[0]), nomemat: trim(x[3] ?? x[1]),
  }));
}

// ── Títulos ──
export interface Titulo {
  status: string; codemp: number; empresa: string; natureza: string; grupoNatureza: string;
  valor: number; vencimento: string; numnota: number | null; historico: string | null;
  nufin: number; statusweb: number; codparc: number; parceiro: string; tipotitulo: string;
}
export interface FiltrosTitulos {
  nufins?: number[]; dataInicial?: string; dataFinal?: string;
  empresas?: number[]; statusweb?: number[]; status?: string[];
}
function isoToBR(s: string): string { const p = String(s).split('-'); return p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0]) : s; }
function titulosInput(filtros: FiltrosTitulos): Record<string, string> {
  const nufins = (filtros.nufins || []).map(Number).filter(Boolean);
  if (nufins.length) return { nufins: nufins.join(','), dataInicial: '', dataFinal: '', empresas: '', statusweb: '', status: '' };
  return {
    nufins: '',
    dataInicial: filtros.dataInicial ? isoToBR(filtros.dataInicial) : '',
    dataFinal: filtros.dataFinal ? isoToBR(filtros.dataFinal) : '',
    empresas: (filtros.empresas || []).map(Number).filter(Boolean).join(','),
    statusweb: (filtros.statusweb || []).filter((n) => n !== null && n !== undefined).join(','),
    status: (filtros.status || []).filter(Boolean).join('|'),
  };
}
function mapTitulo(x: any): Titulo {
  return {
    status: x[0], codemp: x[1], empresa: trim(x[2]), natureza: trim(x[3]), grupoNatureza: trim(x[4]),
    valor: x[5], vencimento: x[6], numnota: x[7], historico: x[8], nufin: x[9],
    statusweb: x[10], codparc: x[11], parceiro: trim(x[12]), tipotitulo: trim(x[13]),
  };
}
export async function listarTitulos(filtros: FiltrosTitulos): Promise<Titulo[]> {
  const b = await callSF(SF.listarTitulos, titulosInput(filtros));
  if (!okOf(b)) throw new Error(b?.statusMessage || 'Erro ao listar títulos.');
  return rowsOf(b).map(mapTitulo);
}

// ── Saldos ──
export interface SaldoEmpresa {
  codemp: number; empresa: string; saldoInicial: number; saldoEncaixe: number;
  totalAnalise: number; totalAprovado: number; disponivel: number;
}
export async function saldosDia(): Promise<SaldoEmpresa[]> {
  const b = await callSF(SF.saldosDia);
  return rowsOf(b).map((x: any) => {
    const ini = Number(x[2]) || 0, enc = Number(x[3]) || 0, ana = Number(x[4]) || 0, apr = Number(x[5]) || 0;
    return { codemp: x[0], empresa: trim(x[1]), saldoInicial: ini, saldoEncaixe: enc, totalAnalise: ana, totalAprovado: apr, disponivel: (ini + enc) - (apr + ana) };
  }).filter((s: SaldoEmpresa) => s.saldoInicial || s.saldoEncaixe || s.totalAnalise || s.totalAprovado);
}

// ── Vencidos ──
export interface Vencidos { quantidade: number; total: number; }
export async function vencidos(empresas?: number[]): Promise<Vencidos> {
  const b = await callSF(SF.vencidos, { empresas: (empresas || []).map(Number).filter(Boolean).join(',') });
  const row = rowsOf(b)[0] || [0, 0];
  return { quantidade: Number(row[0]) || 0, total: Number(row[1]) || 0 };
}

// ── Fluxo de Caixa Diário (matriz empresa x dia) ──
export interface FluxoDiaVals { sini: number; enc: number; ana: number; apr: number; disp: number; }
export interface FluxoEmpresa { codemp: number; nome: string; codmat: number; nomemat: string; dias: Record<string, FluxoDiaVals>; }
export interface FluxoCaixaResult {
  ok: boolean; dias: string[]; empresas: FluxoEmpresa[];
  totais: Record<string, FluxoDiaVals>; message?: string;
}
export async function fluxoCaixa(dataInicial: string, dataFinal: string): Promise<FluxoCaixaResult> {
  const di = String(dataInicial || '').replace(/[^0-9-]/g, '');
  const df = String(dataFinal || '').replace(/[^0-9-]/g, '');
  if (!di || !df) throw new Error('Informe o período (data inicial e final).');
  const b = await callSF(SF.fluxoCaixa, { dataInicial: di, dataFinal: df });
  if (!okOf(b)) throw new Error(b?.statusMessage || 'Erro ao montar o fluxo de caixa.');
  const diasSet: Record<string, boolean> = {}, empMap: Record<string, FluxoEmpresa> = {}, totais: Record<string, FluxoDiaVals> = {};
  rowsOf(b).forEach((x: any) => {
    const codemp = x[0], nome = trim(x[1]), codmat = x[2], nomemat = trim(x[3]), dia = x[4];
    const sini = Number(x[5]) || 0, enc = Number(x[6]) || 0, ana = Number(x[7]) || 0, apr = Number(x[8]) || 0;
    const disp = (sini + enc) - (apr + ana);
    diasSet[dia] = true;
    if (!empMap[codemp]) empMap[codemp] = { codemp, nome, codmat, nomemat, dias: {} };
    empMap[codemp].dias[dia] = { sini, enc, ana, apr, disp };
    if (!totais[dia]) totais[dia] = { sini: 0, enc: 0, ana: 0, apr: 0, disp: 0 };
    totais[dia].sini += sini; totais[dia].enc += enc; totais[dia].ana += ana; totais[dia].apr += apr; totais[dia].disp += disp;
  });
  const dias = Object.keys(diasSet).sort();
  const empresas = Object.keys(empMap).map((k) => empMap[k]).sort((a, b) => (a.codmat - b.codmat) || (a.codemp - b.codemp));
  return { ok: true, dias, empresas, totais };
}

// ── Limpeza de travados (RN-02) — busca travados e remove em lote (via serviço) ──
export async function limparTravados(): Promise<number> {
  const b = await callSF(SF.listarTravados);
  const nufins = rowsOf(b).map((x: any) => Number(x[0])).filter(Boolean);
  let removidos = 0;
  for (const parte of emLotes(nufins)) {
    const pks = parte.map((n) => ({ NUFIN: String(n), STATUS: String(STATUSWEB.EM_ANALISE) }));
    const rb = await callSF(SF.removerTravadosLote, { pks }, { repetir: false });
    if (okOf(rb)) removidos += parte.length;
  }
  return removidos;
}

// ── Ações de gravação (executam sob a SESSÃO do usuário logado no Sankhya) ──
function erroGravacao(b: any): string {
  const m = b && b.statusMessage ? String(b.statusMessage) : '';
  if (m.toLowerCase().indexOf('autoriza') >= 0) return 'Sessão Sankhya expirada ou sem permissão. Faça login novamente.';
  return m || 'Erro ao gravar no Sankhya.';
}
// grava TODOS os títulos numa única requisição (sob a sessão do usuário); para no primeiro erro
async function gravarLote(sfId: number, nufins: number[], jsession: string, codusu: number, statusweb: number): Promise<{ ok: number; msg: string }> {
  let ok = 0;
  for (const parte of emLotes(nufins)) {
    const records = parte.map((n) => ({ values: { '0': String(n), '1': String(statusweb), '2': String(codusu) } }));
    const b = await callSF(sfId, { jsession, records });
    if (!okOf(b)) return { ok, msg: erroGravacao(b) };
    ok += parte.length;
  }
  return { ok, msg: '' };
}

export async function gravarAnalise(nufins: number[]): Promise<any> {
  const codusu = meuCodusu(); const jsession = meuJsession();
  if (codusu === null || isNaN(codusu)) throw new Error('Usuário não identificado. Faça login novamente.');
  if (!jsession) throw new Error('Sessão Sankhya ausente. Faça login novamente.');
  // A tela já segmenta a seleção por status (só manda pendentes p/ análise),
  // então a elegibilidade é garantida pelo chamador — sem pré-consulta ao Sankhya
  // (aquela leitura na view MOV_DIARIO_MISA custava 7-12s e dominava o tempo total).
  const alvo = (nufins || []).map(Number).filter(Boolean);
  if (!alvo.length) throw new Error('Nenhum NUFIN informado.');
  const r = await gravarLote(SF.gravarAnaliseLote, alvo, jsession, codusu, STATUSWEB.EM_ANALISE);
  if (r.msg) return { ok: false, message: r.msg };
  return { ok: true, gravados: r.ok, ignorados: 0, codusu };
}

export async function aprovar(nufins: number[]): Promise<any> {
  const codusu = meuCodusu(); const jsession = meuJsession();
  if (codusu === null || isNaN(codusu)) throw new Error('Usuário não identificado. Faça login novamente.');
  if (!jsession) throw new Error('Sessão Sankhya ausente. Faça login novamente.');
  // Elegibilidade garantida pelo chamador (a tela só manda pendentes/em análise).
  // Sem pré-consulta ao Sankhya — ver comentário em gravarAnalise.
  const alvo = (nufins || []).map(Number).filter(Boolean);
  if (!alvo.length) throw new Error('Nenhum NUFIN informado.');
  const r = await gravarLote(SF.aprovarLote, alvo, jsession, codusu, STATUSWEB.APROVADO);
  if (r.msg) return { ok: false, message: r.msg };
  return { ok: true, aprovados: r.ok, ignorados: 0, codusu };
}

export async function desaprovar(itens: { nufin: number; status: number }[]): Promise<any> {
  const jsession = meuJsession();
  if (!jsession) throw new Error('Sessão Sankhya ausente. Faça login novamente.');
  const list = itens || [];
  if (!list.length) throw new Error('Nada para remover.');
  let ok = 0;
  for (const parte of emLotes(list)) {
    const pks = parte.map((it) => ({ NUFIN: String(it.nufin), STATUS: String(it.status) }));
    const b = await callSF(SF.desaprovarLote, { jsession, pks }, { repetir: false });
    if (!okOf(b)) return { ok: false, message: erroGravacao(b) };
    ok += parte.length;
  }
  return { ok: true, removidos: ok };
}

// ── Utils ──
export function fmtMoeda(v: number): string {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
// DTVENC vem como "DDMMYYYY HH:mm:ss" -> "DD/MM/YYYY"
export function fmtVencimento(v: string): string {
  if (!v) return '';
  const d = String(v).trim().slice(0, 8);
  if (d.length === 8 && /^\d+$/.test(d)) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 8)}`;
  return String(v);
}
// chave de ordenação de vencimento: DDMMYYYY -> YYYYMMDD
export function chaveVenc(v: string): string {
  const d = String(v || '').trim().slice(0, 8);
  if (d.length === 8) return d.slice(4, 8) + d.slice(2, 4) + d.slice(0, 2);
  return d;
}

export const STATUSWEB = { PENDENTE: 1, EM_ANALISE: 2, APROVADO: 3 } as const;

// Opcoes para os filtros (valores reais confirmados no Sankhya)
export const STATUSWEB_OPCOES = [
  { value: 1, label: 'Pendente' },
  { value: 2, label: 'Em Análise' },
  { value: 3, label: 'Aprovado' },
];
export const STATUS_OPCOES = [
  { value: 'Previsto', label: 'Previsto' },
  { value: 'Realizado', label: 'Realizado' },
  { value: 'Não Pago', label: 'Não Pago' },
];
// Filtro de Status vem preenchido com estes valores por padrao
export const STATUS_PADRAO: string[] = ['Previsto', 'Não Pago'];
