// ==========================================================================
// COURSE PLAN IMPORT — turns YOUR OWN course plan (Excel, PDF, Word or a
// pasted list, in almost any layout) into a tick-off checklist.
//
//   Excel/Word tables:  "Week | Topic | Details" (one row per lecture),
//                       "Week | Lecture 1 | Lecture 2 | Lecture 3" (one row per week),
//                       title rows above the header, merged week cells, …
//   PDF / text lists:   "Week 1 …" headings with topics under them,
//                       "Lecture 5: …", numbered or bulleted lists.
// Everything found is shown in an editable preview before anything is saved.
// ==========================================================================

const PlanImport = (function () {
  'use strict';

  /* ======================= pure parsing (no DOM) ======================= */

  const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
  const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

  const clean = v => String(v === null || v === undefined ? '' : v).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
  const norm = v => clean(v).toLowerCase();

  function parseWeekValue(v) {
    if (typeof v === 'number' && v >= 1 && v <= 30 && Number.isInteger(v)) return v;
    const s = norm(v);
    if (!s) return null;
    let m = s.match(/^(?:week|wk|w)?\s*[-#:.]?\s*0?(\d{1,2})\b/);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 30) return Number(m[1]);
    m = s.match(/^(?:week\s+)?([a-z]+)/);
    if (m && WORD_NUM[m[1]]) return WORD_NUM[m[1]];
    return null;
  }

  /** "Week 3: Ratio analysis" → {week:3, rest:'Ratio analysis'} ; null if the line is not a week heading */
  function weekHeading(line) {
    const m = clean(line).match(/^(?:week|wk)\s*[-#:.]?\s*(0?\d{1,2}|[a-z]+)\b\s*(?:\(([^)]*)\))?\s*[:.\-–—|)]*\s*(.*)$/i);
    if (m) {
      const w = /^\d/.test(m[1]) ? Number(m[1]) : WORD_NUM[m[1].toLowerCase()];
      if (w && w <= 30) return { week: w, rest: clean(m[3]) };
    }
    const m2 = clean(line).match(/^w(\d{1,2})\s*[:.\-–—)]\s*(.*)$/i);
    if (m2 && Number(m2[1]) <= 30) return { week: Number(m2[1]), rest: clean(m2[2]) };
    return null;
  }

  function stripPrefix(line) {
    return clean(line)
      .replace(/^(?:day|lecture|lec|class|session|period|topic)\s*[-#]?\s*\d{1,3}\s*[:.\-–—)]*\s*/i, '')
      .replace(/^(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\s*[:.\-–—)]\s*/i, '')
      .replace(/^(?:[•\-*–▪●◦o]|\(?\d{1,2}[.)]|\(?[a-z][.)])\s+/i, '')
      .trim();
  }

  function typeFromText(text, explicit) {
    const e = norm(explicit);
    if (e) {
      if (/mid/.test(e)) return 'midterm';
      if (/final|terminal/.test(e)) return 'final';
      if (/holi|off|break|vacation|eid|leave/.test(e)) return 'holiday';
      if (/revis|review/.test(e)) return 'revision';
      if (/lect|class|teach|theory|lab|practical|tutorial/.test(e)) return 'lecture';
    }
    const t = norm(text);
    if (/\bmid[\s-]*(term|sem(ester)?)?\b.*\b(exam|examination|test|paper)s?\b|^mid[\s-]*term|^mids?\b|mid[\s-]*semester exam/.test(t)) return 'midterm';
    if (/\b(final|terminal|end[\s-]*(of[\s-]*)?(term|semester))\b.*\b(exam|examination|test|paper)s?\b|^final[\s-]*(term|exam)/.test(t)) return 'final';
    if (/^(holiday|public holiday|vacation|winter break|summer break|eid|no class)/.test(t)) return 'holiday';
    if (/^(revision|review)\b/.test(t)) return 'revision';
    return 'lecture';
  }

  const HDR = {
    week: /^(week|wk|weeks|week\s*(no|#|number)\.?|week\s*[/&]\s*date)$/,
    date: /^(date|dates|planned date|lecture date|class date|tentative date)$/,
    dow: /^(day|weekday|day of week)$/,
    lecture: /^(lecture|lec|session|class|period|sr\.?|s\.?\s*no\.?|no\.?|#|lecture\s*(no|#|number)\.?|session\s*(no|#)\.?)$/,
    topic: /(topic|content|contents|title|subject matter|lecture topic|course content|theme|unit|module|chapter title|outline|syllabus)/,
    details: /(detail|sub[\s-]*topic|reading|readings|reference|references|chapter|book|activit|remark|note|learning outcome|clo|assessment|description)/,
    type: /^(type|kind|category)$/,
    covered: /^(covered|done|taught|status|completed)$/,
    coveredOn: /^(covered on|taught on|completed on|date covered)$/,
    wide: /^(?:(?:day|lecture|lec|class|session|period)\s*[-#]?\s*(\d{1,2})|(mon|tue|wed|thu|fri|sat|sun)[a-z]*)$/
  };

  function headerMap(row) {
    const cells = row.map(norm);
    const map = { wide: [] };
    cells.forEach((c, i) => {
      if (!c) return;
      if (map.coveredOn === undefined && HDR.coveredOn.test(c)) { map.coveredOn = i; return; }
      if (HDR.wide.test(c)) { map.wide.push(i); return; }
      if (map.week === undefined && HDR.week.test(c)) { map.week = i; return; }
      if (map.date === undefined && HDR.date.test(c)) { map.date = i; return; }
      if (map.dow === undefined && HDR.dow.test(c)) { map.dow = i; return; }
      if (map.type === undefined && HDR.type.test(c)) { map.type = i; return; }
      if (map.covered === undefined && HDR.covered.test(c)) { map.covered = i; return; }
      if (map.lecture === undefined && HDR.lecture.test(c)) { map.lecture = i; return; }
      if (map.topic === undefined && HDR.topic.test(c) && !/sub[\s-]*topic/.test(c)) { map.topic = i; return; }
      if (map.details === undefined && HDR.details.test(c)) { map.details = i; return; }
      if (map.topic !== undefined && map.details === undefined && c.length > 2) { map.details = i; }
    });
    const score = (map.topic !== undefined ? 2 : 0) + (map.week !== undefined ? 1 : 0) + (map.date !== undefined ? 1 : 0) +
      (map.lecture !== undefined ? 1 : 0) + (map.wide.length >= 2 ? 3 : 0);
    return { map, score };
  }

  function findHeader(aoa) {
    let best = null;
    for (let r = 0; r < Math.min(aoa.length, 25); r++) {
      const nonEmpty = aoa[r].filter(c => clean(c)).length;
      if (nonEmpty < 2) continue;
      const { map, score } = headerMap(aoa[r]);
      const ok = (map.topic !== undefined && score >= 3) || map.wide.length >= 2;
      if (ok && (!best || score > best.score)) best = { row: r, map, score };
      if (best && best.score >= 4) break;
    }
    return best;
  }

  function splitCell(text, split) {
    const t = clean(text);
    if (!split) return [t];
    return t.split(/\n|;|\s\|\s/).map(stripPrefix).map(clean).filter(x => x.length > 1);
  }

  function cellDate(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' && v > 20000 && v < 80000) return excelToISODate(v);
    if (typeof v === 'number') return '';
    const s = clean(v);
    if (/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(s)) return excelToISODate(s.match(/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/)[0]);
    const d = Date.parse(s);
    return isNaN(d) || !/\d/.test(s) ? '' : toLocalISO(new Date(d));
  }

  /**
   * aoa (array of rows) → { items:[{week,lecture,date,dow,type,topic,details,covered,coveredOn}], format, notes:[] }
   * opts: { split, source:'excel'|'pdf'|'word'|'text' }
   */
  function parseGrid(aoa, opts) {
    const o = opts || {};
    const rows = aoa.map(r => (Array.isArray(r) ? r : [r]));
    const hdr = findHeader(rows);
    const items = [], notes = [];
    if (hdr && hdr.map.wide.length >= 2) {
      // ---- one row per week, one column per lecture/day ----
      const m = hdr.map;
      let wk = 0;
      rows.slice(hdr.row + 1).forEach(r => {
        const w = m.week !== undefined ? parseWeekValue(r[m.week]) : null;
        const cellsFilled = m.wide.some(ci => clean(r[ci]));
        if (!cellsFilled) { if (w) wk = w; return; }
        wk = w || wk + 1;
        m.wide.forEach((ci, k) => {
          const hdrTxt = norm(rows[hdr.row][ci]);
          const dowM = hdrTxt.match(/^(mon|tue|wed|thu|fri|sat|sun)/);
          splitCell(r[ci], o.split).forEach(t => {
            if (!t) return;
            items.push({ week: wk, lecture: k + 1, dow: dowM ? DOW[dowM[1]] : null, date: '', type: typeFromText(t), topic: t, details: '' });
          });
        });
      });
      return { items, format: `Table with one row per week and ${m.wide.length} lecture columns`, notes };
    }
    if (hdr) {
      // ---- one row per lecture/topic ----
      const m = hdr.map;
      let wk = null, last = null;
      rows.slice(hdr.row + 1).forEach(r => {
        const w = m.week !== undefined ? parseWeekValue(r[m.week]) : null;
        if (w) wk = w;
        const weekCellText = m.week !== undefined ? clean(r[m.week]) : '';
        let topic = clean(r[m.topic]);
        const details = m.details !== undefined ? clean(r[m.details]) : '';
        const typeCell = m.type !== undefined ? r[m.type] : '';
        const date = m.date !== undefined ? cellDate(r[m.date]) : '';
        const lec = m.lecture !== undefined ? Number(String(r[m.lecture]).replace(/\D/g, '')) || null : null;
        // a week cell that says "Mid Term" with no topic → exam row
        if (!topic && weekCellText && !w && typeFromText(weekCellText) !== 'lecture') topic = weekCellText;
        if (!topic && details) topic = details;
        if (!topic) return;
        // PDF table rows that are only the wrapped continuation of the previous topic
        if (o.source === 'pdf' && last && !w && !date && !lec && !details && (/^[a-z(,&]/.test(topic) || /[,\-&:]$|\b(and|of|the|in|to)$/i.test(last.topic))) {
          last.topic = clean(last.topic + ' ' + topic);
          return;
        }
        const covRaw = m.covered !== undefined ? r[m.covered] : '';
        const coveredOn = m.coveredOn !== undefined ? cellDate(r[m.coveredOn]) : '';
        const dowTxt = m.dow !== undefined ? norm(r[m.dow]).slice(0, 3) : '';
        splitCell(topic, o.split && !typeCell).forEach((t, k) => {
          const it = { week: wk, lecture: lec, date: k === 0 ? date : '', dow: DOW[dowTxt] !== undefined ? DOW[dowTxt] : null,
            type: typeFromText(t, typeCell), topic: t, details: k === 0 ? details : '',
            covered: /^(y|yes|true|1|✓|✔|done|covered|taught|completed)$/i.test(clean(covRaw)), coveredOn };
          items.push(it); last = it;
        });
      });
      const fmt = m.week !== undefined ? 'Table with one row per lecture (week column found)' : m.date !== undefined ? 'Table with dates (no week column)' : 'Table of topics (no week or date column)';
      return { items, format: fmt, notes };
    }
    // ---- free text / list ----
    const lines = [];
    rows.forEach(r => r.map(clean).filter(Boolean).join(' ').split('\n').forEach(l => lines.push(clean(l))));
    const hasWeeks = lines.some(l => weekHeading(l));
    let wk = null, seenWeek = false, last = null;
    lines.forEach(line => {
      if (!line || /^page\s*\d+(\s*(of|\/)\s*\d+)?$/i.test(line) || /^\d{1,3}$/.test(line)) return;
      const wh = weekHeading(line);
      if (wh) {
        wk = wh.week; seenWeek = true; last = null;
        if (wh.rest) splitCell(wh.rest, true).forEach(t => { const it = { week: wk, lecture: null, date: '', dow: null, type: typeFromText(t), topic: stripPrefix(t), details: '' }; if (it.topic) { items.push(it); last = it; } });
        return;
      }
      if (hasWeeks && !seenWeek) return; // title / course info above the first week
      const t = stripPrefix(line);
      if (t.length < 3) return;
      const isNewItem = /^(?:day|lecture|lec|class|session|period|topic)\s*[-#]?\s*\d|^(?:[•\-*–▪●◦o]|\(?\d{1,2}[.)]|\(?[a-z][.)])\s+|^(mon|tue|wed|thu|fri|sat|sun)/i.test(line);
      if (last && !isNewItem && o.source === 'pdf' && /^[a-z(,&]/.test(t)) { last.topic = clean(last.topic + ' ' + t); return; }
      const it = { week: wk, lecture: null, date: '', dow: null, type: typeFromText(t), topic: t, details: '' };
      items.push(it); last = it;
    });
    return { items, format: hasWeeks ? 'List with "Week …" headings' : 'Plain list of topics (no weeks found)', notes };
  }

  /**
   * Gives every item a week, a session number and a date from the semester
   * settings. cfg: { startDate, meetingDays:[0-6], weeks, midtermWeek, finalWeek, addExams }
   */
  function assignSchedule(items, cfg) {
    const days = [...(cfg.meetingDays || [])].map(Number);
    const startDow = cfg.startDate ? weekdayOf(cfg.startDate) : 1;
    const order = days.sort((a, b) => ((a - startDow + 7) % 7) - ((b - startDow + 7) % 7));
    const perWeek = Math.max(1, order.length || 1);
    const examWeeks = new Set([Number(cfg.midtermWeek) || 0, Number(cfg.finalWeek) || 0].filter(Boolean));
    const out = items.map(x => ({ ...x }));

    // 1) weeks from explicit dates
    if (cfg.startDate) out.forEach(x => {
      if (!x.week && x.date) x.week = Math.max(1, Math.floor(daysBetween(cfg.startDate, x.date) / 7) + 1);
    });
    // 2) weeks from lecture numbers / plain order
    const noWeek = out.filter(x => !x.week);
    if (noWeek.length) {
      const hasLec = noWeek.every(x => x.lecture);
      let w = Math.max(0, ...out.filter(x => x.week).map(x => x.week)) + 1, slot = 0;
      const skip = () => { while (cfg.addExams && examWeeks.has(w)) w++; };
      skip();
      noWeek.forEach((x, i) => {
        if (hasLec && !out.some(y => y.week)) { x.week = Math.ceil(x.lecture / perWeek); return; }
        if (x.type === 'midterm' || x.type === 'final') { x.week = Number(x.type === 'midterm' ? cfg.midtermWeek : cfg.finalWeek) || w; return; }
        x.week = w; slot++;
        if (slot >= perWeek) { slot = 0; w++; skip(); }
      });
      if (hasLec && !out.some(y => y.week && !noWeek.includes(y))) {
        // shift lectures past exam weeks
        if (cfg.addExams) noWeek.sort((a, b) => a.lecture - b.lecture).forEach(x => { let wk = x.week; examWeeks.forEach(e => { if (wk >= e) wk++; }); x.week = wk; });
      }
    }
    // 3) exam rows if missing
    if (cfg.addExams) {
      [['midterm', cfg.midtermWeek, 'Mid-Semester Examination'], ['final', cfg.finalWeek, 'Final-Semester Examination']].forEach(([type, wk, label]) => {
        if (wk && !out.some(x => x.type === type)) out.push({ week: Number(wk), lecture: null, date: '', dow: null, type, topic: label, details: '', _auto: true });
      });
    }
    // 4) sessions + dates
    const byWeek = {};
    out.forEach((x, i) => { x._i = i; (byWeek[x.week] = byWeek[x.week] || []).push(x); });
    Object.entries(byWeek).forEach(([w, list]) => {
      list.sort((a, b) => (a.lecture || 0) - (b.lecture || 0) || a._i - b._i);
      list.forEach((x, k) => {
        x.session = k + 1;
        if (!x.date && cfg.startDate && order.length) {
          let dow = x.dow !== null && x.dow !== undefined && order.includes(x.dow) ? x.dow : order[Math.min(k, order.length - 1)];
          if (x.type === 'midterm' || x.type === 'final') dow = order[Math.min(k, order.length - 1)];
          x.date = addDays(addDays(cfg.startDate, (Number(w) - 1) * 7), (dow - startDow + 7) % 7);
        }
      });
    });
    return out.sort((a, b) => (a.week - b.week) || (a.session - b.session)).map(({ _i, ...x }) => x);
  }

  /** Builds final plan sessions, keeping ticks of topics that match the old plan. */
  function toSessions(items, oldSessions) {
    const old = (oldSessions || []).filter(s => s.covered);
    return items.map(x => {
      const mi = old.findIndex(o => norm(o.topic) === norm(x.topic));
      const match = mi >= 0 ? old.splice(mi, 1)[0] : null;   // each ticked topic is kept once (a repeated topic name isn't ticked twice)
      const covered = !!(x.covered || match);
      return { id: uid(), week: Number(x.week) || 1, session: x.session || 1, plannedDate: x.date || '', type: x.type || 'lecture',
        topic: clean(x.topic), details: clean(x.details), covered, coveredOn: covered ? (x.coveredOn || (match && match.coveredOn) || x.date || localToday()) : null };
    });
  }

  /* ======================= file readers ======================= */

  async function readExcel(file) {
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false });
    const scored = wb.SheetNames.filter(n => !/instruction|legend|help|readme/i.test(n)).map(n => {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: true, blankrows: false });
      const text = aoa.flat().filter(c => typeof c === 'string' && c.trim().length > 2).length;
      return { n, aoa, text: text + (/plan|schedule|outline|course/i.test(n) ? 50 : 0) };
    }).sort((a, b) => b.text - a.text);
    if (!scored.length) throw new Error('The workbook has no sheets with data.');
    return { aoa: scored[0].aoa, source: 'excel', where: `sheet "${scored[0].n}"` };
  }

  async function readWord(file) {
    if (typeof JSZip === 'undefined') throw new Error('Word reader not loaded.');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xml = zip.file('word/document.xml');
    if (!xml) throw new Error('This is not a valid .docx file.');
    const doc = new DOMParser().parseFromString(await xml.async('string'), 'application/xml');
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const textOf = el => [...el.getElementsByTagNameNS(W, 'p')].map(p =>
      [...p.getElementsByTagNameNS(W, '*')].map(n => n.localName === 't' ? n.textContent : n.localName === 'tab' ? ' ' : n.localName === 'br' ? '\n' : '').join('')).join('\n');
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    const aoa = [];
    [...body.children].forEach(el => {
      if (el.localName === 'p') { const t = textOf(el); if (t.trim()) aoa.push([t]); }
      if (el.localName === 'tbl') {
        [...el.children].filter(x => x.localName === 'tr').forEach(tr => {
          const row = [];
          [...tr.children].filter(x => x.localName === 'tc').forEach(tc => {
            const span = tc.getElementsByTagNameNS(W, 'gridSpan')[0];
            row.push(textOf(tc));
            for (let k = 1; k < Number(span ? span.getAttribute('w:val') || span.getAttributeNS(W, 'val') : 1); k++) row.push('');
          });
          aoa.push(row);
        });
      }
    });
    return { aoa, source: 'word', where: 'Word document' };
  }

  async function readPdf(file) {
    const pdfjs = await loadPdfJs();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items.filter(it => it.str && it.str.trim()).map(it => ({
        x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height || 10, s: it.str
      }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const pageLines = [];
      items.forEach(it => {
        const ln = pageLines.find(l => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.45));
        if (ln) ln.items.push(it); else pageLines.push({ y: it.y, h: it.h, items: [it] });
      });
      pageLines.sort((a, b) => b.y - a.y).forEach(l => {
        l.items.sort((a, b) => a.x - b.x);
        const cells = [];
        l.items.forEach(it => {
          const prev = cells[cells.length - 1];
          if (prev && it.x - prev.end < Math.max(10, it.h * 1.2)) { prev.s += (it.x - prev.end > it.h * 0.15 ? ' ' : '') + it.s; prev.end = it.x + it.w; }
          else cells.push({ x: it.x, end: it.x + it.w, s: it.s });
        });
        lines.push({ page: p, cells: cells.map(c => ({ x: c.x, s: clean(c.s) })) });
      });
    }
    if (!lines.length) throw new Error('This PDF has no readable text (it looks like a scanned image). Use the Excel template, or copy the topics into "Paste a list".');
    // Table PDF? find a header line and place every cell under the nearest header column
    let hdrIdx = -1, hdr = null;
    for (let i = 0; i < Math.min(lines.length, 40); i++) {
      if (lines[i].cells.length < 2) continue;
      const hm = headerMap(lines[i].cells.map(c => c.s));
      if ((hm.map.topic !== undefined && hm.score >= 3) || hm.map.wide.length >= 2) { hdrIdx = i; hdr = lines[i].cells; break; }
    }
    if (hdrIdx >= 0) {
      const xs = hdr.map(c => c.x);
      const aoa = [hdr.map(c => c.s)];
      lines.slice(hdrIdx + 1).forEach(l => {
        if (l.cells.length === hdr.length && l.cells.every((c, i) => norm(c.s) === norm(hdr[i].s))) return; // repeated header on next page
        const row = new Array(xs.length).fill('');
        l.cells.forEach(c => {
          let col = 0;
          xs.forEach((x, i) => { if (c.x >= x - 6) col = i; });
          row[col] = row[col] ? row[col] + ' ' + c.s : c.s;
        });
        aoa.push(row);
      });
      return { aoa, source: 'pdf', where: `PDF (${lines.length} lines, table)` };
    }
    return { aoa: lines.map(l => [l.cells.map(c => c.s).join(' ')]), source: 'pdf', where: `PDF (${lines.length} lines)` };
  }

  async function readAny(file) {
    const n = file.name.toLowerCase();
    if (/\.(xlsx|xlsm|xls|csv|ods)$/.test(n)) return readExcel(file);
    if (/\.pdf$/.test(n)) return readPdf(file);
    if (/\.docx$/.test(n)) return readWord(file);
    if (/\.doc$/.test(n)) throw new Error('Old .doc files cannot be read. In Word use File → Save As → Word Document (.docx) or PDF, then upload that.');
    if (/\.txt$/.test(n)) return { aoa: (await file.text()).split(/\r?\n/).map(l => [l]), source: 'text', where: 'text file' };
    throw new Error('Please upload an Excel (.xlsx), PDF, Word (.docx) or text file.');
  }

  /* ======================= preview UI ======================= */

  let state = null;

  function ensureModal() {
    if (document.getElementById('plan-import-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-backdrop" id="plan-import-modal">
        <div class="modal wide" style="max-width:1100px;">
          <h2>Check your course plan before saving</h2>
          <div class="banner ok" id="pi-summary" style="margin-bottom:12px;"></div>
          <div class="filter-row" style="margin-bottom:8px;">
            <div class="field"><label>Semester starts</label><input type="date" id="pi-start"></div>
            <div class="field"><label>Mid-term week</label><input type="number" id="pi-mid" min="0" max="30" style="width:90px;"></div>
            <div class="field"><label>Final week</label><input type="number" id="pi-final" min="0" max="30" style="width:90px;"></div>
            <div class="field grow"><label>Class days</label><div class="chip-row" id="pi-days" style="margin:0;"></div></div>
          </div>
          <div class="gap-row" style="margin-bottom:10px;">
            <label class="check-row"><input type="checkbox" id="pi-split"> Put each line of a cell (or text separated by ;) as its own checklist item</label>
            <label class="check-row"><input type="checkbox" id="pi-exams" checked> Add Mid-term / Final exam rows if missing</label>
            <button class="btn btn-outline" id="pi-redo">Re-arrange dates</button>
          </div>
          <div class="table-panel" style="box-shadow:none;border:1px solid var(--hairline);max-height:52vh;overflow:auto;">
            <table class="data-table compact import-table">
              <thead><tr><th>Week</th><th>Date</th><th>Type</th><th style="min-width:260px;">Topic (checklist item)</th><th>Details / reading</th><th></th></tr></thead>
              <tbody id="pi-body"></tbody>
            </table>
          </div>
          <button class="link-btn small" id="pi-add" style="margin-top:8px;">+ Add a row</button>
          <div class="form-msg" id="pi-msg"></div>
          <div class="modal-actions" style="justify-content:space-between;flex-wrap:wrap;">
            <div class="gap-row" id="pi-mode-wrap">
              <label class="check-row"><input type="radio" name="pi-mode" value="replace" checked> Replace the current plan (ticks on matching topics are kept)</label>
              <label class="check-row"><input type="radio" name="pi-mode" value="append"> Add to the end of the current plan</label>
            </div>
            <div class="gap-row">
              <button class="btn btn-outline" id="pi-cancel">Cancel</button>
              <button class="btn btn-primary-sm" id="pi-save">Create checklist</button>
            </div>
          </div>
        </div>
      </div>`);
    const m = document.getElementById('plan-import-modal');
    document.getElementById('pi-cancel').addEventListener('click', () => m.classList.remove('open'));
    document.getElementById('pi-redo').addEventListener('click', () => { readTable(); reschedule(); });
    document.getElementById('pi-split').addEventListener('change', () => { reparse(); });
    document.getElementById('pi-exams').addEventListener('change', () => { readTable(); reschedule(); });
    document.getElementById('pi-add').addEventListener('click', () => {
      readTable();
      const lastW = state.items.length ? state.items[state.items.length - 1].week : 1;
      state.items.push({ week: lastW, date: '', type: 'lecture', topic: '', details: '', session: 99, _origWeek: lastW, _userWeek: true, _origDate: '' });
      drawTable();
      const inputs = document.querySelectorAll('#pi-body .pi-topic');
      inputs[inputs.length - 1].focus();
    });
    document.getElementById('pi-save').addEventListener('click', save);
  }

  function cfgFromForm() {
    return {
      startDate: document.getElementById('pi-start').value,
      midtermWeek: Number(document.getElementById('pi-mid').value) || 0,
      finalWeek: Number(document.getElementById('pi-final').value) || 0,
      meetingDays: [...document.querySelectorAll('#pi-days .chip-btn.active')].map(b => Number(b.dataset.day)),
      addExams: document.getElementById('pi-exams').checked
    };
  }

  function reparse() {
    state.parsed = parseGrid(state.raw.aoa, { split: document.getElementById('pi-split').checked, source: state.raw.source });
    state.items = state.parsed.items.map(x => ({ ...x, _origWeek: x.week || null, _origDate: x.date || '' }));
    reschedule();
  }

  /** Re-applies semester settings; keeps anything the teacher typed in the table. */
  function reschedule() {
    const base = state.items.filter(x => !x._auto).map(x => ({
      ...x, week: x._userWeek ? x.week : x._origWeek, date: x._userDate ? x.date : x._origDate
    }));
    state.items = assignSchedule(base, cfgFromForm());
    drawTable();
  }

  function drawTable() {
    const types = PLAN_TYPES.map(t => [t, PLAN_TYPE_LABEL[t]]);
    let prevW = null;
    document.getElementById('pi-body').innerHTML = state.items.map((x, i) => {
      const ws = x.week !== prevW; prevW = x.week;
      return `<tr data-i="${i}" class="${ws ? 'week-start' : ''}">
        <td><input class="w pi-week" type="number" min="1" max="30" value="${h(x.week || '')}"></td>
        <td><input class="d pi-date" type="date" value="${h(x.date || '')}"></td>
        <td><select class="pi-type">${types.map(([v, l]) => `<option value="${v}"${x.type === v ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><input class="pi-topic" type="text" value="${h(x.topic || '')}"></td>
        <td><input class="pi-details" type="text" value="${h(x.details || '')}"></td>
        <td><button type="button" class="icon-btn danger pi-del" title="Remove this row">✕</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6"><div class="empty-state">No topics found — add rows by hand, or try another file.</div></td></tr>';
    document.querySelectorAll('#pi-body .pi-del').forEach(b => b.addEventListener('click', e => {
      readTable();
      state.items.splice(Number(e.target.closest('tr').dataset.i), 1);
      drawTable();
    }));
    const teach = state.items.filter(x => TEACH_TYPES.includes(x.type)).length;
    const weeks = new Set(state.items.map(x => x.week)).size;
    document.getElementById('pi-summary').innerHTML = `<span>Found <b>${state.items.length}</b> checklist items (<b>${teach}</b> lectures) across <b>${weeks}</b> weeks in your ${h(state.raw.where)}. Layout detected: ${h(state.parsed.format)}. Fix anything below, then press <b>Create checklist</b>.</span>`;
    document.getElementById('pi-save').textContent = `Create checklist (${state.items.length} items)`;
  }

  function readTable() {
    document.querySelectorAll('#pi-body tr[data-i]').forEach(tr => {
      const x = state.items[Number(tr.dataset.i)];
      if (!x) return;
      const d = tr.querySelector('.pi-date').value;
      if (d !== (x.date || '')) x._userDate = true;
      const w = Number(tr.querySelector('.pi-week').value) || x.week;
      if (w !== x.week) x._userWeek = true;
      x.week = w;
      x.date = d;
      x.type = tr.querySelector('.pi-type').value;
      x.topic = tr.querySelector('.pi-topic').value;
      x.details = tr.querySelector('.pi-details').value;
    });
  }

  async function save() {
    readTable();
    const items = state.items.filter(x => clean(x.topic));
    if (!items.length) { setMsg('pi-msg', 'There is nothing to save — add at least one topic.', 'error'); return; }
    const cfg = cfgFromForm();
    if (!cfg.startDate) { setMsg('pi-msg', 'Choose the date the semester starts.', 'error'); return; }
    const byWeek = {};
    items.sort((a, b) => (a.week - b.week) || ((a.date || '').localeCompare(b.date || ''))).forEach(x => { byWeek[x.week] = (byWeek[x.week] || 0) + 1; x.session = byWeek[x.week]; });
    const mode = (document.querySelector('input[name="pi-mode"]:checked') || {}).value || 'replace';
    const btn = document.getElementById('pi-save');
    btn.disabled = true;
    try {
      await state.onSave(items, cfg, mode);
      document.getElementById('plan-import-modal').classList.remove('open');
    } catch (e) {
      setMsg('pi-msg', 'Could not save: ' + e.message, 'error');
    } finally { btn.disabled = false; }
  }

  /**
   * Opens the preview. source = File or {text}. ctx = { cfg, hasPlan, onSave(items, cfg, mode) }
   */
  async function start(source, ctx) {
    ensureModal();
    let raw;
    try {
      raw = source instanceof Blob ? await readAny(source) : { aoa: String(source.text || '').split(/\r?\n/).map(l => [l]), source: 'text', where: 'pasted list' };
    } catch (e) {
      toast(e.message, 'error', 9000);
      return;
    }
    state = { raw, onSave: ctx.onSave, items: [] };
    const cfg = ctx.cfg || {};
    document.getElementById('pi-start').value = cfg.startDate || localToday();
    document.getElementById('pi-mid').value = cfg.midtermWeek ?? 8;
    document.getElementById('pi-final').value = cfg.finalWeek ?? 16;
    const days = new Set((cfg.meetingDays || [1, 3, 5]).map(Number));
    document.getElementById('pi-days').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" class="chip-btn${days.has(d) ? ' active' : ''}" data-day="${d}">${WEEKDAY_SHORT[d]}</button>`).join('');
    document.querySelectorAll('#pi-days .chip-btn').forEach(b => b.addEventListener('click', () => { b.classList.toggle('active'); readTable(); reschedule(); }));
    ['pi-start', 'pi-mid', 'pi-final'].forEach(id => { document.getElementById(id).onchange = () => { readTable(); reschedule(); }; });
    document.getElementById('pi-mode-wrap').classList.toggle('hidden', !ctx.hasPlan);
    document.getElementById('pi-split').checked = false;
    setMsg('pi-msg', '');
    const first = parseGrid(raw.aoa, { split: false, source: raw.source });
    // a table with very few rows but long multi-line cells → splitting is probably wanted
    if (first.items.length && first.items.filter(x => /\n|;/.test(x.topic)).length >= Math.max(2, first.items.length / 2)) document.getElementById('pi-split').checked = true;
    reparse();
    document.getElementById('plan-import-modal').classList.add('open');
  }

  return { start, parseGrid, assignSchedule, toSessions, weekHeading, parseWeekValue, typeFromText };
})();
