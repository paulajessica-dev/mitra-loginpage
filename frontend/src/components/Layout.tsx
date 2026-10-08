import { useState, type ReactNode } from 'react';
import { Wallet, LayoutDashboard, CheckCircle2, CalendarRange, LogOut, Menu, X, Sun, Moon } from 'lucide-react';
import { meuNome } from '../lib/sankhya';
import { getTheme, setTheme, type Theme } from '../lib/theme';

export type View = 'dashboard' | 'portal' | 'fluxo';

const ITENS: { key: View; label: string; icon: ReactNode }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { key: 'portal', label: 'Aprovação de Títulos', icon: <CheckCircle2 size={18} /> },
  { key: 'fluxo', label: 'Fluxo de Caixa', icon: <CalendarRange size={18} /> },
];

interface Props {
  active: View;
  onNavigate: (v: View) => void;
  onLogout: () => void;
  title: string;
  headerActions?: ReactNode;
  children: ReactNode;
}

export default function Layout({ active, onNavigate, onLogout, title, headerActions, children }: Props) {
  const [drawer, setDrawer] = useState(false);
  const [theme, setThemeState] = useState<Theme>(getTheme);

  function navegar(v: View) { onNavigate(v); setDrawer(false); }
  function alternarTema() { const t: Theme = theme === 'dark' ? 'light' : 'dark'; setTheme(t); setThemeState(t); }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Drawer (menu lateral recolhível) */}
      {drawer && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} onClick={() => setDrawer(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 flex flex-col animate-slideIn shadow-xl" style={{ backgroundColor: 'var(--color-nav)' }}>
            <div className="flex items-center justify-between h-14 px-4 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2">
                <span className="rounded-lg p-1.5" style={{ backgroundColor: 'var(--color-primary-bg)' }}><Wallet size={18} style={{ color: 'var(--color-primary)' }} /></span>
                <span className="font-semibold text-sm leading-tight" style={{ color: 'var(--color-text)' }}>
                  Portal de Aprovação
                  <span className="block text-xs font-normal" style={{ color: 'var(--color-text-secondary)' }}>MISA</span>
                </span>
              </div>
              <button onClick={() => setDrawer(false)} className="p-2 rounded-lg" style={{ color: 'var(--color-text-secondary)' }} aria-label="Fechar menu"><X size={18} /></button>
            </div>
            <nav className="flex flex-col gap-1 p-3">
              {ITENS.map(it => {
                const on = it.key === active;
                return (
                  <button key={it.key} onClick={() => navegar(it.key)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left"
                    style={{ backgroundColor: on ? 'var(--color-primary-bg)' : 'transparent', color: on ? 'var(--color-primary)' : 'var(--color-nav-text)' }}
                    onMouseEnter={e => { if (!on) e.currentTarget.style.backgroundColor = 'var(--color-nav-hover)'; }}
                    onMouseLeave={e => { if (!on) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                    {it.icon}{it.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-20 border-b" style={{ backgroundColor: 'var(--color-nav)', borderColor: 'var(--color-border)' }}>
        <div className="px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setDrawer(true)} className="p-2 rounded-lg hover:bg-[var(--color-nav-hover)]" style={{ color: 'var(--color-text-secondary)' }} aria-label="Abrir menu"><Menu size={18} /></button>
            <h1 className="font-semibold truncate" style={{ color: 'var(--color-text)' }}>{title}</h1>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={alternarTema} title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              className="p-2 rounded-lg hover:bg-[var(--color-nav-hover)]" style={{ color: 'var(--color-text-secondary)' }} aria-label="Alternar tema">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            {headerActions}
            {meuNome() && <span className="hidden sm:inline text-sm mr-1 px-2 py-1 rounded-md" style={{ color: 'var(--color-text-secondary)' }}>{meuNome()}</span>}
            <button onClick={onLogout} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg hover:bg-[var(--color-nav-hover)]" style={{ color: 'var(--color-text-secondary)' }}>
              <LogOut size={16} /> <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
