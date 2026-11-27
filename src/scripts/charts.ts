// Dashboard charts C1-C3 (ADR-001: Chart.js from npm, bundled; CSP script-src 'self'; no inline scripts).
// Data arrives in data-chart (JSON written by the server from src/lib/kpi). No KPI math here.
import { Chart, BarController, LineController, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Legend, Tooltip } from 'chart.js';

Chart.register(BarController, LineController, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Legend, Tooltip);

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const c1 = css('--chart-1', '#1f5fa8'), c2 = css('--chart-2', '#b45309'), grey = css('--chart-target', '#5b6470'), text = css('--chart-text', '#1b2430');
Chart.defaults.color = text;
Chart.defaults.font.size = 13;
Chart.defaults.animation = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 300 };

const axisTitle = (t: string) => ({ display: true, text: t });

function build(cfg: any): any {
  const base = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };
  if (cfg.type === 'c1') {
    return {
      type: 'line',
      data: { labels: cfg.labels, datasets: [
        { label: 'On-time %', data: cfg.values, borderColor: c1, backgroundColor: c1, pointStyle: 'circle', pointRadius: 4, spanGaps: false },
        { label: `Target ${cfg.target} %`, data: cfg.labels.map(() => cfg.target), borderColor: grey, borderDash: [6, 4], pointRadius: 0, borderWidth: 2 },
      ] },
      options: { ...base, scales: { y: { min: 0, max: 100, title: axisTitle('On-time shipments (%)') }, x: { title: axisTitle('ISO week') } } },
    };
  }
  if (cfg.type === 'c2') {
    return {
      data: { labels: cfg.labels, datasets: [
        { type: 'bar', label: 'Shipments shipped', data: cfg.shipments, backgroundColor: c1, yAxisID: 'y' },
        { type: 'line', label: 'Packaging error rate %', data: cfg.rate, borderColor: c2, backgroundColor: c2, pointStyle: 'rect', pointRadius: 4, yAxisID: 'y1', spanGaps: false },
      ] },
      options: { ...base, scales: { y: { beginAtZero: true, title: axisTitle('Shipments shipped'), ticks: { precision: 0 } },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: axisTitle('Packaging error rate (%)') } } },
    };
  }
  return {
    data: { labels: cfg.labels, datasets: [
      { type: 'bar', label: 'Errors (count)', data: cfg.counts, backgroundColor: c1, yAxisID: 'y' },
      { type: 'line', label: 'Cumulative share %', data: cfg.cumulative, borderColor: c2, backgroundColor: c2, pointStyle: 'rectRot', pointRadius: 5, borderDash: [2, 3], yAxisID: 'y1' },
    ] },
    options: { ...base, scales: { y: { beginAtZero: true, title: axisTitle('Packaging errors (count)'), ticks: { precision: 0 } },
      y1: { min: 0, max: 100, position: 'right', grid: { drawOnChartArea: false }, title: axisTitle('Cumulative share (%)') } } },
  };
}

for (const canvas of document.querySelectorAll<HTMLCanvasElement>('canvas[data-chart]')) {
  try {
    const cfg = JSON.parse(canvas.dataset.chart ?? '{}');
    new Chart(canvas, build(cfg));
    // The chart drew: the data table stays available but starts collapsed.
    canvas.closest('.chart-card')?.querySelector<HTMLDetailsElement>('details.chart-data')?.removeAttribute('open');
  } catch {
    /* leave the server-rendered summary and table as the fallback */
  }
}
