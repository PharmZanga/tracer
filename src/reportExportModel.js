const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const escapeXml = value => String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);

export function reportFileName(title, periodId, extension) {
  return `${clean(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${String(periodId).replace(/[^a-zA-Z0-9-]/g, '-')}.${extension}`;
}

export function tableColumnShares(rows) {
  const count = Math.max(1, ...rows.map(row => row.length));
  const weights = Array.from({ length: count }, (_, column) => Math.min(36, Math.max(9, ...rows.map(row => String(row[column] || '').length))));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map(weight => weight / total);
}

async function rasterImage(src, width, height) {
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * 2); canvas.height = Math.ceil(height * 2);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image export is not supported in this browser.');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { data: canvas.toDataURL('image/png'), width, height };
}

async function svgImage(svg) {
  const copy = svg.cloneNode(true);
  const originals = [svg, ...svg.querySelectorAll('*')], copies = [copy, ...copy.querySelectorAll('*')];
  originals.forEach((element, index) => {
    const style = getComputedStyle(element);
    for (const property of ['font-family', 'font-size', 'font-weight', 'font-style', 'fill', 'stroke', 'stroke-width', 'text-anchor', 'opacity']) copies[index].style.setProperty(property, style.getPropertyValue(property));
  });
  const viewBox = svg.viewBox.baseVal;
  const width = viewBox.width || svg.getBoundingClientRect().width || 1000;
  const height = viewBox.height || svg.getBoundingClientRect().height || 500;
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', width); copy.setAttribute('height', height);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml;charset=utf-8' }));
  try { return await rasterImage(url, width, height); } finally { URL.revokeObjectURL(url); }
}

async function barsImage(element) {
  const rows = [...element.querySelectorAll('.report-stock-bar')];
  const width = 1200, height = rows.length * 48 + 16;
  const body = rows.map((row, index) => {
    const name = clean(row.querySelector('strong')?.textContent), label = clean(row.querySelector('span')?.textContent);
    const share = Number.parseFloat(row.querySelector('i')?.style.width || '0') / 100;
    const y = 12 + index * 48;
    return `<text x="0" y="${y + 19}" font-family="Arial" font-size="16">${escapeXml(name)}</text><rect x="340" y="${y}" width="730" height="27" fill="#eef1f2"/><rect x="340" y="${y}" width="${Math.max(0, Math.min(1, share)) * 730}" height="27" fill="#2365ad"/><text x="1190" y="${y + 19}" text-anchor="end" font-family="Arial" font-size="17">${escapeXml(label)}</text>`;
  }).join('');
  return rasterImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`)}`, width, height);
}

function textRuns(node, inherited = {}) {
  if (node.nodeType === 3) return [{ text: node.textContent.replace(/\s+/g, ' '), ...inherited }];
  if (node.nodeType !== 1 || node.hidden) return [];
  if (node.tagName === 'BR') return [{ text: '\n', ...inherited }];
  const style = { ...inherited, ...(/^(B|STRONG)$/.test(node.tagName) ? { bold: true } : {}), ...(/^(I|EM)$/.test(node.tagName) ? { italics: true } : {}) };
  return [...node.childNodes].flatMap(child => textRuns(child, style));
}

export async function captureReport(root, { periodId }) {
  if (!root) throw new Error('Generate a report before exporting.');
  await document.fonts?.ready;
  // Clone before asynchronous image work so a later selection cannot change this export.
  const snapshot = root.cloneNode(true);
  const originalSvgs = [...root.querySelectorAll('svg')], snapshotSvgs = [...snapshot.querySelectorAll('svg')];
  const images = new Map();
  for (let index = 0; index < originalSvgs.length; index++) {
    if (originalSvgs[index].closest('[hidden]')) continue;
    images.set(snapshotSvgs[index], await svgImage(originalSvgs[index]));
  }
  const blocks = [];
  const cover = snapshot.querySelector('.national-report-cover');
  const coat = cover?.querySelector('img');
  const title = clean(cover?.querySelector('h1')?.textContent) || 'National Tracer Availability Report';
  const metadata = { title, periodId, generated: new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Lusaka' }) };
  const year = clean(cover?.querySelector('.national-report-cover-year')?.textContent);
  const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="160"><rect width="1200" height="160" fill="#08265c"/><polygon points="0,0 650,0 490,160 0,160" fill="#808080"/><polygon points="650,0 760,0 600,160 490,160" fill="#51b4bf"/><rect x="995" y="28" width="180" height="105" fill="#ed7d00" stroke="white" stroke-width="5"/><text x="1085" y="104" text-anchor="middle" font-family="Times New Roman,serif" font-size="64" fill="white">${escapeXml(year)}</text></svg>`;
  if (cover) blocks.push({ type: 'cover', title,
    image: coat ? await rasterImage(coat.src, 125, 125) : null,
    banner: await rasterImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(banner)}`, 1200, 160),
    ministry: clean(cover.querySelector('p')?.textContent), description: clean(cover.querySelector('.national-report-cover-description')?.textContent),
    period: clean(cover.querySelector('span')?.textContent), details: [...cover.querySelectorAll('small,strong')].map(node => clean(node.textContent)),
    year,
  });
  async function visit(element) {
    if (element.nodeType !== 1 || element.hidden || element.matches('header,footer,button,select,input,.report-trend-selector')) return;
    if (element.matches('.national-report-section-head')) {
      blocks.push({ type: 'heading', text: clean(element.querySelector('p')?.textContent), pageBreak: true }); return;
    }
    if (element.tagName === 'SVG' || element.tagName.toLowerCase() === 'svg') {
      const image = images.get(element);
      if (!image) throw new Error('A report graph could not be exported. Please regenerate the report.');
      blocks.push({ type: 'image', ...image, alt: element.getAttribute('aria-label') || 'Report chart' }); return;
    }
    if (element.matches('.report-stock-bars')) { blocks.push({ type: 'image', ...await barsImage(element), alt: element.getAttribute('aria-label') || 'Drug availability' }); return; }
    if (element.matches('.national-report-kpis')) {
      blocks.push({ type: 'table', rows: [['Indicator', 'Value', 'Basis'], ...[...element.children].map(node => [...node.children].map(child => clean(child.textContent)))] }); return;
    }
    if (element.tagName === 'TABLE') {
      const rows = [...element.rows].map(row => [...row.cells].map(cell => clean(textRuns(cell).map(run => run.text).join(''))));
      if (rows.length) blocks.push({ type: 'table', rows }); return;
    }
    if (/^H[1-6]$/.test(element.tagName)) { blocks.push({ type: element.tagName === 'H2' ? 'heading' : 'subheading', text: clean(element.textContent) }); return; }
    if (/^(P|LI|SMALL)$/.test(element.tagName)) {
      if (clean(element.textContent)) blocks.push({ type: 'paragraph', runs: textRuns(element), bullet: element.tagName === 'LI', small: element.tagName === 'SMALL' }); return;
    }
    for (const child of element.children) await visit(child);
  }
  for (const child of snapshot.children) {
    if (child.hidden || child.tagName === 'HEADER' || child.tagName === 'FOOTER') continue;
    const start = blocks.length;
    await visit(child);
    if (blocks.length > start) blocks[start].pageBreak = true;
  }
  if (!blocks.some(block => block.type === 'heading')) throw new Error('Select at least one report section before exporting.');
  return { metadata, blocks };
}
