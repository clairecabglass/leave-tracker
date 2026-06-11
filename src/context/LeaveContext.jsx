import { createContext, useContext, useState, useEffect } from 'react'
import { LIVE, fetchData, apiSubmitRequest, apiDecideRequest, apiCancelRequest, apiUploadSickNote, apiDeleteSickNote } from '../api'
import { workingDays } from '../workdays'

const LeaveContext = createContext(null)

// Leave types. "Other" needs a free-text label entered at apply time.
export const LEAVE_TYPES = ['Annual', 'Sick', 'Family Responsibility', 'Unpaid', 'Other']

export const STATUS = {
  PENDING:  'Pending',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
}

const REQUESTS_KEY = 'leave_requests'
const NOTES_KEY = 'leave_sicknotes'

// Leave counts WORKING days (excludes weekends + SA public holidays); `half`
// makes a single working day count as 0.5.
export function countDays(startDate, endDate, half = false) {
  return workingDays(startDate, endDate, half)
}

function loadList(key) {
  try { const raw = localStorage.getItem(key); if (raw) { const l = JSON.parse(raw); if (Array.isArray(l)) return l } } catch (e) {}
  return []
}

export function LeaveProvider({ children }) {
  const [requests, setRequests] = useState(() => loadList(REQUESTS_KEY))
  const [sickNotes, setSickNotes] = useState(() => loadList(NOTES_KEY))

  useEffect(() => { localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests)) }, [requests])
  useEffect(() => { localStorage.setItem(NOTES_KEY, JSON.stringify(sickNotes)) }, [sickNotes])

  const refresh = async () => {
    if (!LIVE) return
    try {
      const data = await fetchData()
      if (data && data.requests) setRequests(data.requests)
      if (data && data.sickNotes) setSickNotes(data.sickNotes)
    } catch (err) { console.error('Load leave data failed:', err) }
  }
  useEffect(() => { refresh() }, [])

  const submitRequest = ({ employee, type, otherLabel, startDate, endDate, reason, halfDay }) => {
    const req = {
      id: Date.now(),
      employeeId: employee.id,
      employeeName: employee.name,
      approverId: employee.approverId ?? null,
      type,
      otherLabel: type === 'Other' ? (otherLabel || '').trim() : '',
      startDate, endDate,
      halfDay: !!halfDay,
      days: countDays(startDate, endDate, halfDay),
      reason: (reason || '').trim(),
      status: STATUS.PENDING,
      submittedAt: new Date().toISOString(),
      decidedBy: '', decidedAt: '', decisionNote: '',
    }
    setRequests(prev => [req, ...prev])
    if (LIVE) apiSubmitRequest(req).then(refresh).catch(err => console.error('Submit failed:', err))
    return req
  }

  const decideRequest = (id, status, deciderName, note = '') => {
    setRequests(prev => prev.map(r => r.id === id
      ? { ...r, status, decidedBy: deciderName, decidedAt: new Date().toISOString(), decisionNote: note } : r))
    if (LIVE) apiDecideRequest(id, status, deciderName, note).then(refresh).catch(err => console.error('Decide failed:', err))
  }

  // Revert an approved/declined request back to Pending (approver fixed a mistake).
  const undoRequest = (id) => {
    setRequests(prev => prev.map(r => r.id === id
      ? { ...r, status: STATUS.PENDING, decidedBy: '', decidedAt: '', decisionNote: '' } : r))
    if (LIVE) apiDecideRequest(id, STATUS.PENDING, '', '').then(refresh).catch(err => console.error('Undo failed:', err))
  }

  const cancelRequest = (id) => {
    setRequests(prev => prev.filter(r => r.id !== id))
    if (LIVE) apiCancelRequest(id).then(refresh).catch(err => console.error('Cancel failed:', err))
  }

  // ── Sick notes (doctor's papers) ──
  // `file` = { name, mimeType, dataBase64 }; `label` = the display name chosen.
  const uploadSickNote = async ({ employee, label, file }) => {
    const note = {
      id: Date.now(),
      employeeId: employee.id,
      employeeName: employee.name,
      label: (label || file.name || 'Sick note').trim(),
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      link: '',
    }
    if (LIVE) {
      try {
        const res = await apiUploadSickNote({ ...note, mimeType: file.mimeType, dataBase64: file.dataBase64 })
        if (res && res.error) return res
        await refresh()
        return { ok: true }
      } catch (err) { console.error('Upload failed:', err); return { error: 'Upload failed.' } }
    }
    setSickNotes(prev => [note, ...prev]) // mock mode: metadata only
    return { ok: true }
  }

  const deleteSickNote = (id) => {
    setSickNotes(prev => prev.filter(n => n.id !== id))
    if (LIVE) apiDeleteSickNote(id).then(refresh).catch(err => console.error('Delete note failed:', err))
  }

  return (
    <LeaveContext.Provider value={{
      requests, sickNotes,
      submitRequest, decideRequest, undoRequest, cancelRequest,
      uploadSickNote, deleteSickNote, refresh,
    }}>
      {children}
    </LeaveContext.Provider>
  )
}

export function useLeave() {
  return useContext(LeaveContext)
}
