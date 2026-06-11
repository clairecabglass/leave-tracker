import { STATUS } from '../context/LeaveContext'

const STYLES = {
  [STATUS.PENDING]:  'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  [STATUS.APPROVED]: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  [STATUS.DECLINED]: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}
