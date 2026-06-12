// Builds the monthly leave-taken report as a branded PDF.
//   Rows  = employees (boss/admins excluded), down the left.
//   Cols  = each leave type, showing days TAKEN that month ("-" if none).
// Only APPROVED leave counts, and days are clamped to the selected month.
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { LEAVE_TYPES, STATUS } from './context/LeaveContext'
import { workingDays, isoLocal } from './workdays'

const BRAND = [254, 205, 40]   // #FECD28
const INK = [17, 17, 17]       // #111111

const parseLocal = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d) }
const fmtD = (d) => d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })

// Working days of one request that fall inside [rStart, rEnd], inclusive.
function daysInRange(r, rStart, rEnd) {
  const s = parseLocal(r.startDate), e = parseLocal(r.endDate)
  if (isNaN(s) || isNaN(e)) return 0
  const a = s > rStart ? s : rStart
  const b = e < rEnd ? e : rEnd
  if (b < a) return 0
  return workingDays(isoLocal(a), isoLocal(b), r.halfDay && isoLocal(s) === isoLocal(e))
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

// Builds the jsPDF doc and returns it with the suggested file name.
// `from` / `to` are 'YYYY-MM-DD' strings (inclusive range).
async function buildDoc({ from, to, users, requests }) {
  const rStart = parseLocal(from)
  const rEnd = parseLocal(to)
  const rangeLabel = `${fmtD(rStart)} – ${fmtD(rEnd)}`

  // Staff rows: everyone except admins (the boss Noel + the system admin), sorted.
  const staff = users
    .filter(u => u.role !== 'admin')
    .sort((a, b) => a.name.localeCompare(b.name))

  // Only APPROVED leave counts on the report.
  const counted = requests.filter(r => r.status === STATUS.APPROVED)

  const head = [['Employee', ...LEAVE_TYPES, 'Total']]
  const body = staff.map(u => {
    const mine = counted.filter(r => r.employeeId === u.id)
    let total = 0
    const cells = LEAVE_TYPES.map(type => {
      const days = mine.filter(r => r.type === type).reduce((s, r) => s + daysInRange(r, rStart, rEnd), 0)
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
  doc.text('Leave Report', pageW - 14, 20, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11)
  doc.setTextColor(90, 90, 90)
  doc.text(rangeLabel, pageW - 14, 28, { align: 'right' })
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
  doc.text('CabGlass — approved leave only. Working days within the selected date range.',
    14, doc.internal.pageSize.getHeight() - 10)

  return { doc, fileName: `CabGlass-Leave-${from}_to_${to}.pdf` }
}

// Trigger a browser download of the report.
export async function downloadMonthlyPdf(args) {
  const { doc, fileName } = await buildDoc(args)
  doc.save(fileName)
}

// Same report as base64 (no data: prefix) + file name, for emailing/Drive.
export async function monthlyPdfBase64(args) {
  const { doc, fileName } = await buildDoc(args)
  const dataUri = doc.output('datauristring') // data:application/pdf;...;base64,XXXX
  return { base64: dataUri.split(',')[1], fileName }
}
