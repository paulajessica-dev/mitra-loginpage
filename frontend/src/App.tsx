import { useState } from 'react'
import { isSankhyaLinked, setSankhyaLinked } from './lib/sankhya'
import PortalPage from './pages/PortalPage'
import DashboardPage from './pages/DashboardPage'
import FluxoCaixaPage from './pages/FluxoCaixaPage'
import SankhyaGate from './components/SankhyaGate'
import type { View } from './components/Layout'

// App PUBLICO (tela publica): sem login Mitra. A porta de entrada e o login do Sankhya.
function App() {
  const [sankhyaOk, setSankhyaOk] = useState(isSankhyaLinked)
  const [view, setView] = useState<View>('dashboard')

  function logout() {
    setSankhyaLinked(false)
    setSankhyaOk(false)
  }

  if (!sankhyaOk) return <SankhyaGate onLinked={() => setSankhyaOk(true)} onSair={logout} />
  if (view === 'dashboard') return <DashboardPage onLogout={logout} onNavigate={setView} />
  if (view === 'fluxo') return <FluxoCaixaPage onLogout={logout} onNavigate={setView} />
  return <PortalPage onLogout={logout} onNavigate={setView} />
}

export default App
