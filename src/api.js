// Thin client for the Apps Script backend. When LIVE is false (no API_URL /
// API_SECRET configured) the app runs entirely on localStorage instead — see
// AuthContext / LeaveContext.
import { API_URL, API_SECRET, LIVE } from './config'

async function apiGet(action, params = {}) {
  const url = new URL(API_URL)
  url.searchParams.set('action', action)
  url.searchParams.set('secret', API_SECRET)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString())
  return res.json()
}

// Writes use text/plain to dodge the CORS preflight Apps Script can't answer.
async function apiPost(action, payload = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, secret: API_SECRET, ...payload }),
  })
  return res.json()
}

export { LIVE }

export const ping            = () => apiGet('ping')
export const fetchData       = () => apiGet('getData')
export const apiLogin        = (username, password) => apiPost('login', { username, password })
export const apiSubmitRequest= (request) => apiPost('submitRequest', { request })
export const apiDecideRequest= (id, status, deciderName) => apiPost('decideRequest', { id, status, deciderName })
export const apiCancelRequest= (id) => apiPost('cancelRequest', { id })
export const apiAddUser      = (user) => apiPost('addUser', { user })
export const apiUpdateUser   = (id, patch) => apiPost('updateUser', { id, patch })
export const apiDeleteUser   = (id) => apiPost('deleteUser', { id })
export const apiUploadSickNote = (note) => apiPost('uploadSickNote', { note })
export const apiDeleteSickNote = (id) => apiPost('deleteSickNote', { id })
export const apiFinalizeMonth = (payload) => apiPost('finalizeMonth', payload)
export const apiAddAgendaItem = (item) => apiPost('addAgendaItem', { item })
export const apiDeleteAgendaItem = (id) => apiPost('deleteAgendaItem', { id })
export const apiAddMeeting = (meeting) => apiPost('addMeeting', { meeting })
export const apiUpdateMeeting = (id, patch) => apiPost('updateMeeting', { id, patch })
export const apiDeleteMeeting = (id) => apiPost('deleteMeeting', { id })
