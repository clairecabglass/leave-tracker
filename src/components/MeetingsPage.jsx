import { useState } from 'react'
import { MessageSquarePlus, Trash2, Plus, Pencil, Inbox, NotebookPen, ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useMeetings } from '../context/MeetingsContext'

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function MeetingsPage() {
  const { user, canEditMeetings } = useAuth()
  const { meetings, agenda, addAgendaItem, deleteAgendaItem, addMeeting, updateMeeting, deleteMeeting } = useMeetings()

  const [newItem, setNewItem] = useState('')
  const [composing, setComposing] = useState(false)
  const today = new Date()
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const [draft, setDraft] = useState({ date: ymd(today), title: '', notes: '', carry: true })
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({})
  const [openId, setOpenId] = useState(null)

  const inputCls = 'w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/40 transition-colors'

  const sortedMeetings = [...meetings].sort((a, b) => new Date(b.date) - new Date(a.date))

  const addItem = (e) => {
    e.preventDefault()
    if (!newItem.trim()) return
    addAgendaItem({ text: newItem, user })
    setNewItem('')
  }

  const agendaText = () => agenda.map(a => `• ${a.text} (${a.addedBy})`).join('\n')

  const startMeeting = () => {
    setDraft({ date: ymd(today), title: '', notes: agenda.length ? `To talk about:\n${agendaText()}\n\n— Notes —\n` : '', carry: true })
    setComposing(true)
  }
  const saveMeeting = () => {
    if (!draft.title.trim() && !draft.notes.trim()) { setComposing(false); return }
    addMeeting({ date: draft.date, title: draft.title || 'Meeting', notes: draft.notes, user, clearAgenda: draft.carry })
    setComposing(false)
  }

  const startEdit = (m) => { setEditingId(m.id); setEditDraft({ date: m.date, title: m.title, notes: m.notes }); setOpenId(m.id) }
  const saveEdit = () => { updateMeeting(editingId, { date: editDraft.date, title: editDraft.title, notes: editDraft.notes }); setEditingId(null) }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* To talk about */}
      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
            <MessageSquarePlus size={18} className="text-brand-dark" /> To talk about
          </h2>
          <p className="text-xs text-slate-400 mb-4">Anyone can add a point for the next meeting.</p>
          <form onSubmit={addItem} className="flex gap-2 mb-4">
            <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Add a discussion point…" className={inputCls} />
            <button type="submit" style={{ backgroundColor: '#FECD28' }}
              className="shrink-0 inline-flex items-center gap-1 px-3 rounded-xl text-sm font-bold text-[#111111] hover:brightness-95 transition-all">
              <Plus size={16} />
            </button>
          </form>
          {agenda.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              <Inbox size={24} className="mx-auto mb-2" />
              <p className="text-sm">Nothing on the list yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {agenda.map(a => (
                <li key={a.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800 dark:text-slate-100">{a.text}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{a.addedBy} · {fmt(a.createdAt)}</p>
                  </div>
                  {(canEditMeetings || a.addedById === user.id) && (
                    <button onClick={() => deleteAgendaItem(a.id)} title="Remove"
                      className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Meeting log */}
      <div className="lg:col-span-3 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
            <NotebookPen size={18} className="text-brand-dark" /> Meeting notes
          </h2>
          {canEditMeetings && !composing && (
            <button onClick={startMeeting} style={{ backgroundColor: '#FECD28' }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-[#111111] hover:brightness-95 transition-all">
              <Plus size={15} /> New meeting
            </button>
          )}
        </div>

        {/* Composer */}
        {composing && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6 space-y-3">
            <div className="flex gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Date</label>
                <input type="date" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} className={inputCls} />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Title</label>
                <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="e.g. Weekly catch-up" className={inputCls} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Notes</label>
              <textarea value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} rows={10} className={inputCls + ' resize-y font-mono text-xs leading-relaxed'} />
            </div>
            {agenda.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={draft.carry} onChange={e => setDraft(d => ({ ...d, carry: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/40" />
                Clear the "To talk about" list once saved
              </label>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setComposing(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Cancel</button>
              <button onClick={saveMeeting} style={{ backgroundColor: '#FECD28' }} className="px-5 py-2 rounded-xl text-sm font-bold text-[#111111] hover:brightness-95 transition-all">Save meeting</button>
            </div>
          </div>
        )}

        {sortedMeetings.length === 0 && !composing ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-10 text-center text-slate-400">
            <Inbox size={28} className="mx-auto mb-2" />
            <p className="text-sm">No meeting notes yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedMeetings.map(m => {
              const open = openId === m.id
              const editing = editingId === m.id
              return (
                <div key={m.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
                  {editing ? (
                    <div className="p-6 space-y-3">
                      <div className="flex gap-3">
                        <input type="date" value={editDraft.date} onChange={e => setEditDraft(d => ({ ...d, date: e.target.value }))} className={inputCls + ' max-w-[160px]'} />
                        <input value={editDraft.title} onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))} className={inputCls} />
                      </div>
                      <textarea value={editDraft.notes} onChange={e => setEditDraft(d => ({ ...d, notes: e.target.value }))} rows={10} className={inputCls + ' resize-y font-mono text-xs leading-relaxed'} />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingId(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Cancel</button>
                        <button onClick={saveEdit} style={{ backgroundColor: '#FECD28' }} className="px-5 py-2 rounded-xl text-sm font-bold text-[#111111] hover:brightness-95 transition-all">Save</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="px-5 py-3.5 flex items-center justify-between gap-3">
                        <button onClick={() => setOpenId(open ? null : m.id)} className="flex items-center gap-2 min-w-0 text-left">
                          {open ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                          <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{m.title}</span>
                          <span className="text-xs text-slate-400 shrink-0">{fmt(m.date)}</span>
                        </button>
                        {canEditMeetings && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => startEdit(m)} title="Edit" className="p-1.5 rounded-lg text-slate-400 hover:text-brand-dark hover:bg-brand/10 transition-colors"><Pencil size={15} /></button>
                            <button onClick={() => { if (window.confirm('Delete this meeting?')) deleteMeeting(m.id) }} title="Delete" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 size={15} /></button>
                          </div>
                        )}
                      </div>
                      {open && (
                        <div className="px-5 pb-5 pt-1 border-t border-slate-100 dark:border-slate-700">
                          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 dark:text-slate-200 mt-3">{m.notes || <span className="text-slate-400">No notes.</span>}</pre>
                          <p className="text-xs text-slate-400 mt-3">Last edited by {m.createdBy} · {fmt(m.updatedAt)}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
