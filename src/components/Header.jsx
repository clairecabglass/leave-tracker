import { useState, useEffect } from 'react'
import { Moon, Sun, LogOut, CalendarDays, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Header({ activeTab, setActiveTab, dark, toggleDark }) {
  const { user, logout, isAdmin } = useAuth()

  const tabs = [
    { key: 'leave', label: 'Leave', icon: CalendarDays, show: true },
    { key: 'admin', label: 'Admin', icon: Users, show: isAdmin },
  ].filter(t => t.show)

  const btnCls = (active) =>
    `flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-150 ${
      active ? '' : 'text-black/50 hover:text-black hover:bg-black/10'
    }`

  return (
    <header style={{ backgroundColor: '#FECD28' }} className="sticky top-0 z-30 shadow-md">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-3">

          <div className="flex items-center gap-3">
            <img src="/Cabglass_logo_PNG.avif" alt="CabGlass" className="h-8 w-auto" style={{ filter: 'brightness(0)' }} />
            <span className="text-[#111111] font-bold text-sm hidden sm:inline">Employee Portal</span>
          </div>

          <nav className="flex items-center gap-1">
            {tabs.map(({ key, label, icon: Icon }) => {
              const active = activeTab === key
              return (
                <button key={key} onClick={() => setActiveTab(key)}
                  style={active ? { backgroundColor: '#111111', color: '#FECD28' } : {}}
                  className={btnCls(active)}>
                  <Icon size={15} /> {label}
                </button>
              )
            })}
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden sm:flex flex-col items-end leading-tight mr-1">
              <span className="text-[#111111] text-sm font-semibold">{user.name}</span>
              <span className="text-[#111111]/50 text-xs">{isAdmin ? 'Admin' : 'Employee'}</span>
            </span>
            <button onClick={toggleDark}
              className="p-2 rounded-md text-black/60 hover:text-black hover:bg-black/10 transition-colors"
              title={dark ? 'Light mode' : 'Dark mode'}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={logout}
              className="p-2 rounded-md text-black/60 hover:text-black hover:bg-black/10 transition-colors"
              title="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
