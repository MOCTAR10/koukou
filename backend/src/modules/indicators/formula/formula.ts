/**
 * Safe, configurable indicator formulas (Programme POUFA: indicator rules must
 * never be hard-coded). Authorized staff type a French-Excel-like expression,
 * stored as text; this module tokenizes it, parses it into a plain JSON AST
 * (recursive descent, no `eval` / `new Function`) and evaluates it.
 *
 * Syntax:
 * - numbers with a decimal comma or dot (`0,5`, `0.5`), no exponent, no
 *   thousands separator;
 * - `+ - * /`, unary minus, parentheses, usual precedence;
 * - functions (case-insensitive) `min(a; b; …)`, `max(a; b; …)`, `abs(x)`,
 *   `arrondi(x; n)`, `si(condition; alors; sinon)`, arguments separated by `;`;
 * - comparisons `< <= > >= = <>`, allowed ONLY as the condition of `si`;
 * - variables in lowercase ASCII snake_case, restricted to a caller-given list;
 * - an optional leading `=` (Excel habit) is ignored.
 *
 * Evaluation never throws and never yields NaN/Infinity: a division by zero, a
 * missing (null/undefined/non-finite) needed variable or a non-finite result
 * gives `null`. `si` only evaluates the chosen branch.
 */

export const FORMULA_MAX_LENGTH = 500;
export const FORMULA_MAX_DEPTH = 50;

const VARIABLE_NAME = /^[a-z_][a-z0-9_]*$/;
/** `arrondi` digits are clamped to this range (beyond it, doubles have no precision left). */
const MAX_ROUND_DIGITS = 15;

export class FormulaError extends Error {
  override readonly name = 'FormulaError';

