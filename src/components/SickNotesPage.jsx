import { useState, useMemo, useRef } from 'react'
import { Upload, FileText, Trash2, ExternalLink, Inbox } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLeave } from '../context/LeaveContext'

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// Read a File into base64 (without the data: prefix) for the Apps Script upload.
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function SickNotesPage() {
  const { user, isAdmin } = useAuth()
  const { sickNotes, uploadSickNote, deleteSickNote } = useLeave()
  const [label, setLabel] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const visible = useMemo(
    () => isAdmin ? sickNotes : sickNotes.filter(n => n.employeeId === user.id),
    [sickNotes, isAdmin, user.id]
  )

  const onFile = (f) => {
    setFile(f)
    if (f && !label) setLabel(f.name.replace(/\.[^.]+$/, ''))
  }

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setMsg('')
    if (!file) { setError('Choose a file to upload.'); return }
    setBusy(true)
    try {
      const dataBase64 = await readFile(file)
      const res = await uploadSickNote({
        employee: user,
        label: label || file.name,
        file: { name: file.name, mimeType: file.type, dataBase64 },
      })
      if (res?.error) { setError(res.error); return }
      setLabel(''); setFile(null); if (fileRef.current) fileRef.current.value = ''
      setMsg('Sick note uploaded.')
      setTimeout(() => setMsg(''), 3500)
    } finally { setBusy(false) }
  }

  const inputCls = 'w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/40 transition-colors'

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Upload */}
      <div className="lg:col-span-2">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
            <Upload size={18} className="text-brand-dark" /> Upload a sick note
          </h2>
          <p className="text-xs text-slate-400 mb-5">Attach a doctor's note. You can give it a name.</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Name this note</label>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Dr Smith — 12 June" className={inputCls} />
            </div>
            {/* Drop box */}
            <label
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]) }}
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl px-4 py-8 cursor-pointer hover:border-brand hover:bg-brand/5 transition-colors text-center">
              <FileText size={22} className="text-slate-400" />
              {file ? (
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 break-all">{file.name}</span>
              ) : (
                <span className="text-sm text-slate-500 dark:text-slate-400">Drop a file here or <span className="text-brand-dark font-semibold">browse</span></span>
              )}
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.heic,.doc,.docx"
                onChange={e => onFile(e.target.files[0])} />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {msg && <p className="text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}
            <button type="submit" disabled={busy} style={{ backgroundColor: '#FECD28' }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-[#111111] disabled:opacity-50 hover:brightness-95 transition-all">
              {busy ? <span className="w-4 h-4 border-2 border-[#111111]/30 border-t-[#111111] rounded-full animate-spin" /> : <Upload size={15} />}
              {busy ? 'Uploading…' : 'Upload'}
            </button>
          </form>
        </div>
      </div>

      {/* List */}
      <div className="lg:col-span-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{isAdmin ? 'All sick notes' : 'My sick notes'}</h2>
          </div>
          {visible.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <Inbox size={28} className="mx-auto mb-2" />
              <p className="text-sm">No sick notes uploaded yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {visible.map(n => (
                <li key={n.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText size={18} className="text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{n.label}</div>
                      <p className="text-xs text-slate-400">
                        {isAdmin && <span className="text-slate-500 dark:text-slate-300">{n.employeeName} · </span>}
                        {n.fileName} · {fmt(n.uploadedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {n.link && (
                      <a href={n.link} target="_blank" rel="noreferrer" title="Open file"
                        className="p-2 rounded-lg text-slate-400 hover:text-brand-dark hover:bg-brand/10 transition-colors">
                        <ExternalLink size={16} />
                      </a>
                    )}
                    {(isAdmin || n.employeeId === user.id) && (
                      <button onClick={() => { if (window.confirm('Delete this sick note?')) deleteSickNote(n.id) }} title="Delete"
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
