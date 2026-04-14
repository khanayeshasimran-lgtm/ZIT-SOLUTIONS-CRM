/* ===============================
   EXPORT UTILITIES
   =============================== */

/* ---------- CSV ---------- */
export function exportToCSV(
  filename: string,
  rows: Record<string, any>[]
) {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);

  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((h) => `"${row[h] ?? ''}"`).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8;',
  });

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
}

/* ---------- EXCEL ---------- */
import * as XLSX from 'xlsx';

export function exportToExcel(
  filename: string,
  rows: Record<string, any>[]
) {
  if (!rows.length) return;

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/* ---------- PDF ---------- */
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';

/* ================= PDF EXPORT (BRANDED) ================= */

export function exportToPDF(
  filename: string,
  rows: Record<string, any>[],
  options?: {
    title?: string;
    subtitle?: string;
    exportedBy?: string;
  }
) {
  if (!rows.length) return;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const brandColor: [number, number, number] = [178, 152, 92]; // gold
  const textColor: [number, number, number] = [40, 40, 40];

  const title = options?.title ?? 'ZIT Solutions – CRM';
  const subtitle = options?.subtitle ?? 'Audit Logs Report';
  const exportedBy = options?.exportedBy ?? 'System';
  const exportedOn = new Date().toLocaleDateString();

  /* ===== HEADER ===== */
  doc.setFillColor(...brandColor);
  doc.rect(0, 0, pageWidth, 60, 'F');

  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(title, 40, 35);

  doc.setFontSize(11);
  doc.text(subtitle, pageWidth - 40, 35, { align: 'right' });

  /* ===== META INFO ===== */
  doc.setTextColor(...textColor);
  doc.setFontSize(10);

  doc.text(`Exported by: ${exportedBy}`, 40, 85);
  doc.text(`Exported on: ${exportedOn}`, pageWidth - 40, 85, {
    align: 'right',
  });

  /* ===== TABLE ===== */
  const headers = Object.keys(rows[0]);
  const body = rows.map((row) => headers.map((h) => row[h] ?? ''));

  autoTable(doc, {
    startY: 105,
    head: [headers],
    body,
    theme: 'striped',

    styles: {
      fontSize: 9,
      cellPadding: 6,
      textColor,
      overflow: 'linebreak',
      valign: 'middle',
    },

    headStyles: {
      fillColor: brandColor,
      textColor: 255,
      fontStyle: 'bold',
    },

    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },

    margin: { left: 40, right: 40 },

    didDrawPage: (data) => {
      /* ===== FOOTER ===== */
      const pageNumber = doc.getNumberOfPages();
      doc.setFontSize(9);
      doc.setTextColor(120);
      // Page number (left)
      doc.text(
        `Page ${pageNumber}`,
        40,
        pageHeight - 20
      );

      // Timestamp (right)
      doc.text(
        new Date().toLocaleString(),
        pageWidth - 40,
        pageHeight - 20,
        { align: 'right' }
      );
    },
  });

  /* ===== SAVE ===== */
  doc.save(`${filename}.pdf`);
}
