import { captureReport, reportFileName, tableColumnShares } from './reportExportModel.js';

const blue = '4472C4';
const pageWidth = 505;
const chartHeight = block => /Weekly availability and average months of stock/i.test(block.alt || '') ? 190
  : /Commodity Availability by Level of Care/i.test(block.alt || '') ? 220 : 330;

export async function buildWordReport(model, library) {
  const d = library || await import('docx');
  const { Document, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, Footer, PageNumber } = d;
  const paragraph = (text, options = {}) => new Paragraph({ children: [new TextRun({ text, ...options.run })], spacing: { after: 180, line: 300 }, ...options });
  const picture = (block, width = 674, maxHeight = 760) => {
    const scale = Math.min(width / block.width, maxHeight / block.height);
    return new Paragraph({ children: [new ImageRun({ type: 'png', data: block.data, transformation: { width: block.width * scale, height: block.height * scale }, altText: { title: block.alt || 'Ministry of Health', description: block.alt || 'Republic of Zambia coat of arms', name: block.alt || 'Ministry of Health' } })], alignment: AlignmentType.CENTER, spacing: { before: 160, after: 200 } });
  };
  const children = [];
  for (const block of model.blocks) {
    if (block.type === 'cover') {
      if (block.image) children.push(picture(block.image, 125, 125));
      children.push(paragraph(block.ministry, { alignment: AlignmentType.CENTER, spacing: { before: 220, after: 300 }, run: { size: 36, bold: true } }));
      children.push(paragraph(block.title.toUpperCase(), { style: 'Title', alignment: AlignmentType.CENTER, spacing: { before: 500, after: 400 } }));
      children.push(paragraph(block.description, { alignment: AlignmentType.JUSTIFIED }));
      children.push(paragraph(block.period, { alignment: AlignmentType.CENTER, spacing: { before: 400, after: 240 }, run: { size: 28 } }));
      block.details.forEach(text => children.push(paragraph(text, { alignment: AlignmentType.CENTER, run: { size: 22 } })));
      if (block.banner) children.push(picture({ ...block.banner, alt: `Report cover ${block.year}` }));
      else children.push(paragraph(block.year, { alignment: AlignmentType.RIGHT, shading: { fill: '08265C' }, spacing: { before: 500, after: 0 }, run: { size: 52, color: 'FFFFFF' } }));
    } else if (block.type === 'heading' || block.type === 'subheading') children.push(paragraph(block.text, { style: block.type === 'heading' ? 'Heading1' : 'Heading2', keepNext: true, pageBreakBefore: Boolean(block.pageBreak) }));
    else if (block.type === 'paragraph') children.push(new Paragraph({ children: block.runs.map(run => new TextRun({ ...run, size: block.small ? 20 : 24 })), alignment: block.bullet ? AlignmentType.LEFT : AlignmentType.JUSTIFIED, bullet: block.bullet ? { level: 0 } : undefined, spacing: { after: 160, line: 300 }, pageBreakBefore: Boolean(block.pageBreak) }));
    else if (block.type === 'image') children.push(picture(block, 674, chartHeight(block) * 4 / 3));
    else if (block.type === 'table') {
      const shares = tableColumnShares(block.rows);
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE },
        borders: Object.fromEntries(['top', 'bottom', 'left', 'right', 'insideHorizontal', 'insideVertical'].map(side => [side, { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' }])),
        rows: block.rows.map((row, index) => new TableRow({ tableHeader: index === 0, cantSplit: true, children: shares.map((share, column) => new TableCell({ width: { size: share * 100, type: WidthType.PERCENTAGE }, margins: { top: 90, bottom: 90, left: 90, right: 90 }, shading: { fill: index === 0 ? 'E9EFF7' : index % 2 ? 'FFFFFF' : 'F5F7FA' }, children: [paragraph(row[column] || '', { spacing: { after: 0, line: 240 }, run: { size: shares.length > 5 ? 18 : 20, bold: index === 0, color: '111111' } })] })) })),
      }));
      children.push(paragraph('', { spacing: { after: 120 } }));
    }
  }
  return new Document({ title: model.metadata.title, creator: 'Ministry of Health', description: 'Selected dashboard tracer report',
    styles: { default: { document: { run: { font: 'Times New Roman', size: 24, color: '111111' } } }, paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', run: { font: 'Arial', size: 52, bold: true, color: '000000' } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', run: { font: 'Times New Roman', size: 30, bold: true, color: blue }, paragraph: { keepNext: true } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', run: { font: 'Times New Roman', size: 26, bold: true, color: '111111' }, paragraph: { keepNext: true } },
    ] },
    sections: [{ properties: { titlePage: true, page: { size: { width: 11906, height: 16838 }, margin: { top: 1021, bottom: 1021, left: 907, right: 907 } } },
      footers: { first: new Footer({ children: [] }), default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 20 })] })] }) }, children }],
  });
}

