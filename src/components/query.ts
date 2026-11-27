// Build links that keep the current filters (used by sort links and pagination).
export function withParams(url: URL, changes: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams(url.search);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === undefined || v === '') p.delete(k);
    else p.set(k, String(v));
  }
  const q = p.toString();
  return `${url.pathname}${q ? `?${q}` : ''}`;
}

/** ids used in aria-describedby for a form field */
export function fieldDescribedBy(id: string, opts: { hint?: boolean; error?: boolean }): string | undefined {
  const ids = [opts.hint ? `${id}-hint` : '', opts.error ? `${id}-err` : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

/** Page numbers to show: first, last, current +-1, with null as a gap. */
export function pageWindow(page: number, totalPages: number): Array<number | null> {
  const keep = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const nums = [...keep].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - (nums[i - 1] as number) > 1) out.push(null);
    out.push(n);
  });
  return out;
}
