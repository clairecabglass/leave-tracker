// Builds the date-range incentive & commission report as a branded PDF.
// For each month in the range that has saved commission data it prints:
//   • a branch summary (target, turnover, net, total incentives)
//   • per-person month-end payouts
//   • BV/BDB turnover figures (daily-tracker driven)
// plus a grand total across the whole range.
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { computePeriod } from './incentiveCalc'

const BRAND = [254, 205, 40]
const INK = [17, 17, 17]
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const fmtR = (n) => `R ${Math.round(Number(n) || 0).toLocaleString('en-ZA')}`
const fmtDate = (s) => new Date(s).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
function formatPeriod(p) { const [y, m] = p.split('-'); return `${MONTHS[Number(m) - 1]} ${y}` }

// Every YYYY-MM month between two YYYY-MM-DD dates, inclusive.
function periodsInRange(from, to) {
  const [fy, fm] = from.slice(0, 7).split('-').map(Number)
  const [ty, tm] = to.slice(0, 7).split('-').map(Number)
  const out = []
  let y = fy, m = fm
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

async function loadLogo() {
  try {
    const img = new Image()
    img.src = '/Cabglass_logo_PNG.avif'
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    try {
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < px.data.length; i += 4) {
        if (px.data[i + 3] > 0) { px.data[i] = 17; px.data[i + 1] = 17; px.data[i + 2] = 17 }
      }
      ctx.putImageData(px, 0, 0)
    } catch (e) { /* tainted canvas — use raw */ }
    return { dataUrl: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight }
  } catch (e) { return null }
}

async function buildDoc({ from, to, commissionPeriods, users }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()

  const logo = await loadLogo()
  let headerBottom = 18
  if (logo) {
    const w = 42, h = w * (logo.h / logo.w)
    doc.addImage(logo.dataUrl, 'PNG', 14, 12, w, h)
    headerBottom = Math.max(headerBottom, 12 + h)
  }
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
  doc.text('Incentive & Commission Report', pageW - 14, 20, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(90, 90, 90)
  doc.text(`${fmtDate(from)} – ${fmtDate(to)}`, pageW - 14, 28, { align: 'right' })
  doc.setFontSize(9)
  doc.text(`Generated ${fmtDate(new Date().toISOString())}`, pageW - 14, 34, { align: 'right' })

  const periods = periodsInRange(from, to).filter(p => commissionPeriods[p])
  let y = headerBottom + 8
  let grand = 0

  if (!periods.length) {
    doc.setTextColor(120, 120, 120); doc.setFontSize(11)
    doc.text('No saved commission data in this range.', 14, y + 6)
  }

  periods.forEach((p) => {
    const c = computePeriod(commissionPeriods[p], users)
    grand += c.totalIncentives

    doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
    doc.text(formatPeriod(p), 14, y + 4)
    y += 8

    // Branch summary
    autoTable(doc, {
      startY: y, margin: { left: 14, right: 14 },
      head: [['Branch summary', '']],
      body: [
        ['Branch target', fmtR(c.branchTarget)],
        ['Combined turnover (BV + BDB)', fmtR(c.combinedGross)],
        ['Net branch turnover', fmtR(c.netBranch)],
        ['Total incentives this month', fmtR(c.totalIncentives)],
      ],
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: BRAND, textColor: INK, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' } },
      alternateRowStyles: { fillColor: [250, 250, 250] },
    })
    y = doc.lastAutoTable.finalY + 4

    // Payouts
    const rows = []
    rows.push(['BV — Salesman', `Own ${fmtR(c.bv.own)} · Helper ${fmtR(c.bv.helper)} · Branch ${fmtR(c.bv.branch)}`, fmtR(c.bv.total)])
    rows.push(['BDB — Salesman', `Own ${fmtR(c.bdb.own)} · Branch ${fmtR(c.bdb.branch)}`, fmtR(c.bdb.total)])
    c.warehouse.forEach(w => rows.push([`${w.name} — Warehouse`, `Rate ${fmtR(c.whRate)} · −${fmtR(w.deduction)} (${w.abs} day${w.abs === 1 ? '' : 's'})`, fmtR(w.final)]))
    rows.push(['Amy — Marketing', `GP ${fmtR(c.amy.calc)} · Top-up ${fmtR(c.amy.topUp)}`, fmtR(c.amy.final)])

    autoTable(doc, {
      startY: y, margin: { left: 14, right: 14 },
      head: [['Person', 'Breakdown', 'Payout']],
      body: rows,
      styles: { fontSize: 9, cellPadding: 2, lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: [51, 51, 51], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold' }, 2: { halign: 'right', fontStyle: 'bold', cellWidth: 28 } },
      alternateRowStyles: { fillColor: [250, 250, 250] },
    })
    y = doc.lastAutoTable.finalY + 10

    if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20 }
  })

  if (periods.length > 1) {
    doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
    doc.text(`Total incentives across range:  ${fmtR(grand)}`, 14, y + 2)
  }

  doc.setFontSize(8); doc.setTextColor(150, 150, 150)
  doc.text('CabGlass — confidential. Figures reflect saved commission data for each month.',
    14, doc.internal.pageSize.getHeight() - 10)

  return { doc, fileName: `CabGlass-Incentives-${from}_to_${to}.pdf` }
}

export async function downloadIncentivePdf(args) {
  const { doc, fileName } = await buildDoc(args)
  doc.save(fileName)
}

export async function printIncentivePdf(args) {
  const { doc } = await buildDoc(args)
  doc.autoPrint()
  const url = doc.output('bloburl')
  window.open(url, '_blank')
}

export async function incentivePdfBase64(args) {
  const { doc, fileName } = await buildDoc(args)
  const dataUri = doc.output('datauristring')
  return { base64: dataUri.split(',')[1], fileName }
}
