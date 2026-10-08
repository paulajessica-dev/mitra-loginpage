import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface DatePickerProps {
  label?: string;
  value?: string;              // YYYY-MM-DD
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function toBR(v?: string): string {
  if (!v) return '';
  const [y, m, d] = v.split('-');
  return d && m && y ? `${d}/${m}/${y}` : '';
}

export default function DatePicker({ label, value, onChange, placeholder = 'Selecionar', disabled }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const init = value ? new Date(value + 'T00:00:00') : new Date();
  const [view, setView] = useState({ y: init.getFullYear(), m: init.getMonth() });

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    if (open) { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onEsc); }
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const first = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  function pick(d: number) {
    const mm = String(view.m + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    onChange(`${view.y}-${mm}-${dd}`);
    setOpen(false);
  }
  function prev() { setView(v => v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }); }
  function next() { setView(v => v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }); }

  const sel = value ? new Date(value + 'T00:00:00') : null;

  return (
    <div className="flex flex-col gap-1.5" ref={ref}>
      {label && <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>}
      <div className="relative">
        <button
          type="button" disabled={disabled}
          onClick={() => !disabled && setOpen(o => !o)}
          className="w-full h-10 px-3 text-sm rounded-lg border flex items-center justify-between gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2"
          style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: value ? 'var(--color-text)' : 'var(--color-text-secondary)', ['--tw-ring-color' as any]: 'var(--color-primary-light)' }}
        >
          <span className="flex items-center gap-2 truncate">
            <Calendar size={15} style={{ color: 'var(--color-text-secondary)' }} />
            {value ? toBR(value) : placeholder}
          </span>
          {value && !disabled && (
            <X size={14} style={{ color: 'var(--color-text-secondary)' }}
              onClick={(e) => { e.stopPropagation(); onChange(''); }} />
          )}
        </button>

        {open && (
          <div className="absolute z-30 mt-1 p-3 rounded-xl border shadow-lg animate-scaleIn w-[260px]"
            style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={prev} className="p-1 rounded-md hover:bg-[var(--color-nav-hover)]"><ChevronLeft size={16} style={{ color: 'var(--color-text)' }} /></button>
              <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{MESES[view.m]} {view.y}</span>
              <button type="button" onClick={next} className="p-1 rounded-md hover:bg-[var(--color-nav-hover)]"><ChevronRight size={16} style={{ color: 'var(--color-text)' }} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DIAS.map((d, i) => <div key={i} className="text-center text-[11px] font-medium py-1" style={{ color: 'var(--color-text-secondary)' }}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((c, i) => {
                if (c === null) return <div key={i} />;
                const isSel = sel && sel.getFullYear() === view.y && sel.getMonth() === view.m && sel.getDate() === c;
                return (
                  <button key={i} type="button" onClick={() => pick(c)}
                    className="h-8 text-sm rounded-md transition-colors"
                    style={isSel
                      ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                      : { color: 'var(--color-text)' }}
                    onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.backgroundColor = 'var(--color-nav-hover)'; }}
                    onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >{c}</button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
