# Component class reference (T-025)

Owner: Maya. For Felix (pages) and Kenji (dashboard). Source: `src/styles/app.css` + `tokens.css`. Behaviour and copy: [ui-spec.md](ui-spec.md).
Import once in the base layout: `import "../styles/app.css";` (it `@import`s tokens). No inline `style`, no `<style>`, no inline handlers (CSP, ui-spec 10.1). Icons are inline `<svg class="icon" aria-hidden="true">` using `currentColor`.

Breakpoints (mobile-first): 640 / 768 / 1024 (left nav) / 1280 (6 KPI tiles) / 1920 (root font 125 %). Wall view: `<html class="view-wall">`, set server-side when `?view=wall`.

## 1. Shell
```html
<html lang="en" class="view-wall?">   <!-- class only for wall view -->
<body class="app-shell">
  <a class="skip-link" href="#main">Skip to main content</a>
  <header>
    <div class="demo-banner"><div class="demo-banner__inner">
      <span class="demo-banner__label">DEMO – FICTIONAL DATA</span>
      <span>Cobalt Ridge Components, Inc. is fictional. No real data.</span></div></div>
    <div class="topbar"><div class="topbar__inner">
      <div class="topbar__brand"><a class="topbar__app" href="/dashboard">Cobalt Ridge Ops Dashboard</a>
        <span class="topbar__plant">Riverton plant</span></div>
      <p class="reporting-chip"><svg class="icon" aria-hidden="true">…</svg> As of 25 Nov 2026 – fixed demo date</p>
      <div class="user-menu">
        <span class="user-menu__name">Demo Shipper One</span><span class="role-badge">Shipping</span>
        <form method="post" action="/logout"><input type="hidden" name="_csrf" value="…">
          <button class="btn btn--secondary" type="submit">Sign out</button></form></div>
    </div></div>
  </header>
  <div class="app-body">
    <div class="site-nav-bar">
      <details class="nav-disclosure">             <!-- no JS; <1024 px: "Menu" button; >=1024 px: always open -->
        <summary>Menu</summary>
        <nav class="site-nav" aria-label="Main">
          <ul>
            <li><a class="site-nav__link" href="/dashboard" aria-current="page">Dashboard</a></li>
            <li><a class="site-nav__link" href="/shipments">Shipments</a></li>
            <li><p class="site-nav__group-title">Inventory</p>
              <ul class="site-nav__sub"><li><a class="site-nav__link" href="/inventory/on-hand">On-hand</a></li></ul></li>
          </ul>
        </nav>
      </details>
    </div>
    <main id="main" class="main" tabindex="-1"> … </main>
  </div>
  <footer class="site-footer"><div class="site-footer__inner">
    <span>Fictional demo system – not a certified or production system.</span><a href="/resources">Resources</a></div></footer>
</body>
```
Notes: browsers without `::details-content` (older Firefox/Safari) keep the working "Menu" disclosure at desktop width; an optional external `nav.js` may add `open` at ≥ 1024 px. Login/error pages: use `<main class="auth-page"><div class="auth-card card">`, no `.site-nav-bar`.

## 2. Page header, cards, layout helpers
| Class | Use |
|-------|-----|
| `page-header`, `page-header__row`, `page-header__title` (h1), `page-header__meta`, `page-header__actions` | Title block; actions are links/buttons |
| `breadcrumb` (`<nav aria-label="Breadcrumb"><ol><li>…`, last `aria-current="page"`) | Breadcrumb |
| `page-section` (+ `h2`) | Vertical section spacing |
| `card`, `card--flush`, `card--accent`, `card__title` | Surface |
| `detail-list` (`<dl><dt><dd>`) | Record summary (label / value) |
| `gate-list` + `gate-state gate-state--done|--todo` | Rework gate `<ol>` ("Done" / "Not done" text) |
| `stack` (`--sm --lg --xl`), `cluster` (`--sm --lg --end --between --top`), `grid` (`--2 --3 --auto`) | Layout |
| `visually-hidden`, `is-hidden`, `text-muted`, `text-small`, `text-mono`, `numeric`, `nowrap`, `wall-hide`, `wall-only`, `no-print` | Utilities |

## 3. Reporting-date label
```html
<p class="reporting-date"><svg class="icon" aria-hidden="true">…</svg>
  <span><span class="reporting-date__title">Reporting as of 25 Nov 2026 – demonstration data</span><br>
  <span class="reporting-date__note">Fixed demo date: KPIs, "overdue" and default dates use this date, not today's date.</span></span></p>
```

