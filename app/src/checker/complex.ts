/**
 * A small evaluator for the answers the pilot's exercises ask for.
 *
 * The package keys are proven at build time by tools/grade.py with SymPy. The
 * device cannot run SymPy, so this module covers exactly the class of answer
 * the four units need: rational or decimal numbers and the imaginary unit,
 * combined by +, -, *, /, ^ (or **), implicit multiplication and brackets;
 * the constants π and e; sqrt (√), ln (or log, the natural logarithm, as in
 * SymPy) and exp; and, when the checker passes a value for it, one variable
 * such as x. It mirrors the grader's Unicode folding (minus signs, dots,
 * superscripts) so a student's "5 − 3i" and the key's "5 - 3*I" evaluate to
 * the same value.
 *
 * Anything outside that grammar (another variable, a trigonometric
 * function) is an UnsupportedInput error, which the checker reports as
 * "cannot be checked automatically" rather than guessing a grade. A value
 * outside a function's domain (the logarithm of a negative number, a
 * division by zero) is a DomainError, so a checker sampling a function can
 * skip that point.
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

export class DomainError extends UnsupportedInput {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

// The same folds as _UNICODE_FOLD and _SUPERSCRIPTS in tools/grade.py, limited
// to what these answers can contain. "**" goes first so that it is not read
// as two multiplications.
const UNICODE_FOLD: Array<[string, string]> = [
  ['**', '^'],
  ['−', '-'], ['–', '-'], ['—', '-'],
  ['×', '*'], ['⋅', '*'], ['·', '*'], ['÷', '/'], ['⁄', '/'],
  ['²', '^2'], ['³', '^3'],
  [' ', ' '], [' ', ' '],
];

// A leading label such as "z =", "y =", "x_1 =", "E(X) =", "Var(X) =",
// "SD(X) =" or "σ =" is not part of the answer.
const LABEL = /^\s*(?:[A-Za-zσμ]{1,4}(?:_?\d)?(?:\(\s*[A-Za-z]\s*\))?)\s*=\s*/;

export function fold(text: string): string {
  let s = text;
  for (const [from, to] of UNICODE_FOLD) {
    s = s.split(from).join(to);
  }
  if (s.split('=').length === 2) {
    s = s.replace(LABEL, '');
  }
  return s.trim();
}

type Fn = 'sqrt' | 'ln' | 'exp';

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'i' }
  | { kind: 'var'; value: number }
  | { kind: 'fn'; name: Fn }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '^' }
  | { kind: '(' }
  | { kind: ')' };

const WORDS: Record<string, Token> = {
  i: { kind: 'i' },
  I: { kind: 'i' },
  j: { kind: 'i' },
  pi: { kind: 'num', value: Math.PI },
  Pi: { kind: 'num', value: Math.PI },
  PI: { kind: 'num', value: Math.PI },
  e: { kind: 'num', value: Math.E },
  E: { kind: 'num', value: Math.E },
  sqrt: { kind: 'fn', name: 'sqrt' },
  ln: { kind: 'fn', name: 'ln' },
  log: { kind: 'fn', name: 'ln' },
  exp: { kind: 'fn', name: 'exp' },
};

function tokenize(s: string, vars: Record<string, number>): Token[] {
  const out: Token[] = [];
  let k = 0;
  while (k < s.length) {
    const c = s[k];
    if (c === ' ') {
      k += 1;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      // No scientific notation: "2e+1" is 2e + 1, as a student means it.
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(k));
      if (!m) {
        throw new UnsupportedInput(`unexpected "${c}"`);
      }
      out.push({ kind: 'num', value: Number(m[1]) });
      k += m[1].length;
      continue;
    }
    if (c === 'π') {
      out.push({ kind: 'num', value: Math.PI });
      k += 1;
      continue;
    }
    if (c === '√') {
      out.push({ kind: 'fn', name: 'sqrt' });
      k += 1;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      const word = /^[a-zA-Z]+/.exec(s.slice(k))![0];
      if (Object.prototype.hasOwnProperty.call(vars, word)) {
        out.push({ kind: 'var', value: vars[word] });
      } else if (Object.prototype.hasOwnProperty.call(WORDS, word)) {
        out.push(WORDS[word]);
      } else if (word.length > 1 && [...word].every(ch => Object.prototype.hasOwnProperty.call(vars, ch))) {
        // "xx" is unusual but harmless; a run of the variable is a product.
        for (const ch of word) {
          out.push({ kind: 'var', value: vars[ch] });
        }
      } else {
        throw new UnsupportedInput(`"${word}" is a variable or function the tablet cannot check`);
      }
      k += word.length;
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
    throw new UnsupportedInput(`unexpected "${c}"`);
  }
  return out;
}

