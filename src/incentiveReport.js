// Builds the date-range incentive & commission report as a branded PDF.
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { computePeriod } from './incentiveCalc'

const BRAND   = [254, 205, 40]   // CabGlass yellow
const INK     = [17,  17,  17]   // near-black
const MUTED   = [100, 100, 100]
const LIGHT   = [245, 246, 248]
const WHITE   = [255, 255, 255]
const DARK_HDR = [34,  34,  34]

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

const fmtR    = (n) => `R ${Math.round(Number(n) || 0).toLocaleString('en-ZA')}`
const fmtDate = (s) => new Date(s).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
function formatPeriod(p) { const [y, m] = p.split('-'); return `${MONTHS[Number(m) - 1]} ${y}` }

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

// Draw a filled rounded rectangle (jsPDF has no built-in roundRect).
function roundRect(doc, x, y, w, h, r, fill) {
  doc.setFillColor(...fill)
  doc.roundedRect(x, y, w, h, r, r, 'F')
}

// A small stat "card": label above, value below in large text.
function statCard(doc, x, y, w, label, value, accent = false) {
  roundRect(doc, x, y, w, 18, 2, accent ? BRAND : LIGHT)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  doc.setTextColor(...(accent ? INK : MUTED))
  doc.text(label.toUpperCase(), x + 4, y + 6)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.setTextColor(...INK)
  doc.text(value, x + 4, y + 14)
}

async function buildDoc({ from, to, commissionPeriods, users }) {
  const doc  = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const mL = 14, mR = 14

  // ── Cover header ──────────────────────────────────────────────────────────
  // Yellow accent bar across the top
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, pageW, 6, 'F')

  const logo = await loadLogo()
  if (logo) {
    const w = 36, h = w * (logo.h / logo.w)
    doc.addImage(logo.dataUrl, 'PNG', mL, 10, w, h)
  }

  // Title block (right-aligned)
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20)
  doc.text('Incentive & Commission Report', pageW - mR, 18, { align: 'right' })

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTED)
  doc.text(`${fmtDate(from)} – ${fmtDate(to)}`, pageW - mR, 26, { align: 'right' })
  doc.setFontSize(8)
  doc.text(`Generated ${fmtDate(new Date().toISOString())}`, pageW - mR, 32, { align: 'right' })

  // Separator line
  doc.setDrawColor(...BRAND); doc.setLineWidth(0.6)
  doc.line(mL, 38, pageW - mR, 38)

  const periods = periodsInRange(from, to).filter(p => commissionPeriods[p])
  let y = 46
  let grand = 0

  if (!periods.length) {
    doc.setTextColor(...MUTED); doc.setFontSize(11)
    doc.text('No saved commission data in this range.', mL, y + 6)
  }

  periods.forEach((period, pi) => {
    const c = computePeriod(commissionPeriods[period], users)
    grand += c.totalIncentives

    // Page break between months (not before first)
    if (pi > 0) { doc.addPage(); y = 20 }

    // ── Month heading ────────────────────────────────────────────────────────
    roundRect(doc, mL, y, pageW - mL - mR, 10, 2, DARK_HDR)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...WHITE)
    doc.text(formatPeriod(period), mL + 4, y + 7)
    y += 15

    // ── Stat cards row ───────────────────────────────────────────────────────
    const totalW = pageW - mL - mR
    const cardW  = (totalW - 6) / 4   // 4 cards with 2mm gaps
    const cards  = [
      { label: 'Branch target',    value: fmtR(c.branchTarget),    accent: false },
      { label: 'Combined turnover', value: fmtR(c.combinedGross),  accent: false },
      { label: 'Net turnover',     value: fmtR(c.netBranch),       accent: false },
      { label: 'Total incentives', value: fmtR(c.totalIncentives), accent: true  },
    ]
    cards.forEach((card, i) => {
      statCard(doc, mL + i * (cardW + 2), y, cardW, card.label, card.value, card.accent)
    })
    y += 24

    // ── Payout table ─────────────────────────────────────────────────────────
    // Group rows: salesmen first, then warehouse, then Amy
    const salesRows = [
      [
        `${users.find(u => u.commissionRole === 'bv')?.name  || 'BV'}`,
        'Salesman',
        `Own ${fmtR(c.bv.own)}   Helper ${fmtR(c.bv.helper)}   Branch ${fmtR(c.bv.branch)}`,
        fmtR(c.bv.total),
      ],
      [
        `${users.find(u => u.commissionRole === 'bdb')?.name || 'BDB'}`,
        'Salesman',
        `Own ${fmtR(c.bdb.own)}   Branch ${fmtR(c.bdb.branch)}`,
        fmtR(c.bdb.total),
      ],
    ]
    const whRows = c.warehouse.map(w => [
      w.name,
      'Warehouse',
      w.abs > 0
        ? `Rate ${fmtR(c.whRate)}   Deduction -${fmtR(w.deduction)} (${w.abs} day${w.abs === 1 ? '' : 's'} absent)`
        : `Rate ${fmtR(c.whRate)}   No absences`,
      fmtR(w.final),
    ])
    const amyUser = users.find(u => u.commissionRole === 'amy')
    const amyRows = [[
      amyUser?.name || 'Amy',
      'Marketing',
      `GP bonus ${fmtR(c.amy.calc)}   Top-up ${fmtR(c.amy.topUp)}`,
      fmtR(c.amy.final),
    ]]
    const totalRow = [['', '', 'Total incentives', fmtR(c.totalIncentives)]]

    autoTable(doc, {
      startY: y,
      margin: { left: mL, right: mR },
      head: [['Name', 'Role', 'Breakdown', 'Payout']],
      body: [...salesRows, ...whRows, ...amyRows, ...totalRow],
      styles: { fontSize: 8.5, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 } },
      headStyles: {
        fillColor: DARK_HDR, textColor: WHITE, fontStyle: 'bold', fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 32, fontStyle: 'bold' },
        1: { cellWidth: 22, textColor: MUTED },
        2: { },
        3: { halign: 'right', fontStyle: 'bold', cellWidth: 26 },
      },
      alternateRowStyles: { fillColor: LIGHT },
      // Highlight the total row
      didParseCell(data) {
        if (data.row.index === salesRows.length + whRows.length + amyRows.length) {
          data.cell.styles.fillColor = BRAND
          data.cell.styles.textColor = INK
          data.cell.styles.fontStyle = 'bold'
        }
      },
    })
    y = doc.lastAutoTable.finalY + 10
  })

  // ── Multi-month grand total ──────────────────────────────────────────────
  if (periods.length > 1) {
    if (y > pageH - 30) { doc.addPage(); y = 20 }
    roundRect(doc, mL, y, pageW - mL - mR, 14, 2, BRAND)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK)
    doc.text('Total incentives across range:', mL + 4, y + 9)
    doc.text(fmtR(grand), pageW - mR - 4, y + 9, { align: 'right' })
    y += 18
  }

  // ── Footer on every page ─────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3)
    doc.line(mL, pageH - 14, pageW - mR, pageH - 14)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED)
    doc.text('CabGlass — confidential. Figures reflect saved commission data for each month.', mL, pageH - 8)
    doc.text(`Page ${i} of ${totalPages}`, pageW - mR, pageH - 8, { align: 'right' })
    // Bottom accent bar
    doc.setFillColor(...BRAND); doc.rect(0, pageH - 3, pageW, 3, 'F')
  }

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
