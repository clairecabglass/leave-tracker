import { BookText, ExternalLink } from 'lucide-react'

// Policies & Processes. For now a placeholder — will become a link to the Google
// Drive folder holding the policy documents once Claire supplies it.
const DRIVE_URL = '' // paste the Drive folder URL here later

export default function PPPage() {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-10 text-center max-w-xl mx-auto">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/20 text-[#111111] dark:text-brand">
        <BookText size={28} />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Policies &amp; Processes</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Company policy and process documents will live here.
      </p>
      {DRIVE_URL ? (
        <a href={DRIVE_URL} target="_blank" rel="noreferrer"
          style={{ backgroundColor: '#FECD28' }}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-[#111111] hover:brightness-95 transition-all">
          <ExternalLink size={15} /> Open the P&amp;P folder
        </a>
      ) : (
        <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-100 dark:bg-slate-700 px-3 py-1 text-xs font-semibold text-slate-500 dark:text-slate-300">
          Drive folder link coming soon
        </span>
      )}
    </div>
  )
}