const real = (x: number): Complex => ({ re: x, im: 0 });
const add = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const sub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
const mul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
function div(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) {
    throw new DomainError('division by zero');
  }
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

function expC(z: Complex): Complex {
  const r = Math.exp(z.re);
  return z.im === 0 ? real(r) : { re: r * Math.cos(z.im), im: r * Math.sin(z.im) };
}

function sqrtC(z: Complex): Complex {
  if (z.im === 0) {
    return z.re >= 0 ? real(Math.sqrt(z.re)) : { re: 0, im: Math.sqrt(-z.re) };
  }
  const r = Math.hypot(z.re, z.im);
  return { re: Math.sqrt((r + z.re) / 2), im: Math.sign(z.im) * Math.sqrt((r - z.re) / 2) };
}

function lnC(z: Complex): Complex {
  if (z.im !== 0 || z.re <= 0) {
    throw new DomainError('the logarithm of a number that is not positive');
  }
  return real(Math.log(z.re));
}

const FNS: Record<Fn, (z: Complex) => Complex> = { sqrt: sqrtC, ln: lnC, exp: expC };

function pow(a: Complex, b: Complex): Complex {
  // Whole-number powers are exact repeated products, which is all i² and
  // (a+bi)² need; other real powers of a positive base go through Math.pow.
  if (b.im === 0 && Number.isInteger(b.re) && Math.abs(b.re) <= 12) {
    let r: Complex = real(1);
    for (let n = 0; n < Math.abs(b.re); n += 1) {
      r = mul(r, a);
    }
    return b.re < 0 ? div(real(1), r) : r;
  }
  if (a.im === 0 && a.re > 0) {
    if (b.im === 0) {
      return real(Math.pow(a.re, b.re));
    }
    return expC(mul(b, real(Math.log(a.re))));
  }
  if (a.im === 0 && a.re === 0 && b.im === 0 && b.re > 0) {
    return real(0);
  }
  throw new DomainError('a power the tablet cannot evaluate');
}

/**
 * Recursive descent over:
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/')? unary)*      implicit product allowed
 *   unary   := ('+' | '-') unary | power
 *   power   := atom ('^' unary)?
 *   atom    := number | i | variable | fn power | '(' expr ')'
 * A function applies to the bracket or the single power after it, so
 * "ln x", "√2" and "sqrt(1 - x^2)" read as written.
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
      } else if (p && (p.kind === 'num' || p.kind === 'i' || p.kind === 'var' || p.kind === 'fn' || p.kind === '(')) {
        // Implicit multiplication: "3i", "2(1+i)", "2x", "2ln 3".
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
    if (p.kind === 'num' || p.kind === 'var') {
      this.pos += 1;
      return real(p.value);
    }
    if (p.kind === 'i') {
      this.pos += 1;
      return { re: 0, im: 1 };
    }
    if (p.kind === 'fn') {
      this.pos += 1;
      return FNS[p.name](this.power());
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

/**
 * Evaluate an answer. `vars` gives the value of each variable the answer may
 * use, for a checker comparing two functions at sample points; without it a
 * letter other than i, e or a function name is unsupported.
 */
export function evaluate(text: string, vars: Record<string, number> = {}): Complex {
  return new Parser(tokenize(fold(text), vars)).parse();
}

export function approxEqual(a: Complex, b: Complex, tolerance = 1e-9): boolean {
  return Math.abs(a.re - b.re) <= tolerance && Math.abs(a.im - b.im) <= tolerance;
}
