// Builds a single person's commission payslip as a PASSWORD-PROTECTED PDF.
// The PDF can only be opened with `password` (the user's payslip password).
// Returned as base64 (no data: prefix) for emailing as an attachment.
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const BRAND = [254, 205, 40]
const INK = [17, 17, 17]
const MUTED = [100, 100, 100]

const fmtR = (n) => `R ${Math.round(Number(n) || 0).toLocaleString('en-ZA')}`
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
function formatPeriod(p) { const [y, m] = String(p).split('-'); return `${MONTHS[Number(m) - 1]} ${y}` }

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
    } catch (e) { /* tainted canvas */ }
    return { dataUrl: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight }
  } catch (e) { return null }
}

// { period, name, role, breakdown: {label: amount}, total, password } → base64
export async function payslipBase64({ period, name, role, breakdown, total, password }) {
  const doc = new jsPDF({
    unit: 'mm', format: 'a4',
    encryption: { userPassword: String(password), ownerPassword: String(password) + '::owner', userPermissions: ['print'] },
  })
  const pageW = doc.internal.pageSize.getWidth()

  doc.setFillColor(...BRAND); doc.rect(0, 0, pageW, 6, 'F')

  const logo = await loadLogo()
  if (logo) { const w = 36, h = w * (logo.h / logo.w); doc.addImage(logo.dataUrl, 'PNG', 14, 12, w, h) }

  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
  doc.text('Commission Payslip', pageW - 14, 20, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...MUTED)
  doc.text(formatPeriod(period), pageW - 14, 28, { align: 'right' })

  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
  doc.text(name || '', 14, 44)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTED)
  doc.text(role || '', 14, 50)

  const body = Object.entries(breakdown || {})
    .filter(([, v]) => Number(v) !== 0)
    .map(([k, v]) => [k, fmtR(v)])
  body.push([{ content: 'Total payout', styles: { fontStyle: 'bold' } }, { content: fmtR(total), styles: { fontStyle: 'bold' } }])

  autoTable(doc, {
    startY: 58, margin: { left: 14, right: 14 },
    head: [['Item', 'Amount']],
    body,
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [34, 34, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
    alternateRowStyles: { fillColor: [245, 246, 248] },
    didParseCell: (data) => {
      if (data.row.index === body.length - 1) {
        data.cell.styles.fillColor = BRAND; data.cell.styles.textColor = INK
      }
    },
  })

  doc.setFontSize(8); doc.setTextColor(150, 150, 150)
  doc.text('CabGlass — confidential. This document is password-protected for your eyes only.',
    14, doc.internal.pageSize.getHeight() - 10)

  const dataUri = doc.output('datauristring')
  return dataUri.split(',')[1]
}
