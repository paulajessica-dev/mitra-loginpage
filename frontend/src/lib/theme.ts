// Tema claro/escuro — controlado por classe .dark no <html>.
// Persiste a escolha do usuário; sem escolha, segue a preferência do sistema.
export type Theme = 'light' | 'dark';
const KEY = 'misa-theme';

export function getTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', t === 'dark');
}

export function setTheme(t: Theme): void {
  localStorage.setItem(KEY, t);
  applyTheme(t);
}

export function initTheme(): void {
  applyTheme(getTheme());
}
