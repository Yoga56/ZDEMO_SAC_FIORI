/**
 * Formulas for the planning table's formula bar (pure; no eval).
 *
 *   =120000*1.05          arithmetic with + - * / ^ and parentheses
 *   *1.1   +500   -10%    a leading operator works on the cell's current value:  current*1.1, current+500, current-10%
 *   =ACT*1.05             a version id stands for the same cell in that version
 *   =COST*0.6             a measure id stands for the same cell in that measure (in the table's version)
 *   =COST@ACT             a measure id and a version id: that measure in that version
 *   =current+ACT/12       `current` is the cell's own value
 *
 * A percentage after + or - is relative to the left side (a+10% is a*1.1, a-10% is a*0.9); after * it is a fraction (a*10% is a*0.1);
 * on its own it is a fraction (10% is 0.1).
 */
sap.ui.define([], function () {
  "use strict";

  const plain = (t) => Number.isFinite(Number(String(t).replace(/,/g, "")));

  /** True for text that must be calculated: starts with "=", or starts with an operator and is not just a signed number. */
  function isFormula(text) {
    const t = String(text).trim();
    if (!t) { return false; }
    if (t[0] === "=") { return true; }
    return /^[+\-*/]/.test(t) && !plain(t);
  }

  function tokenize(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      let m = /^(\d+(\.\d+)?|\.\d+)/.exec(src.slice(i));
      if (m) { out.push({ t: "num", v: Number(m[1]) }); i += m[1].length; continue; }
      m = /^[A-Za-z_][A-Za-z0-9_]*(?:@[A-Za-z_][A-Za-z0-9_]*)?/.exec(src.slice(i));
      if (m) { out.push({ t: "id", v: m[0] }); i += m[0].length; continue; }
      if ("+-*/^()%".indexOf(c) >= 0) { out.push({ t: c }); i++; continue; }
      throw new Error("Unexpected \"" + c + "\" in the formula");
    }
    return out;
  }

  function parse(tokens) {
    let p = 0;
    const peek = () => tokens[p];
    const take = (t) => { if (peek() && peek().t === t) { return tokens[p++]; } return null; };
    function primary() {
      const tk = peek();
      if (!tk) { throw new Error("The formula ends too early"); }
      if (take("num")) { return take("%") ? { k: "pct", v: tk.v } : { k: "num", v: tk.v }; }
      if (take("id")) { return { k: "id", v: tk.v }; }
      if (take("(")) { const e = expr(); if (!take(")")) { throw new Error("Missing )"); } return e; }
      throw new Error("Unexpected \"" + (tk.v !== undefined ? tk.v : tk.t) + "\" in the formula");
    }
    // power binds tighter than a minus sign in front: -2^2 is -4; the exponent may carry a sign: 2^-1
    function unary() {
      if (take("-")) { return { k: "neg", a: unary() }; }
      if (take("+")) { return unary(); }
      return power();
    }
    function power() {
      const a = primary();
      return take("^") ? { k: "bin", op: "^", a, b: unary() } : a;
    }
    function term() {
      let a = unary();
      for (;;) {
        const op = take("*") ? "*" : take("/") ? "/" : null;
        if (!op) { return a; }
        a = { k: "bin", op, a, b: unary() };
      }
    }
    function expr() {
      let a = term();
      for (;;) {
        const op = take("+") ? "+" : take("-") ? "-" : null;
        if (!op) { return a; }
        a = { k: "bin", op, a, b: term() };
      }
    }
    const ast = expr();
    if (p < tokens.length) { throw new Error("Unexpected \"" + (tokens[p].v !== undefined ? tokens[p].v : tokens[p].t) + "\" in the formula"); }
    return ast;
  }

  function evaluate(n, env) {
    switch (n.k) {
      case "num": return n.v;
      case "pct": return n.v / 100;
      case "neg": return -evaluate(n.a, env);
      case "id": {
        const key = n.v.toLowerCase();
        if (key === "current") { return env.current; }
        const hit = Object.keys(env.refs || {}).find((r) => r.toLowerCase() === key);
        if (hit === undefined) { throw new Error("Unknown name " + n.v); }
        return env.refs[hit];
      }
      default: {
        const a = evaluate(n.a, env);
        if (n.b.k === "pct" && (n.op === "+" || n.op === "-")) { return n.op === "+" ? a * (1 + n.b.v / 100) : a * (1 - n.b.v / 100); }
        const b = evaluate(n.b, env);
        switch (n.op) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": if (b === 0) { throw new Error("Division by zero"); } return a / b;
          default: return Math.pow(a, b);
        }
      }
    }
  }

  function names(n, out) {
    if (n.k === "id" && n.v.toLowerCase() !== "current") { out.add(n.v); }
    if (n.a) { names(n.a, out); }
    if (n.b) { names(n.b, out); }
    return out;
  }

  /**
   * @returns {{error?: string, names: string[], evaluate: function({current:number, refs:Object<string,number>}): number}}
   */
  function compile(text) {
    let src = String(text).trim();
    const explicit = src[0] === "=";
    if (explicit) { src = src.slice(1).trim(); }
    else if (/^[+\-*/]/.test(src)) { src = "current" + src; }
    if (!src) { return { error: "Enter a formula", names: [], evaluate: () => NaN }; }
    try {
      const ast = parse(tokenize(src));
      return { names: Array.from(names(ast, new Set())), evaluate: (env) => evaluate(ast, env) };
    } catch (e) {
      return { error: e.message, names: [], evaluate: () => NaN };
    }
  }

  return { isFormula, compile };
});
