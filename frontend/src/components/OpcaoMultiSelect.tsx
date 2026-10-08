import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface Opcao { value: string | number; label: string; }

interface Props {
  label: string;
  icon?: LucideIcon;
  todosLabel: string;
  opcoes: Opcao[];
  selecionadas: (string | number)[];
  onChange: (v: (string | number)[]) => void;
  disabled?: boolean;
}

export default function OpcaoMultiSelect({ label, icon: Icon, todosLabel, opcoes, selecionadas, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    if (open) { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onEsc); }
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  function toggle(v: string | number) {
    onChange(selecionadas.includes(v) ? selecionadas.filter(x => x !== v) : [...selecionadas, v]);
  }

  const texto = selecionadas.length === 0 ? todosLabel
    : selecionadas.length === 1 ? (opcoes.find(o => o.value === selecionadas[0])?.label || '1')
    : `${selecionadas.length} selecionados`;

  return (
    <div className="flex flex-col gap-1.5" ref={ref}>
      <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
      <div className="relative">
        <button type="button" disabled={disabled} onClick={() => !disabled && setOpen(o => !o)}
          className="w-full h-10 px-3 text-sm rounded-lg border flex items-center justify-between gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2"
          style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)', ['--tw-ring-color' as any]: 'var(--color-primary-light)' }}>
          <span className="flex items-center gap-2 truncate">
            {Icon && <Icon size={15} style={{ color: 'var(--color-text-secondary)' }} />}
            <span className="truncate">{texto}</span>
          </span>
          <ChevronDown size={15} style={{ color: 'var(--color-text-secondary)' }} />
        </button>

        {open && (
          <div className="absolute z-30 mt-1 rounded-xl border shadow-lg animate-scaleIn w-full min-w-[200px] overflow-hidden"
            style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            <div className="max-h-64 overflow-y-auto py-1">
              <button type="button" onClick={() => onChange([])} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--color-nav-hover)]" style={{ color: 'var(--color-text)' }}>
                <span className="w-[16px] h-[16px] rounded border flex items-center justify-center shrink-0"
                  style={{ borderColor: selecionadas.length === 0 ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: selecionadas.length === 0 ? 'var(--color-primary)' : 'transparent' }}>
                  {selecionadas.length === 0 && <Check size={11} strokeWidth={3} color="#fff" />}
                </span>
                {todosLabel}
              </button>
              {opcoes.map(o => {
                const on = selecionadas.includes(o.value);
                return (
                  <button key={String(o.value)} type="button" onClick={() => toggle(o.value)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--color-nav-hover)]" style={{ color: 'var(--color-text)' }}>
                    <span className="w-[16px] h-[16px] rounded border flex items-center justify-center shrink-0"
                      style={{ borderColor: on ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: on ? 'var(--color-primary)' : 'transparent' }}>
                      {on && <Check size={11} strokeWidth={3} color="#fff" />}
                    </span>
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
