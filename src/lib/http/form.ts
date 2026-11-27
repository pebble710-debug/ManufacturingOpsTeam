// HTML form adapter (contract section 1.12): urlencoded body -> the object the JSON Zod schema expects.
import { HttpError } from './errors';
import { readBodyCapped } from './pipeline';

const RESERVED = new Set(['_csrf', 'intent', 'add_line', 'remove_line']);
// Names that carry numbers: parsed strictly (text stays text, so Zod rejects it).
const NUMERIC = /^(id|.+_id|line_id|qty|qty_.+|.+_qty|packages_count|total_weight_lb|.+_pct|.+_days|.+_minutes)$/;
const STRICT_INT = /^-?\d+$/;
const STRICT_NUM = /^-?\d+(\.\d+)?$/;

export interface DecodedForm {
  input: Record<string, unknown>;
  /** Value of the pressed submit button (`intent`), if any. */
  intent: string | null;
  /** True when the body carried `add_line` or `remove_line` (re-render without writing). */
  rowAction: boolean;
}

function setPath(root: Record<string, unknown>, path: string[], value: unknown): void {
  let cur: any = root;
  for (let i = 0; i < path.length; i++) {
    const k = path[i];
    const last = i === path.length - 1;
    if (last) {
      cur[k] = value;
    } else {
      const nextIsIndex = /^\d+$/.test(path[i + 1]);
      if (cur[k] === undefined) cur[k] = nextIsIndex ? [] : {};
      cur = cur[k];
    }
  }
}

function parseName(name: string): string[] | null {
  // a[0][b], a[b], a
  const m = /^([A-Za-z_][A-Za-z0-9_]*)((?:\[[A-Za-z0-9_]+\])*)$/.exec(name);
  if (!m) return null;
  const rest = m[2] ? m[2].slice(1, -1).split('][') : [];
  return [m[1], ...rest];
}

function coerce(leaf: string, v: string): unknown {
  if (!NUMERIC.test(leaf)) return v;
  if (STRICT_INT.test(v) || STRICT_NUM.test(v)) return Number(v);
  return v;
}

/**
 * Decodes urlencoded text. `booleans` names fields that are true when present and false when absent
 * (top-level names only). Empty strings are dropped (= missing).
 */
export function decodeForm(text: string, opts: { booleans?: string[] } = {}): DecodedForm {
  const params = new URLSearchParams(text);
  const input: Record<string, unknown> = {};
  let intent: string | null = null;
  let rowAction = false;
  for (const [name, value] of params) {
    if (name === 'intent') intent = value;
    if (name === 'add_line' || name === 'remove_line') rowAction = true;
    if (RESERVED.has(name)) continue;
    const path = parseName(name);
    if (!path) throw new HttpError(400, 'UNKNOWN_FIELD', 'The request contains fields that are not accepted.', { fields: { [name.slice(0, 40)]: 'not accepted' } });
    if (value === '') continue;
    setPath(input, path, coerce(path[path.length - 1], value));
  }
  for (const b of opts.booleans ?? []) input[b] = params.has(b) && params.get(b) !== '' && params.get(b) !== 'false';
  // Arrays built from sparse indexes: drop holes.
  const compact = (v: unknown): unknown => (Array.isArray(v) ? v.filter((x) => x !== undefined).map(compact) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, compact(x)])) : v);
  return { input: compact(input) as Record<string, unknown>, intent, rowAction };
}

export async function readFormBody(request: Request, opts: { booleans?: string[] } = {}): Promise<DecodedForm> {
  return decodeForm(await readBodyCapped(request), opts);
}
