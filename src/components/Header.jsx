import { useState, useEffect } from 'react'
import { Moon, Sun, Maximize, Minimize } from 'lucide-react'

// Tabs are placeholders for now — leave-tracker pages get wired in later.
const TABS = [
  { key: 'request',   label: 'Request' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'calendar',  label: 'Calendar' },
  { key: 'vetting',   label: 'Vetting' },
  { key: 'policies',  label: 'Policies' },
  { key: 'admin',     label: 'Admin' },
]

export default function Header({ activeTab, setActiveTab, dark, toggleDark }) {
  const [isFs, setIsFs] = useState(false)

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.()
    } else {
      document.documentElement.requestFullscreen?.()
    }
  }

  const btnCls = (active) =>
    `px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-150 ${
      active ? '' : 'text-black/50 hover:text-black hover:bg-black/10'
    }`

  return (
    <header style={{ backgroundColor: '#FECD28' }} className="sticky top-0 z-30 shadow-md overflow-visible">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">

          <div className="flex items-center gap-3">
            <img src="/Cabglass_logo_PNG.avif" alt="CabGlass" className="h-8 w-auto" style={{ filter: 'brightness(0)' }} />
            <span className="text-[#111111] font-bold text-sm hidden sm:inline">Leave Tracker</span>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {TABS.map(({ key, label }) => {
              const active = activeTab === key
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  style={active ? { backgroundColor: '#111111', color: '#FECD28' } : {}}
                  className={btnCls(active)}
                >
                  {label}
                </button>
              )
            })}
          </nav>

          <div className="flex items-center gap-1">
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-md text-black/60 hover:text-black hover:bg-black/10 transition-colors"
              title={isFs ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFs ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
            <button
              onClick={toggleDark}
              className="p-2 rounded-md text-black/60 hover:text-black hover:bg-black/10 transition-colors"
              title={dark ? 'Light mode' : 'Dark mode'}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
