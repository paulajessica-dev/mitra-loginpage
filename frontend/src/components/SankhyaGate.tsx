import { useState } from 'react';
import { ShieldCheck, User, Lock, Loader2, LogOut } from 'lucide-react';
import { sankhyaLogin, setSankhyaLinked } from '../lib/sankhya';

interface Props { onLinked: () => void; onSair: () => void; }

export default function SankhyaGate({ onLinked, onSair }: Props) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(''); setCarregando(true);
    try {
      const r = await sankhyaLogin(usuario.trim(), senha);
      if (r?.ok) { setSankhyaLinked(true); onLinked(); }
      else setErro(r?.message || 'Usuário ou senha inválidos.');
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível conectar ao Sankhya.');
    } finally { setCarregando(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="rounded-2xl p-3 mb-3" style={{ backgroundColor: 'var(--color-primary-bg)' }}>
            <ShieldCheck size={28} style={{ color: 'var(--color-primary)' }} />
          </div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Acesso Sankhya</h1>
          <p className="text-sm text-center mt-1" style={{ color: 'var(--color-text-secondary)' }}>Entre com suas credenciais do Sankhya para aprovar títulos.</p>
        </div>

        <form onSubmit={entrar} className="rounded-2xl border p-5 flex flex-col gap-4" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Usuário</label>
            <div className="relative">
              <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-secondary)' }} />
              <input value={usuario} onChange={e => setUsuario(e.target.value)} autoFocus required
                className="w-full h-10 pl-9 pr-3 text-sm rounded-lg border focus:outline-none focus:ring-2"
                style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)', ['--tw-ring-color' as any]: 'var(--color-primary-light)' }} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Senha</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-secondary)' }} />
              <input type="password" value={senha} onChange={e => setSenha(e.target.value)} required
                className="w-full h-10 pl-9 pr-3 text-sm rounded-lg border focus:outline-none focus:ring-2"
                style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)', ['--tw-ring-color' as any]: 'var(--color-primary-light)' }} />
            </div>
          </div>

          {erro && <div className="text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>{erro}</div>}

          <button type="submit" disabled={carregando}
            className="h-10 flex items-center justify-center gap-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}>
            {carregando ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Entrar
          </button>
        </form>

        <button onClick={onSair} className="w-full mt-4 flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <LogOut size={14} /> Sair
        </button>
      </div>
    </div>
  );
}