  constructor(
    message: string,
    /** 0-based character index in the source (`source.length` for "end of formula"). */
    readonly position: number,
    /** Set by `evaluateIndicatorSet` / `compileIndicatorSet`: the faulty indicator. */
    readonly indicatorKey?: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

export type ArithmeticOperator = '+' | '-' | '*' | '/';
export type ComparisonOperator = '<' | '<=' | '>' | '>=' | '=' | '<>';
export type FormulaFunction = 'min' | 'max' | 'abs' | 'arrondi';

/** Plain, JSON-serializable tree. `pos` is the 0-based index in the source. */
export type FormulaAst =
  | { readonly kind: 'number'; readonly value: number; readonly pos: number }
  | { readonly kind: 'variable'; readonly name: string; readonly pos: number }
  | {
      readonly kind: 'negate';
      readonly operand: FormulaAst;
      readonly pos: number;
    }
  | {
      readonly kind: 'binary';
      readonly op: ArithmeticOperator;
      readonly left: FormulaAst;
      readonly right: FormulaAst;
      readonly pos: number;
    }
  | {
      readonly kind: 'call';
      readonly fn: FormulaFunction;
      readonly args: readonly FormulaAst[];
      readonly pos: number;
    }
  | {
      readonly kind: 'if';
      readonly condition: FormulaComparison;
      readonly whenTrue: FormulaAst;
      readonly whenFalse: FormulaAst;
      readonly pos: number;
    };

/** Only ever the condition of a `si`: comparisons are not numeric values. */
export interface FormulaComparison {
  readonly kind: 'compare';
  readonly op: ComparisonOperator;
  readonly left: FormulaAst;
  readonly right: FormulaAst;
  readonly pos: number;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Punctuation = ArithmeticOperator | ComparisonOperator | '(' | ')' | ';';

type Token =
  | { type: 'number'; value: number; pos: number }
  | { type: 'ident'; text: string; pos: number }
  | { type: 'punct'; text: Punctuation; pos: number }
  | { type: 'end'; pos: number };

const COMPARISON_OPERATORS: ReadonlySet<string> = new Set([
  '<',
  '<=',
  '>',
  '>=',
  '=',
  '<>',
]);
const SINGLE_CHAR_PUNCTUATION: ReadonlySet<string> = new Set([
  '+',
  '-',
  '*',
  '/',
  '(',
  ')',
  ';',
  '=',
]);

const isDigit = (c: string) => c >= '0' && c <= '9';
const isIdentStart = (c: string) =>
  (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isIdentPart = (c: string) => isIdentStart(c) || isDigit(c);
const isSpace = (c: string) =>
  c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === ' ';

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (isSpace(c)) {
      i++;
      continue;
    }
    const start = i;
    if (isDigit(c)) {
      while (i < source.length && isDigit(source[i])) i++;
      let text = source.slice(start, i);
      if (source[i] === ',' || source[i] === '.') {
        const fractionStart = i + 1;
        let j = fractionStart;
        while (j < source.length && isDigit(source[j])) j++;
        if (j === fractionStart) {
          throw new FormulaError(
            `Nombre incomplet au caractère ${i + 1} : un chiffre est attendu après « ${source[i]} ».`,
            i,
          );
        }
        text += '.' + source.slice(fractionStart, j);
        i = j;
        if (source[i] === ',' || source[i] === '.') {
          throw new FormulaError(
            `Nombre invalide au caractère ${start + 1} : un seul séparateur décimal est permis (pas de séparateur de milliers).`,
            i,
          );
        }
      }
      if (i < source.length && isIdentStart(source[i])) {
        throw new FormulaError(
          `Nombre invalide au caractère ${start + 1} : « ${source.slice(start, i + 1)} ».`,
          start,
        );
      }
      tokens.push({ type: 'number', value: Number(text), pos: start });
      continue;
    }
    if (isIdentStart(c)) {
      while (i < source.length && isIdentPart(source[i])) i++;
      tokens.push({ type: 'ident', text: source.slice(start, i), pos: start });
      continue;
    }
    const two = source.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      tokens.push({ type: 'punct', text: two, pos: start });
      i += 2;
      continue;
    }
    if (c === '<' || c === '>' || SINGLE_CHAR_PUNCTUATION.has(c)) {
      tokens.push({ type: 'punct', text: c as Punctuation, pos: start });
      i++;
      continue;
    }
    if (c === ',') {
      throw new FormulaError(
        `Virgule inattendue au caractère ${i + 1} : séparez les arguments par « ; » (la virgule sert aux décimales).`,
        i,
      );
    }
    if (c === '.') {
      throw new FormulaError(
        `Point inattendu au caractère ${i + 1} : écrivez les décimales avec un chiffre avant (0,5).`,
        i,
      );
    }
    const char = String.fromCodePoint(source.codePointAt(i) ?? 0);
    throw new FormulaError(
      `Caractère non autorisé « ${char} » au caractère ${i + 1}.`,
      i,
    );
  }
  tokens.push({ type: 'end', pos: source.length });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const FUNCTION_ARITY: ReadonlyMap<
  FormulaFunction | 'si',
  { min: number; max: number }
> = new Map([
  // min/max demand two arguments so that `max(0,5)` (one number: 0.5) is
  // reported instead of silently returning 0.5.
  ['min', { min: 2, max: Infinity }],
  ['max', { min: 2, max: Infinity }],
  ['abs', { min: 1, max: 1 }],
  ['arrondi', { min: 2, max: 2 }],
  ['si', { min: 3, max: 3 }],
]);

const FUNCTION_LIST = 'min, max, abs, arrondi, si';

function describe(token: Token): string {
  switch (token.type) {
    case 'number':
      return `le nombre ${String(token.value).replace('.', ',')}`;
    case 'ident':
      return `« ${token.text} »`;
    case 'punct':
      return `« ${token.text} »`;
    case 'end':
      return 'la fin de la formule';
  }
}

function at(pos: number): string {
  return `au caractère ${pos + 1}`;
}

class Parser {
  private index = 0;
  private depth = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly allowed: ReadonlySet<string>,
  ) {}

  parse(): FormulaAst {
    if (this.isPunct('=')) this.index++; // Excel habit: "=a/b"
    if (this.peek().type === 'end') {
      throw new FormulaError('La formule est vide.', this.peek().pos);
    }
    const ast = this.parseExpression();
    const next = this.peek();
    if (next.type !== 'end') {
      if (next.type === 'punct' && next.text === ')') {
        throw new FormulaError(
          `Parenthèse fermante « ) » en trop ${at(next.pos)}.`,
          next.pos,
        );
      }
      throw new FormulaError(
        `${capitalize(describe(next))} inattendu ${at(next.pos)} : un opérateur est attendu.`,
        next.pos,
      );
    }
    return ast;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    return this.tokens[this.index++];
  }

  private isPunct(text: Punctuation): boolean {
    const t = this.peek();
    return t.type === 'punct' && t.text === text;
  }

  private enter(pos: number): void {
    this.depth++;
    if (this.depth > FORMULA_MAX_DEPTH) {
      throw new FormulaError(
        `Formule trop imbriquée ${at(pos)} : ${FORMULA_MAX_DEPTH} niveaux au maximum.`,
        pos,
      );
    }
  }

  private leave(): void {
    this.depth--;
  }

  /** A numeric expression: a comparison here is refused (only `si` takes one). */
  private parseExpression(): FormulaAst {
    const value = this.parseAdditive();
    const t = this.peek();
    if (t.type === 'punct' && COMPARISON_OPERATORS.has(t.text)) {
      throw new FormulaError(
        `Comparaison « ${t.text} » ${at(t.pos)} : les comparaisons ne sont permises que dans la condition de si(condition; alors; sinon).`,
        t.pos,
      );
    }
    return value;
  }

  private parseCondition(): FormulaComparison {
    const left = this.parseAdditive();
    const t = this.peek();
    if (t.type !== 'punct' || !COMPARISON_OPERATORS.has(t.text)) {
      throw new FormulaError(
        `La condition de si doit être une comparaison (par exemple presents > 0) ${at(t.pos)}.`,
        t.pos,
      );
    }
    this.index++;
    const right = this.parseAdditive();
    return {
      kind: 'compare',
      op: t.text as ComparisonOperator,
      left,
      right,
      pos: t.pos,
    };
  }

  private parseAdditive(): FormulaAst {
    let left = this.parseTerm();
    for (;;) {
      const t = this.peek();
      if (t.type !== 'punct' || (t.text !== '+' && t.text !== '-')) break;
      this.index++;
      const right = this.parseTerm();
      left = { kind: 'binary', op: t.text, left, right, pos: t.pos };
    }
    return left;
  }

  private parseTerm(): FormulaAst {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.type !== 'punct' || (t.text !== '*' && t.text !== '/')) break;
      this.index++;
      const right = this.parseUnary();
      left = { kind: 'binary', op: t.text, left, right, pos: t.pos };
    }
    return left;
  }

  private parseUnary(): FormulaAst {
    const t = this.peek();
    if (t.type === 'punct' && t.text === '-') {
      this.index++;
      this.enter(t.pos);
      const operand = this.parseUnary();
      this.leave();
      return { kind: 'negate', operand, pos: t.pos };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaAst {
    const t = this.next();
    switch (t.type) {
      case 'number':
        return { kind: 'number', value: t.value, pos: t.pos };
      case 'ident':
        return this.isPunct('(') ? this.parseCall(t) : this.variable(t);
      case 'end':
        throw new FormulaError(
          'Fin de formule inattendue : une valeur est attendue.',
          t.pos,
        );
      case 'punct':
        if (t.text === '(') {
          this.enter(t.pos);
          const inner = this.parseExpression();
          this.expectClosing(t.pos, 'Parenthèse « ( » ouverte');
          this.leave();
          return inner;
        }
        throw new FormulaError(
          `« ${t.text} » inattendu ${at(t.pos)} : une valeur est attendue.`,
          t.pos,
        );
    }
  }

  private expectClosing(openPos: number, what: string): void {
    const t = this.next();
    if (t.type === 'punct' && t.text === ')') return;
    if (t.type === 'end') {
      throw new FormulaError(
        `${what} ${at(openPos)} non fermée : « ) » manquante.`,
        openPos,
      );
    }
    throw new FormulaError(
      `${capitalize(describe(t))} inattendu ${at(t.pos)} : « ; » ou « ) » attendu.`,
      t.pos,
    );
  }

  private variable(t: { text: string; pos: number }): FormulaAst {
    const name = t.text;
    if (!VARIABLE_NAME.test(name)) {
      const lower = name.toLowerCase();
      throw new FormulaError(
        this.allowed.has(lower)
          ? `Variable « ${name} » ${at(t.pos)} : les noms de variables s'écrivent en minuscules (« ${lower} »).`
          : `Variable inconnue « ${name} » ${at(t.pos)}.`,
        t.pos,
      );
    }
    if (!this.allowed.has(name)) {
      throw new FormulaError(
        `Variable inconnue « ${name} » ${at(t.pos)}.`,
        t.pos,
      );
    }
    return { kind: 'variable', name, pos: t.pos };
  }

  private parseCall(t: { text: string; pos: number }): FormulaAst {
    const fn = t.text.toLowerCase() as FormulaFunction | 'si';
    const arity = FUNCTION_ARITY.get(fn);
    if (!arity) {
      throw new FormulaError(
        `Fonction inconnue « ${t.text} » ${at(t.pos)} (fonctions disponibles : ${FUNCTION_LIST}).`,
        t.pos,
      );
    }
    this.index++; // "("
    this.enter(t.pos);
    let condition: FormulaComparison | undefined;
    const args: FormulaAst[] = [];
    if (!this.isPunct(')')) {
      if (fn === 'si') condition = this.parseCondition();
      else args.push(this.parseExpression());
      while (this.isPunct(';')) {
        this.index++;
        args.push(this.parseExpression());
      }
    }
    this.expectClosing(t.pos, `Fonction ${fn}`);
    this.leave();

    const count = args.length + (condition ? 1 : 0);
    if (count < arity.min || count > arity.max) {
      const expected =
        arity.max === Infinity
          ? `au moins ${arity.min} arguments`
          : `${arity.min} argument${arity.min > 1 ? 's' : ''}`;
      throw new FormulaError(
        `La fonction ${fn} ${at(t.pos)} attend ${expected} séparés par « ; » (${count} fourni${count > 1 ? 's' : ''}).`,
        t.pos,
      );
    }
    if (fn === 'si') {
      return {
        kind: 'if',
        condition: condition!,
        whenTrue: args[0],
        whenFalse: args[1],
        pos: t.pos,
      };
    }
    return { kind: 'call', fn, args, pos: t.pos };
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Parses `source`; every variable must belong to `allowedVariables`.
 * @throws FormulaError (French message, 0-based `position`).
 */
export function parseFormula(
  source: string,
  allowedVariables: readonly string[],
): FormulaAst {
  if (typeof source !== 'string') {
    throw new FormulaError('La formule doit être un texte.', 0);
  }
  if (source.length > FORMULA_MAX_LENGTH) {
    throw new FormulaError(
      `Formule trop longue : ${FORMULA_MAX_LENGTH} caractères au maximum (${source.length} saisis).`,
      FORMULA_MAX_LENGTH,
    );
  }
  return new Parser(tokenize(source), new Set(allowedVariables)).parse();
}

/** Distinct variable names, in order of first appearance. */
export function formulaVariables(ast: FormulaAst): string[] {
  const seen = new Set<string>();
  const visit = (node: FormulaAst | FormulaComparison): void => {
    switch (node.kind) {
      case 'number':
        return;
      case 'variable':
        seen.add(node.name);
        return;
      case 'negate':
        return visit(node.operand);
      case 'binary':
      case 'compare':
        visit(node.left);
        return visit(node.right);
      case 'call':
        return node.args.forEach(visit);
      case 'if':
        visit(node.condition);
        visit(node.whenTrue);
        return visit(node.whenFalse);
    }
  };
  visit(ast);
  return [...seen];
}

export type FormulaValidation =
  | { ok: true; variables: string[] }
  | { ok: false; error: string; position: number };

/** Non-throwing `parseFormula`, for forms and API validation. */
export function validateFormula(
  source: string,
  allowedVariables: readonly string[],
): FormulaValidation {
  try {
    const ast = parseFormula(source, allowedVariables);
    return { ok: true, variables: formulaVariables(ast) };
  } catch (e) {
    if (e instanceof FormulaError) {
      return { ok: false, error: e.message, position: e.position };
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

type Lookup = (name: string) => unknown;

const finite = (x: number): number | null => (Number.isFinite(x) ? x : null);

/** Equality with ~12 significant digits, so `0,1 + 0,2 = 0,3` holds as in Excel. */
function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
}

function compare(op: ComparisonOperator, a: number, b: number): boolean {
  const eq = nearlyEqual(a, b);
  switch (op) {
    case '=':
      return eq;
    case '<>':
      return !eq;
    case '<':
      return a < b && !eq;
    case '<=':
      return a < b || eq;
    case '>':
      return a > b && !eq;
    case '>=':
      return a > b || eq;
  }
}

/** Excel ARRONDI: half away from zero, tolerant of binary noise (1,005 → 1,01). */
function round(x: number, digits: number): number | null {
  const n = Math.max(
    -MAX_ROUND_DIGITS,
    Math.min(MAX_ROUND_DIGITS, Math.trunc(digits)),
  );
  const factor = 10 ** n;
  const scaled = Number((Math.abs(x) * factor).toPrecision(15));
  return finite((Math.sign(x) * Math.round(scaled)) / factor);
}

function evaluateNode(node: FormulaAst, lookup: Lookup): number | null {
  switch (node.kind) {
    case 'number':
      return finite(node.value);
    case 'variable': {
      const v = lookup(node.name);
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    case 'negate': {
      const v = evaluateNode(node.operand, lookup);
      return v === null ? null : -v;
    }
    case 'binary': {
      const l = evaluateNode(node.left, lookup);
      if (l === null) return null;
      const r = evaluateNode(node.right, lookup);
      if (r === null) return null;
      switch (node.op) {
        case '+':
          return finite(l + r);
        case '-':
          return finite(l - r);
        case '*':
          return finite(l * r);
        case '/':
          return r === 0 ? null : finite(l / r);
      }
      return null;
    }
    case 'call': {
      const values: number[] = [];
      for (const arg of node.args) {
        const v = evaluateNode(arg, lookup);
        if (v === null) return null;
        values.push(v);
      }
      switch (node.fn) {
        case 'min':
          return Math.min(...values);
        case 'max':
          return Math.max(...values);
        case 'abs':
          return Math.abs(values[0]);
        case 'arrondi':
          return round(values[0], values[1]);
      }
      return null;
    }
    case 'if': {
      const { op, left, right } = node.condition;
      const l = evaluateNode(left, lookup);
      if (l === null) return null;
      const r = evaluateNode(right, lookup);
      if (r === null) return null;
      return evaluateNode(
        compare(op, l, r) ? node.whenTrue : node.whenFalse,
        lookup,
      );
    }
  }
  return null;
}

function evaluateWith(ast: FormulaAst, lookup: Lookup): number | null {
  const result = evaluateNode(ast, lookup);
  return result === 0 ? 0 : result; // normalizes -0
}

/**
 * Evaluates a parsed formula. Returns `null` (never NaN/Infinity, never throws)
 * on a division by zero, a missing/non-finite needed variable or a non-finite
 * result. Only own properties of `values` are read.
 */
export function evaluateFormula(
  ast: FormulaAst,
  values: Readonly<Record<string, number | null | undefined>>,
): number | null {
  return evaluateWith(ast, (name) =>
    Object.hasOwn(values, name) ? values[name] : undefined,
  );
}

// ---------------------------------------------------------------------------
// Indicator sets (indicators referencing other indicators)
// ---------------------------------------------------------------------------

export interface IndicatorExpression {
  readonly key: string;
  readonly expression: string;
}

export interface CompiledIndicator {
  readonly key: string;
  readonly ast: FormulaAst;
}

/**
 * Parses a set of indicators that may reference base variables and each other
 * by key, and returns them in evaluation (dependency) order. Use it to
 * validate a whole set before saving it.
 * @throws FormulaError on an invalid key, a duplicate, a key shadowing a base
 *   variable, a parse error in one expression or a circular dependency.
 */
export function compileIndicatorSet(
  defs: readonly IndicatorExpression[],
  allowedBase: readonly string[],
): CompiledIndicator[] {
  const base = new Set(allowedBase);
  const keys = new Set<string>();
  for (const { key } of defs) {
    if (!VARIABLE_NAME.test(key)) {
      throw new FormulaError(
        `Clé d'indicateur invalide « ${key} » : minuscules, chiffres et _ uniquement.`,
        0,
        key,
      );
    }
    if (base.has(key)) {
      throw new FormulaError(
        `La clé d'indicateur « ${key} » est déjà le nom d'une variable de base.`,
        0,
        key,
      );
    }
    if (keys.has(key)) {
      throw new FormulaError(
        `L'indicateur « ${key} » est défini deux fois.`,
        0,
        key,
      );
    }
    keys.add(key);
  }

  const allowed = [...allowedBase, ...keys];
  const parsed = new Map<string, FormulaAst>();
  for (const { key, expression } of defs) {
    try {
      parsed.set(key, parseFormula(expression, allowed));
    } catch (e) {
      if (e instanceof FormulaError) {
        throw new FormulaError(
          `Indicateur « ${key} » : ${e.message}`,
          e.position,
          key,
        );
      }
      throw e;
    }
  }

  // Depth-first topological sort, in definition order for determinism.
  const ordered: CompiledIndicator[] = [];
  const done = new Set<string>();
  const path: string[] = [];
  const visit = (key: string): void => {
    if (done.has(key)) return;
    const ast = parsed.get(key)!;
    path.push(key);
    for (const ref of indicatorReferences(ast, keys)) {
      const cycleStart = path.indexOf(ref.name);
      if (cycleStart !== -1) {
        const cycle = [...path.slice(cycleStart), ref.name].join(' → ');
        throw new FormulaError(
          `Indicateur « ${key} » : dépendance circulaire (${cycle}).`,
          ref.pos,
          key,
        );
      }
      visit(ref.name);
    }
    path.pop();
    done.add(key);
    ordered.push({ key, ast });
  };
  for (const { key } of defs) visit(key);
  return ordered;
}

/** First occurrence of every indicator key referenced by `ast`. */
function indicatorReferences(
  ast: FormulaAst,
  keys: ReadonlySet<string>,
): { name: string; pos: number }[] {
  const refs = new Map<string, number>();
  const visit = (node: FormulaAst | FormulaComparison): void => {
    switch (node.kind) {
      case 'number':
        return;
      case 'variable':
        if (keys.has(node.name) && !refs.has(node.name)) {
          refs.set(node.name, node.pos);
        }
        return;
      case 'negate':
        return visit(node.operand);
      case 'binary':
      case 'compare':
        visit(node.left);
        return visit(node.right);
      case 'call':
        return node.args.forEach(visit);
      case 'if':
        visit(node.condition);
        visit(node.whenTrue);
        return visit(node.whenFalse);
    }
  };
  visit(ast);
  return [...refs].map(([name, pos]) => ({ name, pos }));
}

/**
 * Evaluates every indicator of `defs` against the `base` values (only the
 * names listed in `allowedBase` are read), each indicator seeing the results
 * of those it references. Returns one entry per indicator key.
 * @throws FormulaError when the set itself is invalid (see `compileIndicatorSet`).
 */
export function evaluateIndicatorSet(
  defs: readonly IndicatorExpression[],
  base: Readonly<Record<string, number | null | undefined>>,
  allowedBase: readonly string[],
): Record<string, number | null> {
  const values = new Map<string, number | null>();
  for (const name of allowedBase) {
    const v = Object.hasOwn(base, name) ? base[name] : undefined;
    values.set(name, typeof v === 'number' && Number.isFinite(v) ? v : null);
  }
  for (const { key, ast } of compileIndicatorSet(defs, allowedBase)) {
    values.set(
      key,
      evaluateWith(ast, (name) => values.get(name)),
    );
  }
  // Definition order; fromEntries defines own data properties, so even a
  // "__proto__" key stays a plain key.
  return Object.fromEntries(
    defs.map(({ key }) => [key, values.get(key) ?? null]),
  );
}
