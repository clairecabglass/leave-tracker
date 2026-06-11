import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LeaveProvider } from './context/LeaveContext'
import { useDarkMode } from './hooks/useDarkMode'
import Header from './components/Header'
import LoginPage from './components/LoginPage'
import LeavePage from './components/LeavePage'
import AdminPage from './components/AdminPage'

function Portal() {
  const { user, isAdmin } = useAuth()
  const [dark, toggleDark] = useDarkMode()
  const [activeTab, setActiveTab] = useState('leave')

  // Non-admins can never sit on the admin tab.
  useEffect(() => {
    if (!isAdmin && activeTab === 'admin') setActiveTab('leave')
  }, [isAdmin, activeTab])

  if (!user) return <LoginPage />

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} dark={dark} toggleDark={toggleDark} />
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'admin' && isAdmin ? <AdminPage /> : <LeavePage />}
      </main>
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
