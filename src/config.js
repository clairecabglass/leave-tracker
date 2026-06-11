// Live backend config — set these in Vercel (Project → Settings → Environment Variables)
// or in a local .env file. When the URL is blank the app runs on mock data.
//
//   VITE_API_URL    = https://script.google.com/macros/s/XXXX/exec
//   VITE_API_SECRET = the same string you set as DASHBOARD_SECRET in Apps Script

export const API_URL = import.meta.env.VITE_API_URL || ''
export const API_SECRET = import.meta.env.VITE_API_SECRET || ''
export const LIVE = Boolean(API_URL && API_SECRET)
