import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LeaveProvider } from './context/LeaveContext'
import { useDarkMode } from './hooks/useDarkMode'
import Header from './components/Header'
import LoginPage from './components/LoginPage'
import ApplyPage from './components/ApplyPage'
import ApprovalsPage from './components/ApprovalsPage'
import CalendarPage from './components/CalendarPage'
import AdminPage from './components/AdminPage'

function Portal() {
  const { user, isAdmin, isApprover } = useAuth()
  const [dark, toggleDark] = useDarkMode()
  const [activeTab, setActiveTab] = useState('apply')

  // Drop the user onto Apply if they land on a tab they can't see.
  useEffect(() => {
    if (activeTab === 'admin' && !isAdmin) setActiveTab('apply')
    if (activeTab === 'approvals' && !(isApprover || isAdmin)) setActiveTab('apply')
  }, [isAdmin, isApprover, activeTab])

  if (!user) return <LoginPage />

  const page =
    activeTab === 'admin' && isAdmin ? <AdminPage />
    : activeTab === 'approvals' && (isApprover || isAdmin) ? <ApprovalsPage />
    : activeTab === 'calendar' ? <CalendarPage />
    : <ApplyPage />

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} dark={dark} toggleDark={toggleDark} />
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">{page}</main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <LeaveProvider>
        <Portal />
      </LeaveProvider>
    </AuthProvider>
  )
}
