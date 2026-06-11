import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Eye, EyeOff, LogIn } from 'lucide-react'

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const loggedInUser = await login(username, password)
    if (!loggedInUser) setError('Incorrect username or password.')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4 transition-colors">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-700">

          <div style={{ backgroundColor: '#FECD28' }} className="px-8 py-6 flex flex-col items-center gap-2">
            <img src="/Cabglass_logo_PNG.avif" alt="CabGlass" className="h-10 w-auto" style={{ filter: 'brightness(0)' }} />
            <p className="text-[#111111]/60 text-sm font-medium">Employee Portal</p>
          </div>

          <div className="px-8 py-7">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-6">Sign in</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} required
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none placeholder:text-slate-400 transition-colors"
                  onFocus={e => e.target.style.boxShadow = '0 0 0 3px rgba(254,205,40,0.3)'}
                  onBlur={e => e.target.style.boxShadow = ''}
                  placeholder="Enter your username" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                    className="w-full px-3 py-2.5 pr-10 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none placeholder:text-slate-400 transition-colors"
                    onFocus={e => e.target.style.boxShadow = '0 0 0 3px rgba(254,205,40,0.3)'}
                    onBlur={e => e.target.style.boxShadow = ''}
                    placeholder="Enter your password" />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</p>}
              <button type="submit" disabled={loading || !username || !password}
                style={{ backgroundColor: '#FECD28' }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-[#111111] disabled:opacity-50 hover:brightness-95 transition-all mt-2">
                {loading
                  ? <span className="w-4 h-4 border-2 border-[#111111]/30 border-t-[#111111] rounded-full animate-spin" />
                  : <LogIn size={15} />}
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">CabGlass Employee Portal © 2026</p>
      </div>
    </div>
  )
}
