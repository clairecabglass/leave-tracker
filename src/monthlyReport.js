// Builds the monthly leave-taken report as a branded PDF.
//   Rows  = employees (boss/admins excluded), down the left.
//   Cols  = each leave type, showing days TAKEN that month ("-" if none).
// Only APPROVED leave counts, and days are clamped to the selected month.
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { LEAVE_TYPES, STATUS } from './context/LeaveContext'

const BRAND = [254, 205, 40]   // #FECD28
const INK = [17, 17, 17]       // #111111

const parseLocal = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d) }

// Days of one request that fall inside [mStart, mEnd], inclusive.
function daysInMonth(r, mStart, mEnd) {
  const s = parseLocal(r.startDate), e = parseLocal(r.endDate)
  if (isNaN(s) || isNaN(e)) return 0
  const a = s > mStart ? s : mStart
  const b = e < mEnd ? e : mEnd
  if (b < a) return 0
  return Math.round((b - a) / 86400000) + 1
}

// Load the logo and convert to a PNG data URL (jsPDF can't embed AVIF directly).
async function loadLogo() {
  try {
    const img = new Image()
    img.src = '/Cabglass_logo_PNG.avif'
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    // Solid-black wordmark (mirrors the app's brightness(0) treatment) so it
    // reads crisply on the white page — keep transparency, force RGB to black.
    try {
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < px.data.length; i += 4) {
        if (px.data[i + 3] > 0) { px.data[i] = 17; px.data[i + 1] = 17; px.data[i + 2] = 17 }
      }
      ctx.putImageData(px, 0, 0)
    } catch (e) { /* cross-origin taint — fall back to the raw logo */ }
    return { dataUrl: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight }
  } catch (e) { return null }
}

export async function downloadMonthlyPdf({ month, users, requests }) {
  const [y, m] = month.split('-').map(Number)
  const mStart = new Date(y, m - 1, 1)
  const mEnd = new Date(y, m, 0)
  const monthLabel = mStart.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })

  // Staff rows: everyone except admins (the boss Noel + the system admin), sorted.
  const staff = users
    .filter(u => u.role !== 'admin')
    .sort((a, b) => a.name.localeCompare(b.name))

  const approved = requests.filter(r => r.status === STATUS.APPROVED)

  const head = [['Employee', ...LEAVE_TYPES, 'Total']]
  const body = staff.map(u => {
    const mine = approved.filter(r => r.employeeId === u.id)
    let total = 0
    const cells = LEAVE_TYPES.map(type => {
      const days = mine.filter(r => r.type === type).reduce((s, r) => s + daysInMonth(r, mStart, mEnd), 0)
      total += days
      return days ? String(days) : '-'
    })
    return [u.name, ...cells, total ? String(total) : '-']
  })

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()

  // Logo (left) + title (right of it).
  const logo = await loadLogo()
  let headerBottom = 18
  if (logo) {
    const w = 42, h = w * (logo.h / logo.w)
    doc.addImage(logo.dataUrl, 'PNG', 14, 12, w, h)
    headerBottom = Math.max(headerBottom, 12 + h)
  }
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
  doc.text('Monthly Leave Report', pageW - 14, 20, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12)
  doc.setTextColor(90, 90, 90)
  doc.text(monthLabel, pageW - 14, 28, { align: 'right' })
  doc.setFontSize(9)
  doc.text(`Generated ${new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    pageW - 14, 34, { align: 'right' })

  autoTable(doc, {
    head, body,
    startY: headerBottom + 8,
    margin: { left: 14, right: 14 },
    styles: { fontSize: 9, cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: { fillColor: BRAND, textColor: INK, fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 38 } },
    bodyStyles: { halign: 'center' },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    didParseCell: (data) => { if (data.column.index === 0) data.cell.styles.halign = 'left' },
  })

  doc.setFontSize(8); doc.setTextColor(150, 150, 150)
  doc.text('CabGlass — leave taken (approved). Days shown fall within the selected month.',
    14, doc.internal.pageSize.getHeight() - 10)

  doc.save(`CabGlass-Leave-${month}.pdf`)
}