export function buildPdfReport(model) {
  const content = [];
  for (const block of model.blocks) {
    const pageBreak = block.pageBreak ? 'before' : undefined;
    if (block.type === 'cover') {
      if (block.image) content.push({ image: block.image.data, width: 94, alignment: 'center', margin: [0, 10, 0, 20] });
      content.push({ text: block.ministry, alignment: 'center', fontSize: 22, bold: true, margin: [0, 0, 0, 30] });
      content.push({ text: block.title.toUpperCase(), alignment: 'center', fontSize: 26, bold: true, margin: [0, 0, 0, 30] });
      content.push({ text: block.description, alignment: 'justify', margin: [0, 0, 0, 35] });
      content.push({ text: block.period, alignment: 'center', fontSize: 18, margin: [0, 0, 0, 20] });
      block.details.forEach(text => content.push({ text, alignment: 'center', margin: [0, 0, 0, 15] }));
      if (block.banner) content.push({ image: block.banner.data, width: pageWidth, margin: [0, 35, 0, 0] });
      else content.push({ table: { widths: ['*'], body: [[{ text: block.year, alignment: 'right', fontSize: 36, color: '#ffffff', fillColor: '#08265c', margin: [10, 10, 10, 10] }]] }, layout: 'noBorders', margin: [0, 35, 0, 0] });
    } else if (block.type === 'heading' || block.type === 'subheading') content.push({ text: block.text, style: block.type, pageBreak, headlineLevel: block.type === 'heading' ? 1 : 2 });
    else if (block.type === 'paragraph') content.push({ text: block.runs, fontSize: block.small ? 9 : 11, alignment: 'justify', margin: [block.bullet ? 12 : 0, 0, 0, 10], pageBreak });
    else if (block.type === 'image') content.push({ image: block.data, fit: [pageWidth, chartHeight(block)], alignment: 'center', margin: [0, 8, 0, 12] });
    else if (block.type === 'table') {
      const shares = tableColumnShares(block.rows);
      content.push({ table: { headerRows: 1, keepWithHeaderRows: Math.min(3, block.rows.length - 1), dontBreakRows: true, widths: shares.map(share => share * (pageWidth - shares.length * 11)),
        body: block.rows.map((row, index) => shares.map((_, column) => ({ text: row[column] || '', bold: index === 0, fontSize: shares.length > 5 ? 8 : 9, fillColor: index === 0 ? '#e9eff7' : index % 2 ? '#ffffff' : '#f5f7fa', margin: [1, 3, 1, 3] }))),
      }, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#d9d9d9', vLineColor: () => '#d9d9d9' }, margin: [0, 3, 0, 12] });
    }
  }
  return { pageSize: 'A4', pageMargins: [45, 51, 45, 51], info: { title: model.metadata.title, author: 'Ministry of Health' }, defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.25, color: '#111111' },
    styles: { heading: { fontSize: 16, bold: true, color: '#4472c4', margin: [0, 8, 0, 14] }, subheading: { fontSize: 12, bold: true, margin: [0, 10, 0, 10] } }, content,
    footer: current => current === 1 ? null : { text: String(current), alignment: 'center', fontSize: 9, margin: [0, 14, 0, 0] },
    pageBreakBefore: (current, following) => Boolean(current.headlineLevel && following.length === 0),
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportNationalReport(format, root, metadata) {
  if (!['docx', 'pdf'].includes(format)) throw new Error('Unsupported report format.');
  const model = await captureReport(root, metadata);
  const filename = reportFileName(model.metadata.title, metadata.periodId, format);
  if (format === 'docx') {
    const library = await import('docx');
    const document = await buildWordReport(model, library);
    downloadBlob(await library.Packer.toBlob(document), filename);
  } else {
    const pdfModule = await import('pdfmake/build/pdfmake.js');
    const fontsModule = await import('pdfmake/build/vfs_fonts.js');
    const pdfMake = pdfModule.default || pdfModule;
    const fonts = fontsModule.default || fontsModule;
    pdfMake.addVirtualFileSystem(fonts.pdfMake?.vfs || fonts);
    const blob = await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('PDF generation timed out. Please try a smaller selection of sections.')), 60000);
      try { pdfMake.createPdf(buildPdfReport(model)).getBlob(result => { window.clearTimeout(timeout); resolve(result); }); }
      catch (error) { window.clearTimeout(timeout); reject(error); }
    });
    downloadBlob(blob, filename);
  }
  return filename;
}
