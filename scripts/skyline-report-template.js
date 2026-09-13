/**
 * scripts/skyline-report-template.js — HTML contact-sheet renderer for the
 * skyline-thumbnails backfill CLI (contract §3.10).
 *
 * Pure string-building module: no filesystem/network/Firestore access, no
 * external assets, no CDN — every byte of CSS is inlined so report.html
 * opens correctly straight off disk (file://) with no network access. Takes
 * plain, already-serializable row objects (as written to report.json) so it
 * has no dependency on Firestore, the thumbnail service, or any other
 * workstream's modules.
 */

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function fmtNum(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return String(n);
}

function fmtSec(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return `${n.toFixed(2)}s`;
}

function stateBadgeColor(state) {
  const colors = {
    missing: '#8a6d00',
    'legacy-artist-image': '#7a4b00',
    'legacy-artist-portrait': '#7a4b00',
    generated: '#0a6e3a',
    uploaded: '#1d4ed8',
    'invalid-url': '#b91c1c'
  };
  return colors[state] || '#444444';
}

function renderSummary({ runId, generatedAt, mode, flagEnabled, target, filters, counts }) {
  const stateRows = Object.keys(counts.byState || {})
    .sort()
    .map(
      (state) =>
        `<span class="state-pill" style="background:${stateBadgeColor(state)}">${esc(state)}: ${fmtNum(
          counts.byState[state]
        )}</span>`
    )
    .join(' ');

  return `
  <section class="summary">
    <h1>Skyline Thumbnail Report</h1>
    <div class="meta-grid">
      <div><strong>Run ID</strong><br>${esc(runId)}</div>
      <div><strong>Generated</strong><br>${esc(generatedAt)}</div>
      <div><strong>Mode</strong><br>${esc(mode)}</div>
      <div><strong>Flag enabled</strong><br>${flagEnabled ? 'yes' : 'no'}</div>
      <div><strong>Target</strong><br>${esc(target)}</div>
      <div><strong>Total entities scanned</strong><br>${fmtNum(counts.totalEntities)}</div>
      <div><strong>Eligible (default policy)</strong><br>${fmtNum(counts.eligibleCount)}</div>
      <div><strong>Targeted this run</strong><br>${fmtNum(counts.targetCount)}</div>
      <div><strong>Unique mix keys</strong><br>${fmtNum(counts.uniqueMixKeyCount)}</div>
      <div><strong>Duplicate mix records</strong><br>${fmtNum(counts.duplicateRecordCount)}</div>
    </div>
    <div class="state-pills">${stateRows}</div>
    <details>
      <summary>Filters used</summary>
      <pre>${esc(JSON.stringify(filters, null, 2))}</pre>
    </details>
  </section>`;
}

function renderRow(row) {
  const label = row.entityType === 'mix' ? `${row.artistName || row.artistFilename} — ${row.mixTitle || 'Untitled'}` : `${row.artistName || row.artistFilename} (artist)`;

  const previewCell = row.previewRelPath
    ? `<img class="preview" src="${esc(row.previewRelPath)}" alt="proposed thumbnail preview" loading="lazy">`
    : `<div class="preview preview-empty">${esc(row.mediaStatus || 'n/a')}</div>`;

  const statusClass = row.willAssign ? 'row-targeted' : 'row-skipped';

  return `
    <tr class="${statusClass}">
      <td>${previewCell}</td>
      <td>
        <div class="entity-label">${esc(label)}</div>
        <div class="entity-sub">${esc(row.entityType)} · key ${esc(row.entityKey)}${row.duplicateRecord ? ' · <span class="dup">duplicate record</span>' : ''}</div>
      </td>
      <td><span class="state-pill" style="background:${stateBadgeColor(row.state)}">${esc(row.state)}</span></td>
      <td class="url-cell">${esc(row.currentUrl) || '<em>empty</em>'}</td>
      <td>${esc(row.sourceVideoId) || '—'}</td>
      <td>${fmtSec(row.sourceTimeSec)}</td>
      <td>${esc(row.candidateId) || '—'}</td>
      <td class="hash-cell">${esc(row.dHash) || '—'}</td>
      <td>${fmtNum(row.probeCount)}${typeof row.rejectedCount === 'number' ? ` / ${row.rejectedCount} rejected` : ''}</td>
      <td>${row.willAssign ? '<span class="assign-yes">targeted</span>' : esc(row.skipReason || row.applyReason || '—')}</td>
    </tr>`;
}

/**
 * @param {object} report the same shape written to report.json
 * @returns {string} a complete, self-contained HTML document
 */
export function renderSkylineReportHtml(report) {
  const rows = (report.entities || []).map(renderRow).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Skyline Thumbnail Report — ${esc(report.runId)}</title>
<style>
  body { font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0; padding: 24px; background: #f7f7f5; color: #1a1a1a; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  .summary { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; }
  .meta-grid { display: grid; grid-template-columns: repeat(5, minmax(120px, 1fr)); gap: 10px 16px; margin: 12px 0; }
  .meta-grid > div { font-size: 12px; }
  .state-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .state-pill { display: inline-block; color: #fff; border-radius: 999px; padding: 2px 10px; font-size: 11px; white-space: nowrap; }
  details { margin-top: 10px; font-size: 12px; }
  pre { white-space: pre-wrap; word-break: break-word; background: #f0f0ee; padding: 8px; border-radius: 6px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
  th, td { border-bottom: 1px solid #eee; padding: 8px 10px; text-align: left; vertical-align: top; font-size: 12px; }
  th { background: #efefe9; position: sticky; top: 0; }
  tr.row-skipped { opacity: 0.65; }
  .preview { width: 96px; height: 96px; object-fit: cover; border-radius: 6px; display: block; background: #ddd; }
  .preview-empty { display: flex; align-items: center; justify-content: center; font-size: 10px; color: #666; text-align: center; padding: 4px; }
  .entity-label { font-weight: 600; }
  .entity-sub { color: #666; font-size: 11px; }
  .dup { color: #b91c1c; font-weight: 600; }
  .url-cell { max-width: 220px; overflow-wrap: anywhere; }
  .hash-cell { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .assign-yes { color: #0a6e3a; font-weight: 600; }
  table { table-layout: fixed; }
  .wrap { overflow-x: auto; }
</style>
</head>
<body>
${renderSummary(report)}
<div class="wrap">
<table>
  <thead>
    <tr>
      <th style="width:110px">Proposed image</th>
      <th>Artist — Mix title</th>
      <th style="width:120px">State</th>
      <th>Current URL</th>
      <th>Source video</th>
      <th>Timestamp</th>
      <th>Candidate ID</th>
      <th>dHash</th>
      <th>Probe/reject</th>
      <th>Status / skip reason</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
</div>
</body>
</html>`;
}
