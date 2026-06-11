import { createContext, useContext, useState, useEffect } from 'react'

const LeaveContext = createContext(null)

// Starter leave types — confirm the company's actual BCEA categories with the boss.
export const LEAVE_TYPES = ['Annual', 'Sick', 'Family Responsibility', 'Unpaid']

export const STATUS = {
  PENDING:  'Pending',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
}

const REQUESTS_KEY = 'leave_requests'

// Whole days between two ISO dates, inclusive.
export function countDays(startDate, endDate) {
  if (!startDate || !endDate) return 0
  const a = new Date(startDate)
  const b = new Date(endDate)
  if (isNaN(a) || isNaN(b) || b < a) return 0
  return Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1
}

function loadRequests() {
  try {
    const raw = localStorage.getItem(REQUESTS_KEY)
    if (raw) {
      const list = JSON.parse(raw)
      if (Array.isArray(list)) return list
    }
  } catch (e) { /* ignore */ }
  return []
}

export function LeaveProvider({ children }) {
  const [requests, setRequests] = useState(loadRequests)

  useEffect(() => {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests))
  }, [requests])

  const submitRequest = ({ employee, type, startDate, endDate, reason }) => {
    const req = {
      id: Date.now(),
      employeeId: employee.id,
      employeeName: employee.name,
      type,
      startDate,
      endDate,
      days: countDays(startDate, endDate),
      reason: reason.trim(),
      status: STATUS.PENDING,
      submittedAt: new Date().toISOString(),
      decidedBy: '',
      decidedAt: '',
    }
    setRequests(prev => [req, ...prev])
    return req
  }

  const decideRequest = (id, status, deciderName) => {
    setRequests(prev => prev.map(r => r.id === id
      ? { ...r, status, decidedBy: deciderName, decidedAt: new Date().toISOString() }
      : r))
  }

  const cancelRequest = (id) => {
    setRequests(prev => prev.filter(r => r.id !== id))
  }

  return (
    <LeaveContext.Provider value={{ requests, submitRequest, decideRequest, cancelRequest }}>
      {children}
    </LeaveContext.Provider>
  )
}

export function useLeave() {
  return useContext(LeaveContext)
}
