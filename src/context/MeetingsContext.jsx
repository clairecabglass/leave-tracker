import { createContext, useContext, useState, useEffect } from 'react'
import { LIVE, fetchData, apiAddAgendaItem, apiDeleteAgendaItem, apiAddMeeting, apiUpdateMeeting, apiDeleteMeeting } from '../api'

const MeetingsContext = createContext(null)

const MEETINGS_KEY = 'leave_meetings'
const AGENDA_KEY = 'leave_agenda'

function loadList(key) {
  try { const raw = localStorage.getItem(key); if (raw) { const l = JSON.parse(raw); if (Array.isArray(l)) return l } } catch (e) {}
  return []
}

export function MeetingsProvider({ children }) {
  const [meetings, setMeetings] = useState(() => loadList(MEETINGS_KEY))
  const [agenda, setAgenda] = useState(() => loadList(AGENDA_KEY))

  useEffect(() => { localStorage.setItem(MEETINGS_KEY, JSON.stringify(meetings)) }, [meetings])
  useEffect(() => { localStorage.setItem(AGENDA_KEY, JSON.stringify(agenda)) }, [agenda])

  const refresh = async () => {
    if (!LIVE) return
    try {
      const data = await fetchData()
      if (data && data.meetings) setMeetings(data.meetings)
      if (data && data.agenda) setAgenda(data.agenda)
    } catch (err) { console.error('Load meetings failed:', err) }
  }
  useEffect(() => { refresh() }, [])

  // ── Agenda (To talk about) — everyone can add ──
  const addAgendaItem = ({ text, user }) => {
    const item = { id: Date.now(), text: text.trim(), addedBy: user.name, addedById: user.id, createdAt: new Date().toISOString() }
    setAgenda(prev => [...prev, item])
    if (LIVE) apiAddAgendaItem(item).then(refresh).catch(err => console.error('Add agenda failed:', err))
    return item
  }
  const deleteAgendaItem = (id) => {
    setAgenda(prev => prev.filter(a => a.id !== id))
    if (LIVE) apiDeleteAgendaItem(id).then(refresh).catch(err => console.error('Delete agenda failed:', err))
  }

  // ── Meetings — editors/admins only ──
  const addMeeting = ({ date, title, notes, user, clearAgenda }) => {
    const m = { id: Date.now(), date, title: title.trim(), notes, createdBy: user.name, updatedAt: new Date().toISOString() }
    setMeetings(prev => [m, ...prev])
    if (LIVE) apiAddMeeting(m).then(refresh).catch(err => console.error('Add meeting failed:', err))
    // Optionally clear the agenda once it's been carried into the meeting.
    if (clearAgenda) agenda.forEach(a => deleteAgendaItem(a.id))
    return m
  }
  const updateMeeting = (id, patch) => {
    setMeetings(prev => prev.map(m => m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m))
    if (LIVE) apiUpdateMeeting(id, patch).then(refresh).catch(err => console.error('Update meeting failed:', err))
  }
  const deleteMeeting = (id) => {
    setMeetings(prev => prev.filter(m => m.id !== id))
    if (LIVE) apiDeleteMeeting(id).then(refresh).catch(err => console.error('Delete meeting failed:', err))
  }

  return (
    <MeetingsContext.Provider value={{ meetings, agenda, addAgendaItem, deleteAgendaItem, addMeeting, updateMeeting, deleteMeeting, refresh }}>
      {children}
    </MeetingsContext.Provider>
  )
}

export function useMeetings() {
  return useContext(MeetingsContext)
}