## 4. KPI tile (`<div class="kpi-grid">` holds six)
```html
<section class="kpi-tile kpi-tile--misses" aria-labelledby="kpi-1">   <!-- --meets | --misses | --nodata -->
  <h3 class="kpi-tile__label" id="kpi-1">On-Time Shipment %</h3>
  <p class="kpi-tile__value">94.2<span class="kpi-tile__unit">%</span></p>   <!-- keep value+unit one text run -->
  <p class="kpi-tile__target">Target: 95 %</p>
  <p class="kpi-tile__status"><span class="badge badge--danger"><svg class="icon" aria-hidden="true">…</svg> Misses target</span></p>
  <p class="kpi-tile__delta kpi-tile__delta--better">   <!-- --better | --worse | --flat (words carry the meaning) -->
    <span class="kpi-tile__arrow" aria-hidden="true">▲</span> Up 1.1 pts vs previous period (better)</p>
  <details class="kpi-tile__help disclosure"><summary>How is this calculated?</summary>
    <div class="kpi-tile__help-body">…</div></details>
</section>
```
Meets = `badge--success`; Flat arrow `▬`; down `▼`. No-data: `kpi-tile--nodata`, value text `No data`, no arrow.

## 5. Badges
`<span class="badge badge--shipped"><svg class="icon" aria-hidden="true">…</svg> Shipped</span>` – text is always the accessible name.
| Kind | Classes |
|------|---------|
| Shipment status (v1, no Delivered) | `badge--planned`, `--ready` (Ready to Pack), `--packing`, `--verified`, `--shipped`, `--on-hold`, `--rework`, `--cancelled` |
| Severity (UD-5) | `badge--sev-low`, `--sev-medium`, `--sev-high`, `--sev-critical` (icons: circle, triangle, diamond, octagon) |
| Generic families | `badge--neutral`, `--info`, `--success`, `--warning`, `--danger`, `--muted` (on time, late, count/error/CA statuses) |
| Role | `role-badge` (top bar) |
Wrapper for several: `badge-row`.

## 6. Buttons
| Class | Use |
|-------|-----|
| `btn btn--primary` | One per region: next legal step |
| `btn btn--secondary`, `btn--danger`, `btn--ghost`, `btn--link` | Alternatives |
| `btn--block`, `btn--stack-mobile` | Full width (mobile) |
| `aria-disabled="true"` on any `.btn` | Unavailable look (dashed border); stays focusable; never use `disabled` |
```html
<div class="action-unavailable">
  <button class="btn btn--primary" type="submit" aria-disabled="true" aria-describedby="why-verify">Mark Verified</button>
  <p class="action-unavailable__reason" id="why-verify"><svg class="icon" aria-hidden="true">…</svg> You packed this shipment, so someone else must verify it.</p>
</div>
```
Button rows: `action-row` (primary first, link-style cancel last).

## 7. Forms
```html
<form class="form" method="post" novalidate>
  <!-- error summary first on 422, see section 8 -->
  <div class="form-field form-field--invalid">             <!-- --invalid optional; aria-invalid is enough -->
    <label class="form-field__label" for="f-track">Tracking number <span class="form-field__required">(required)</span></label>
    <p class="form-field__hint" id="f-track-hint">Carrier tracking number, for example SLP123456.</p>
    <input class="input" id="f-track" name="tracking" aria-describedby="f-track-hint f-track-err" aria-invalid="true">
    <p class="form-field__error" id="f-track-err"><svg class="icon" aria-hidden="true">…</svg><span>Enter a tracking number</span></p>
  </div>
  <div class="form-actions action-row">…</div>
</form>
```
Controls: `input`, `select`, `textarea` (`.input`, `.select`, `.textarea`), modifiers `input--narrow`, `input--code` (mono), `input--count` (56 px cycle-count entry). Layout: `form-grid form-grid--2`, `form--wide`. Groups: `fieldset`, `fieldset--plain` + `<legend>`.
Radios/checkbox: `<label class="choice"><input type="radio" name="x"><span class="choice__text">Label</span></label>` in `choice-group` (`--inline`); single checkbox `<label class="check"><input type="checkbox"><span>…</span></label>`.

Pack & Verify checklist item:
```html
<ol class="checklist"><li>
  <fieldset class="check-item"><legend>1. Part number and revision match the order</legend>
    <p class="check-item__help">…</p>
    <div class="choice-group choice-group--inline">
      <label class="choice choice--pass"><input type="radio" name="item1" value="pass"><span class="choice__text">Pass</span></label>
      <label class="choice choice--fail"><input type="radio" name="item1" value="fail"><span class="choice__text">Fail</span></label>
    </div></fieldset></li></ol>
```
(The check mark / cross glyphs are added by CSS before the word; the word stays.) Progress text: `checklist-progress` with `aria-live="polite"`.
Repeated lines: `<ul class="line-rows"><li class="line-row">` (4-col from 768 px; `line-row--count` for count entry); `line-row__title`.

