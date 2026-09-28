/**
 * A small evaluator for answers in the algebraic form a + bi.
 *
 * The package keys are proven at build time by tools/grade.py with SymPy. The
 * device cannot run SymPy, so this module covers exactly the class of answer
 * the pilot's exercises ask for: rational or decimal numbers combined with the
 * imaginary unit by +, -, *, /, implicit multiplication and brackets. It
 * mirrors the grader's Unicode folding (minus signs, dots, superscripts) so a
 * student's "5 − 3i" and the key's "5 - 3*I" evaluate to the same value.
 *
 * Anything outside that grammar (a square root, a variable, a function) is an
 * UnsupportedInput error, which the checker reports as "cannot be checked
 * automatically" rather than guessing a grade.
 *
 * Pure: no React, no database.
 */

export type Complex = { re: number; im: number };

export class UnsupportedInput extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedInput';
  }
}

// The same folds as _UNICODE_FOLD and _SUPERSCRIPTS in tools/grade.py, limited
// to what an a + bi answer can contain.
const UNICODE_FOLD: Array<[string, string]> = [
  ['−', '-'], ['–', '-'], ['—', '-'],
  ['×', '*'], ['⋅', '*'], ['·', '*'], ['÷', '/'], ['⁄', '/'],
  ['²', '^2'], ['³', '^3'],
  [' ', ' '], [' ', ' '],
];

export function fold(text: string): string {
  let s = text;
  for (const [from, to] of UNICODE_FOLD) {
    s = s.split(from).join(to);
  }
  // The grader accepts "z = 5 + 3i"; strip that kind of label.
  s = s.replace(/^\s*[a-zA-Z](?:_?\d)?\s*=\s*/, '');
  return s.trim();
}

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'i' }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '^' }
  | { kind: '(' }
  | { kind: ')' };

function tokenize(s: string): Token[] {
  const out: Token[] = [];
  let k = 0;
  while (k < s.length) {
    const c = s[k];
    if (c === ' ') {
      k += 1;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(k));
      if (!m) {
        throw new UnsupportedInput(`unexpected "${c}"`);
      }
      out.push({ kind: 'num', value: Number(m[1]) });
      k += m[1].length;
      continue;
    }
    if (c === 'i' || c === 'I' || c === 'j') {
      // A lone i is the imaginary unit; a letter run such as "sin" is not.
      const next = s[k + 1];
      if (next !== undefined && /[a-zA-Z]/.test(next)) {
        throw new UnsupportedInput('a variable or function name');
      }
      out.push({ kind: 'i' });
      k += 1;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^') {
      out.push({ kind: 'op', value: c });
      k += 1;
      continue;
    }
    if (c === '(' || c === '[') {
      out.push({ kind: '(' });
      k += 1;
      continue;
    }
    if (c === ')' || c === ']') {
      out.push({ kind: ')' });
      k += 1;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      throw new UnsupportedInput('a variable or function name');
    }
    throw new UnsupportedInput(`unexpected "${c}"`);
  }
  return out;
}

const add = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const sub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
const mul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
function div(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) {
    throw new UnsupportedInput('division by zero');
  }
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}
function pow(a: Complex, b: Complex): Complex {
  // Only small non-negative integer powers, which is all i² and (a+bi)² need.
  if (b.im !== 0 || !Number.isInteger(b.re) || b.re < 0 || b.re > 8) {
    throw new UnsupportedInput('a power other than a small whole number');
  }
  let r: Complex = { re: 1, im: 0 };
  for (let n = 0; n < b.re; n += 1) {
    r = mul(r, a);
  }
  return r;
}

/**
 * Recursive descent over:
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/')? unary)*      implicit product allowed
 *   unary   := ('+' | '-') unary | power
 *   power   := atom ('^' unary)?
 *   atom    := number | i | '(' expr ')'
 */
class Parser {
  private pos = 0;
  constructor(private readonly t: Token[]) {}

  parse(): Complex {
    if (this.t.length === 0) {
      throw new UnsupportedInput('empty');
    }
    const v = this.expr();
    if (this.pos !== this.t.length) {
      throw new UnsupportedInput('unexpected trailing input');
    }
    return v;
  }

  private peek(): Token | undefined {
    return this.t[this.pos];
  }

  private expr(): Complex {
    let v = this.term();
    for (;;) {
      const p = this.peek();
      if (p?.kind === 'op' && (p.value === '+' || p.value === '-')) {
        this.pos += 1;
        const r = this.term();
        v = p.value === '+' ? add(v, r) : sub(v, r);
      } else {
        return v;
      }
    }
  }

  private term(): Complex {
    let v = this.unary();
    for (;;) {
      const p = this.peek();
      if (p?.kind === 'op' && (p.value === '*' || p.value === '/')) {
        this.pos += 1;
        const r = this.unary();
        v = p.value === '*' ? mul(v, r) : div(v, r);
      } else if (p && (p.kind === 'num' || p.kind === 'i' || p.kind === '(')) {
        // Implicit multiplication: "3i", "2(1+i)", "i3" is odd but harmless.
        v = mul(v, this.power());
      } else {
        return v;
      }
    }
  }

  private unary(): Complex {
    const p = this.peek();
    if (p?.kind === 'op' && (p.value === '+' || p.value === '-')) {
      this.pos += 1;
      const v = this.unary();
      return p.value === '-' ? { re: -v.re, im: -v.im } : v;
    }
    return this.power();
  }

  private power(): Complex {
    const base = this.atom();
    const p = this.peek();
    if (p?.kind === 'op' && p.value === '^') {
      this.pos += 1;
      return pow(base, this.unary());
    }
    return base;
  }

  private atom(): Complex {
    const p = this.peek();
    if (!p) {
      throw new UnsupportedInput('incomplete');
    }
    if (p.kind === 'num') {
      this.pos += 1;
      return { re: p.value, im: 0 };
    }
    if (p.kind === 'i') {
      this.pos += 1;
      return { re: 0, im: 1 };
    }
    if (p.kind === '(') {
      this.pos += 1;
      const v = this.expr();
      if (this.peek()?.kind !== ')') {
        throw new UnsupportedInput('unbalanced brackets');
      }
      this.pos += 1;
      return v;
    }
    throw new UnsupportedInput('unexpected operator');
  }
}

/** Evaluate an a + bi expression. Throws UnsupportedInput outside the grammar. */
export function evaluate(text: string): Complex {
  return new Parser(tokenize(fold(text))).parse();
}

export function approxEqual(a: Complex, b: Complex, tolerance = 1e-9): boolean {
  return Math.abs(a.re - b.re) <= tolerance && Math.abs(a.im - b.im) <= tolerance;
}
