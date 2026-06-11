import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { useDarkMode } from './hooks/useDarkMode'
import { LIVE } from './config'
import Header from './components/Header'

export default function App() {
  const [dark, toggleDark] = useDarkMode()
  const [activeTab, setActiveTab] = useState('request')

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        dark={dark}
        toggleDark={toggleDark}
      />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-10">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-10 text-center max-w-xl mx-auto">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/20 text-[#111111] dark:text-brand">
            <CalendarDays size={28} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            CabGlass Leave Tracker
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Starter shell — theme, header and dark mode are wired up.
            Leave features (requests, approvals, calendar, vetting, policies)
            come next.
          </p>
          <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-100 dark:bg-slate-700 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span className={`h-2 w-2 rounded-full ${LIVE ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {LIVE ? 'Connected to backend' : 'Running on mock data'}
          </span>
        </div>
      </main>
    </div>
  )
}