## 8. Alerts, error summary, states
```html
<div class="alert alert--success" role="status"><svg class="icon alert__icon" aria-hidden="true">…</svg>
  <div class="alert__body"><p><span class="alert__lead">Saved:</span> Shipment SH-1042 moved to Verified.</p></div></div>
```
`alert--info|success|warning|error` (`role="status"` or `role="alert"`); stack several in `alert-list`.
```html
<div class="error-summary" role="group" aria-labelledby="es-title">
  <h2 class="error-summary__title" id="es-title" tabindex="-1" autofocus>There is a problem</h2>
  <p class="error-summary__intro">Fix the 2 items below, then submit again.</p>
  <ul class="error-summary__list"><li><a href="#f-track">Enter a tracking number</a></li></ul></div>
```
Empty: `<div class="empty-state"><p class="empty-state__title">…</p><p class="empty-state__text">…</p><div class="empty-state__actions">buttons</div></div>`. Error page: `error-state` (+ `__title __text __actions __ref`).

## 9. Data table, filters, pagination
```html
<form class="filter-bar" method="get" role="search" aria-label="Filter shipments">
  <div class="filter-bar__fields"><div class="form-field">…</div></div>
  <div class="filter-bar__actions"><button class="btn btn--primary">Apply filters</button><a class="btn btn--link" href="?">Clear filters</a></div></form>
<p class="result-count" aria-live="polite">Showing 1–25 of 287 shipments</p>
<div class="table-wrap" tabindex="0" role="region" aria-label="Shipments (scrolls sideways on small screens)">
  <table class="table"><caption class="visually-hidden">Shipments</caption>
    <thead><tr>
      <th scope="col" aria-sort="ascending"><a class="sort-link" href="?sort=ship_date">Ship date <span class="sort-link__icon" aria-hidden="true">▲</span><span class="visually-hidden">sorted ascending</span></a></th>
      <th scope="col" class="col-p2">Carrier</th><th scope="col" class="col-p3">Customer</th>
      <th scope="col" class="numeric">Qty</th></tr></thead>
    <tbody><tr><th scope="row" class="cell-id"><a href="/shipments/SH-1042">SH-1042</a></th><td class="col-p2">…</td>…</tr></tbody></table></div>
<nav class="pagination" aria-label="Pagination"><ul class="pagination__list">
  <li><a class="pagination__link" href="?page=1">Previous</a></li>
  <li><a class="pagination__link" href="?page=2" aria-current="page">2</a></li>
  <li><a class="pagination__link" aria-disabled="true">Next</a></li></ul></nav>
```
Columns: `col-p2` (≥768 px), `col-p3` (≥1024 px); wall view shows all. `numeric` right-aligns; `cell-id` mono. Modifiers: `table--compact`. Optional stacked rows < 640 px: `table--stack` with `data-label` on every `<td>` (short tables only; default is the scroll wrapper). `table-toolbar` holds the count and CSV link.

## 10. Disclosure, confirm pages, dialogs
`<details class="disclosure"><summary>View data table</summary>…</details>`. Confirm page: `<section class="confirm confirm--danger"><h1 class="confirm__title">…</h1><ul class="confirm__list">…</ul><div class="action-row">…</div></section>`. Optional `<dialog class="dialog">` only as enhancement; the confirm page works without JS.

## 11. Chart card (Kenji)
```html
<div class="chart-grid">
 <section class="chart-card" aria-labelledby="c1-t">           <!-- chart-card--wide spans both columns (C3) -->
  <h2 class="chart-card__title" id="c1-t">Are we shipping on time, and which way is it trending?</h2>
  <p class="chart-card__summary">Weekly on-time % ranged 90 to 98 %; last week 94 %, 1 pt below target.</p>
  <div class="chart-card__canvas"><canvas id="c1" role="img" aria-label="(same sentence)" data-chart="…"></canvas></div>
  <ul class="chart-legend"><li><span class="legend-swatch"></span> On-time %</li>
    <li><span class="legend-swatch legend-swatch--target"></span> Target 95 %</li></ul>
  <details class="chart-data disclosure" open>          <!-- open server-side; JS may close it once the chart draws -->
    <summary>View data table</summary>
    <div class="chart-data__table-wrap"><table class="table table--compact">…</table></div></details>
  <div class="chart-card__actions"><a class="btn btn--secondary" href="/shipments?…">Open the shipments behind this chart</a></div>
 </section></div>
```
Legend swatches: `legend-swatch` (line), `--line2`, `--target` (dashed), `--cum` (dotted), `--bar`. Canvas area keeps a light surface (`--chart-surface`) in dark mode so Chart.js colors (`--chart-1`, `--chart-2`, `--chart-target`) remain valid. Empty: `chart-card__nodata`. Chart height is set by CSS, never inline.

## 12. Dashboard order
`h1` > `reporting-date` > period form (`filter-bar`) > `h2.visually-hidden` "Key measures" > `kpi-grid` > `chart-grid`. Wall view: `view-wall` on `<html>`, `<p class="wall-only">Loaded at 10:07</p>`.
