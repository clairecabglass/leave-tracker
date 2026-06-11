import { useState, useEffect, useRef } from 'react'
import { Moon, Sun, LogOut, ChevronDown, CalendarDays, BookText, Users, ExternalLink } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

// Sub-pages that live under the "Leave" dropdown.
const LEAVE_TABS = ['apply', 'approvals', 'sicknotes']
const LABELS = {
  apply: 'Apply', approvals: 'Approvals', sicknotes: 'Sick Notes',
  calendar: 'Calendar', admin: 'Admin',
}

// Policies & Processes — opens the Google Drive folder in a new tab.
const PP_URL = 'https://drive.google.com/drive/u/0/folders/1QSfbreN1-gr1uJRWVyr0P9s0yn0kK0Ii'

export default function Header({ activeTab, setActiveTab, dark, toggleDark }) {
  const { user, logout, isAdmin, isApprover } = useAuth()
  const [leaveOpen, setLeaveOpen] = useState(false)
  const ddRef = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ddRef.current && !ddRef.current.contains(e.target)) setLeaveOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const leaveItems = [
    { key: 'apply',     show: true },
    { key: 'approvals', show: isApprover || isAdmin },
    { key: 'sicknotes', show: true },
  ].filter(t => t.show)

  const flatTabs = [
    { key: 'calendar', label: 'Calendar', icon: CalendarDays, show: true },
    { key: 'pp',       label: 'P&P',      icon: BookText,     show: true, href: PP_URL },
    { key: 'admin',    label: 'Admin',    icon: Users,        show: isAdmin },
  ].filter(t => t.show)

  const leaveActive = LEAVE_TABS.includes(activeTab)
  const btnCls = (active) =>
    `flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-semibold transition-all duration-150 ${
      active ? '' : 'text-black/50 hover:text-black hover:bg-black/10'
    }`

  return (
    <header style={{ backgroundColor: '#FECD28' }} className="sticky top-0 z-30 shadow-md overflow-visible">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-3">
          <div className="flex items-center gap-3">
            <img src="/Cabglass_logo_PNG.avif" alt="CabGlass" className="h-8 w-auto" style={{ filter: 'brightness(0)' }} />
            <span className="text-[#111111] font-bold text-sm hidden sm:inline">Employee Portal</span>
          </div>

          <nav className="flex items-center gap-1">
            {/* Leave dropdown */}
            <div className="relative" ref={ddRef}>
              <button onClick={() => setLeaveOpen(o => !o)}
                style={leaveActive ? { backgroundColor: '#111111', color: '#FECD28' } : {}}
                className={btnCls(leaveActive)}>
                Leave <ChevronDown size={13} className={`transition-transform ${leaveOpen ? 'rotate-180' : ''}`} />
              </button>
              {leaveOpen && (
                <div className="absolute left-0 top-full mt-2 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 py-1 min-w-[150px] z-[100]">
                  {leaveItems.map(({ key }) => (
                    <button key={key} onClick={() => { setActiveTab(key); setLeaveOpen(false) }}
                      className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === key
                          ? 'bg-[#FECD28]/20 text-[#111111] dark:text-white font-semibold'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                      {LABELS[key]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {flatTabs.map(({ key, label, icon: Icon, href }) => {
              if (href) {
                return (
                  <a key={key} href={href} target="_blank" rel="noreferrer" className={btnCls(false)} title="Opens in a new tab">
                    <Icon size={15} /> <span className="hidden sm:inline">{label}</span>
                    <ExternalLink size={11} className="opacity-60" />
                  </a>
                )
              }
              const active = activeTab === key
              return (
                <button key={key} onClick={() => setActiveTab(key)}
                  style={active ? { backgroundColor: '#111111', color: '#FECD28' } : {}}
                  className={btnCls(active)}>
                  <Icon size={15} /> <span className="hidden sm:inline">{label}</span>
                </button>
              )
            })}
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden sm:flex flex-col items-end leading-tight mr-1">
              <span className="text-[#111111] text-sm font-semibold">{user.name}</span>
              <span className="text-[#111111]/50 text-xs">{isAdmin ? 'Admin' : isApprover ? 'Approver' : 'Employee'}</span>
            </span>
            <button onClick={toggleDark} className="p-2 rounded-md text-black/60 hover:text-black hover:bg-black/10 transition-colors" title={dark ? 'Light mode' : 'Dark mode'}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={logout} className="p-2 rounded-md text-black/60 hover:text-black hover:bg-black/10 transition-colors" title="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
