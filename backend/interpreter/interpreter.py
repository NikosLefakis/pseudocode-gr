# -*- coding: utf-8 -*-
"""
Tree-walk interpreter for ΓΛΩΣΣΑ.

Execution model:
  • Every node visitor returns a Python value (int | float | str | bool | None).
  • Variable environments are plain dicts; scoping follows ΑΕΠΠ semantics
    (programs have a global env; functions/procedures have their own env).
  • ΔΙΑΒΑΣΕ consumes from a pre-supplied input queue.
  • ΓΡΑΨΕ appends to an output list.
  • Execution is aborted after MAX_STEPS to prevent infinite loops.
"""

from __future__ import annotations
import math
import random
from typing import Any, Dict, List, Optional, Tuple

from .ast_nodes import *
from .lexer import LexerError
from .parser import ParseError


# ─── Exceptions used for control flow ────────────────────────────────────────
class ReturnSignal(Exception):
    def __init__(self, value):
        self.value = value

class RuntimeError_(Exception):
    """Greek-message runtime error."""
    def __init__(self, message: str, line: int = 0, col: int = 0):
        super().__init__(message)
        self.greek_message = message
        self.line = line
        self.col  = col

class InputExhausted(Exception):
    pass

class StepLimitExceeded(Exception):
    pass


MAX_STEPS     = 200_000   # guard against infinite loops
MAX_OUTPUT    = 5_000     # characters; truncate beyond this


# ─── Built-in functions ───────────────────────────────────────────────────────
def _coerce_num(args, n_expected, fname, idx=0):
    if len(args) < n_expected:
        raise RuntimeError_(f"Η συνάρτηση {fname} χρειάζεται {n_expected} ορίσματα")
    v = args[idx]
    if not isinstance(v, (int, float)):
        raise RuntimeError_(f"Η συνάρτηση {fname} δέχεται αριθμητική παράμετρο, όχι '{v}'")
    return v

def _safe_sqrt(args):
    x = _coerce_num(args, 1, "ΑΡΣ")
    if x < 0:
        raise RuntimeError_(f"Τετραγωνική ρίζα αρνητικού αριθμού: ΑΡΣ({x})")
    return math.sqrt(x)

def _safe_log(args):
    x = _coerce_num(args, 1, "ΛΟΓ")
    if x <= 0:
        raise RuntimeError_(f"Λογάριθμος μη θετικού αριθμού: ΛΟΓ({x})")
    return math.log(x)

def _safe_tan(args):
    x = _coerce_num(args, 1, "ΕΦ")
    if abs(math.cos(x)) < 1e-12:
        raise RuntimeError_(f"Ο εφαπτόμενος δεν ορίζεται για αυτή την τιμή: ΕΦ({x})")
    return math.tan(x)

BUILTINS: Dict[str, callable] = {
    # Α_Τ(x) → integer absolute value
    "Α_Τ":       lambda args: int(abs(_coerce_num(args, 1, "Α_Τ"))),
    # Τ_Α(x) → convert to real
    "Τ_Α":       lambda args: float(_coerce_num(args, 1, "Τ_Α")),
    # ΑΠΟ_Τ(x, n) → round x to n decimals
    "ΑΠΟ_Τ":     lambda args: round(float(_coerce_num(args, 2, "ΑΠΟ_Τ", idx=0)),
                                    int(_coerce_num(args, 2, "ΑΠΟ_Τ", idx=1))),
    # ΤΥΧΑΙΟΣ(n) → random int in [0, n-1]
    "ΤΥΧΑΙΟΣ":   lambda args: random.randint(0, int(_coerce_num(args, 1, "ΤΥΧΑΙΟΣ")) - 1),
    # Trig (with domain checks)
    "ΗΜ":        lambda args: math.sin(_coerce_num(args, 1, "ΗΜ")),
    "ΣΥΝ":       lambda args: math.cos(_coerce_num(args, 1, "ΣΥΝ")),
    "ΕΦ":        _safe_tan,
    # Square root (with domain check) — both names used in textbooks
    "ΑΡΣ":       _safe_sqrt,
    "Τ_Ρ":       _safe_sqrt,
    # Natural logarithm (with domain check)
    "ΛΟΓ":       _safe_log,
    "Ε":         lambda args: math.exp(_coerce_num(args, 1, "Ε")),
    # Integer part (truncate toward zero, like ΑΕΠΠ Α_Μ)
    "Α_Μ":       lambda args: int(_coerce_num(args, 1, "Α_Μ")),
    # String utilities
    "ΜΗΚΟΣ":     lambda args: len(str(args[0])) if args else 0,
    "ΚΕΦΑΛΑΙΑ":  lambda args: str(args[0]).upper() if args else "",
    "ΠΕΖΑ":      lambda args: str(args[0]).lower() if args else "",
    # Type conversions
    "ΑΚΕΡΑΙΟΣ":  lambda args: int(args[0]) if args else 0,
    "ΠΡΑΓΜΑΤΙΚΟΣ": lambda args: float(args[0]) if args else 0.0,
    "ΧΑΡΑΚΤΗΡΑΣ": lambda args: str(args[0]) if args else "",
}


# ─── Environment ──────────────────────────────────────────────────────────────
class Environment:
    def __init__(self, parent: Optional['Environment'] = None):
        self._store: Dict[str, Any] = {}
        self._parent = parent

    def get(self, name: str, line: int = 0) -> Any:
        upper = name.upper()
        if upper in self._store:
            return self._store[upper]
        if self._parent:
            return self._parent.get(name, line)
        raise RuntimeError_(f"Μη δηλωμένη μεταβλητή: '{name}'", line)

    def set(self, name: str, value: Any):
        self._store[name.upper()] = value

    def set_local(self, name: str, value: Any):
        self._store[name.upper()] = value

    def update(self, name: str, value: Any, line: int = 0):
        """Assign to nearest scope that owns name."""
        upper = name.upper()
        if upper in self._store:
            self._store[upper] = value
            return
        if self._parent:
            self._parent.update(name, value, line)
            return
        # Auto-declare in global scope if not found (relaxed rule)
        self._store[upper] = value


# ─── Interpreter ─────────────────────────────────────────────────────────────
class Interpreter:
    def __init__(self, inputs: List[str] = None, input_fn=None, output_fn=None):
        self._inputs   = list(inputs or [])  # fallback pre-supplied list
        self._in_idx   = 0
        self._input_fn = input_fn            # callable(line_num) -> str, blocking
        self._output_fn= output_fn           # callable(text) -> None, streaming
        self._output   : List[str] = []
        self._steps    = 0
        self._functions: Dict[str, FunctionDef]  = {}
        self._procedures: Dict[str, ProcedureDef] = {}

    # ── Public interface ──────────────────────────────────────────────────
    def execute(self, program: Program) -> str:
        """Run a parsed Program and return all output as a single string."""
        # Register subprograms
        for f in program.functions:
            self._functions[f.name.upper()] = f
        for p in program.procedures:
            self._procedures[p.name.upper()] = p

        env = Environment()

        # Constants
        for c in program.constants:
            env.set(c.name, c.value)

        # Declare variables (initialise to sensible defaults)
        for vd in program.variables:
            for name in vd.names:
                env.set(name, self._default(vd.var_type))

        # Declare arrays
        for ad in program.arrays:
            env.set(ad.name, self._make_array(ad.dims, ad.var_type))

        # Execute body
        self._run_block(program.body, env)

        return ''.join(self._output)

    # ── Block execution ───────────────────────────────────────────────────
    def _run_block(self, stmts: List[Node], env: Environment):
        for stmt in stmts:
            self._run_stmt(stmt, env)

    def _run_stmt(self, node: Node, env: Environment):
        self._tick()

        if isinstance(node, AssignStmt):
            val = self._eval(node.value, env)
            self._assign(node.target, val, env)

        elif isinstance(node, ReadStmt):
            for target in node.targets:
                raw = self._next_input(node.line)
                val = self._parse_input(raw, node.line)
                self._assign(target, val, env)

        elif isinstance(node, WriteStmt):
            parts = []
            for expr in node.values:
                v = self._eval(expr, env)
                parts.append(self._to_str(v))
            line_out = ' '.join(parts) + '\n'
            self._emit(line_out)

        elif isinstance(node, WriteNlStmt):
            parts = []
            for expr in node.values:
                v = self._eval(expr, env)
                parts.append(self._to_str(v))
            line_out = ' '.join(parts)   # no trailing newline
            self._emit(line_out)

        elif isinstance(node, SelectStmt):
            val = self._eval(node.expr, env)
            matched = False
            for clause in node.cases:
                if not matched:
                    # Check plain values
                    for cv in clause.values:
                        if val == cv:
                            matched = True; break
                    # Check ranges
                    if not matched:
                        for (lo, hi) in clause.ranges:
                            if lo <= val <= hi:
                                matched = True; break
                if matched:
                    self._run_block(clause.body, env)
                    break
            if not matched and node.else_body:
                self._run_block(node.else_body, env)

        elif isinstance(node, IfStmt):
            cond = self._eval(node.condition, env)
            if self._to_bool(cond, node.line):
                self._run_block(node.then_body, env)
            else:
                self._run_block(node.else_body, env)

        elif isinstance(node, ForStmt):
            start = self._eval(node.start, env)
            end   = self._eval(node.end,   env)
            step  = self._eval(node.step,  env) if node.step else 1
            if not isinstance(step, (int, float)):
                raise RuntimeError_(f"Το βήμα του βρόχου ΓΙΑ πρέπει να είναι αριθμός", node.line)
            if step == 0:
                raise RuntimeError_("Το βήμα του βρόχου ΓΙΑ δεν μπορεί να είναι 0", node.line)
            val = start
            env.set(node.var, val)
            while (step > 0 and val <= end) or (step < 0 and val >= end):
                self._tick()
                env.set(node.var, val)
                self._run_block(node.body, env)
                val = env.get(node.var) + step
            env.set(node.var, val - step)   # leave at last iterated value

        elif isinstance(node, WhileStmt):
            while self._to_bool(self._eval(node.condition, env), node.line):
                self._tick()
                self._run_block(node.body, env)

        elif isinstance(node, RepeatStmt):
            while True:
                self._tick()
                self._run_block(node.body, env)
                if self._to_bool(self._eval(node.condition, env), node.line):
                    break

        elif isinstance(node, CallStmt):
            self._call_procedure(node.name, node.args, env, node.line)

        elif isinstance(node, ReturnStmt):
            val = self._eval(node.value, env) if node.value else None
            raise ReturnSignal(val)

        else:
            pass   # unknown node — skip silently

    # ── Expression evaluation ─────────────────────────────────────────────
    def _eval(self, node: Node, env: Environment) -> Any:
        self._tick()

        if isinstance(node, IntLiteral):    return node.value
        if isinstance(node, RealLiteral):   return node.value
        if isinstance(node, StringLiteral): return node.value
        if isinstance(node, BoolLiteral):   return node.value

        if isinstance(node, VarRef):
            return env.get(node.name, node.line)

        if isinstance(node, ArrayRef):
            arr  = env.get(node.name, node.line)
            idxs = [int(self._eval(i, env)) for i in node.indices]
            return self._array_get(arr, idxs, node.name, node.line)

        if isinstance(node, UnaryOp):
            v = self._eval(node.operand, env)
            if node.op == '-':
                if not isinstance(v, (int, float)):
                    raise RuntimeError_(f"Δεν μπορεί να εφαρμοστεί '-' σε '{v}'", node.line)
                return -v
            if node.op == 'ΟΧΙ':
                return not self._to_bool(v, node.line)

        if isinstance(node, BinOp):
            return self._eval_binop(node, env)

        if isinstance(node, FuncCall):
            return self._call_function(node.name, node.args, env, node.line)

        raise RuntimeError_(f"Άγνωστος κόμβος AST: {type(node).__name__}", getattr(node, 'line', 0))

    def _eval_binop(self, node: BinOp, env: Environment) -> Any:
        op = node.op

        # Short-circuit logical
        if op == 'ΚΑΙ':
            l = self._to_bool(self._eval(node.left, env), node.line)
            if not l:
                return False
            return self._to_bool(self._eval(node.right, env), node.line)
        if op == 'Η':
            l = self._to_bool(self._eval(node.left, env), node.line)
            if l:
                return True
            return self._to_bool(self._eval(node.right, env), node.line)

        left  = self._eval(node.left,  env)
        right = self._eval(node.right, env)

        # String concatenation
        if op == '&':
            return self._to_str(left) + self._to_str(right)

        # Arithmetic
        if op == '+':
            if isinstance(left, str) or isinstance(right, str):
                return self._to_str(left) + self._to_str(right)
            return self._num(left, node.line) + self._num(right, node.line)
        if op == '-':
            return self._num(left, node.line) - self._num(right, node.line)
        if op == '*':
            return self._num(left, node.line) * self._num(right, node.line)
        if op == '/':
            r = self._num(right, node.line)
            if r == 0:
                raise RuntimeError_("Διαίρεση με μηδέν", node.line)
            result = self._num(left, node.line) / r
            return result
        if op == 'DIV':
            r = self._num(right, node.line)
            if r == 0:
                raise RuntimeError_("Διαίρεση με μηδέν (DIV)", node.line)
            return int(self._num(left, node.line)) // int(r)
        if op == 'MOD':
            r = self._num(right, node.line)
            if r == 0:
                raise RuntimeError_("Διαίρεση με μηδέν (MOD)", node.line)
            return int(self._num(left, node.line)) % int(r)
        if op == '^':
            return self._num(left, node.line) ** self._num(right, node.line)

        # Comparison
        if op == '=':
            return left == right
        if op == '<>':
            return left != right
        if op in ('<', '>', '<=', '>='):
            try:
                if op == '<':  return left < right
                if op == '>':  return left > right
                if op == '<=': return left <= right
                if op == '>=': return left >= right
            except TypeError:
                raise RuntimeError_(f"Δεν μπορεί να συγκριθεί '{left}' με '{right}'", node.line)

        raise RuntimeError_(f"Άγνωστος τελεστής: '{op}'", node.line)

    # ── Subprogram calls ──────────────────────────────────────────────────
    def _call_function(self, name: str, arg_nodes: List[Node], env: Environment, line: int) -> Any:
        upper = name.upper()

        # Built-in check
        if upper in BUILTINS:
            args = [self._eval(a, env) for a in arg_nodes]
            try:
                return BUILTINS[upper](args)
            except RuntimeError_ as e:
                raise
            except Exception as e:
                raise RuntimeError_(f"Σφάλμα στη συνάρτηση {name}: {e}", line)

        # User-defined function
        if upper not in self._functions:
            raise RuntimeError_(f"Άγνωστη συνάρτηση: '{name}'", line)
        func = self._functions[upper]
        child_env = Environment(parent=env)

        # Bind parameters
        args = [self._eval(a, env) for a in arg_nodes]
        for param, val in zip(func.params, args):
            child_env.set_local(param.name, val)

        # Initialise locals
        for c in func.constants:
            child_env.set_local(c.name, c.value)
        for vd in func.variables:
            for n in vd.names:
                child_env.set_local(n, self._default(vd.var_type))
        for ad in func.arrays:
            child_env.set_local(ad.name, self._make_array(ad.dims, ad.var_type))

        # Initialise return-value slot to function name
        child_env.set_local(func.name, self._default(func.ret_type))

        try:
            self._run_block(func.body, child_env)
        except ReturnSignal as rs:
            return rs.value

        # Return value stored in function-name variable
        return child_env.get(func.name, line)

    def _call_procedure(self, name: str, arg_nodes: List[Node], env: Environment, line: int):
        upper = name.upper()

        # Check built-ins that behave like procedures (none standard, but allows extension)
        if upper not in self._procedures:
            raise RuntimeError_(f"Άγνωστη διαδικασία: '{name}'", line)
        proc = self._procedures[upper]
        child_env = Environment(parent=env)

        args = [self._eval(a, env) for a in arg_nodes]
        for param, val in zip(proc.params, args):
            child_env.set_local(param.name, val)

        for c in proc.constants:
            child_env.set_local(c.name, c.value)
        for vd in proc.variables:
            for n in vd.names:
                child_env.set_local(n, self._default(vd.var_type))
        for ad in proc.arrays:
            child_env.set_local(ad.name, self._make_array(ad.dims, ad.var_type))

        try:
            self._run_block(proc.body, child_env)
        except ReturnSignal:
            pass

        # Write-back by-ref params (simplified: all params written back if names match)
        for param, arg_node in zip(proc.params, arg_nodes):
            if param.by_ref and isinstance(arg_node, VarRef):
                env.update(arg_node.name, child_env.get(param.name))

    # ── Assignment ────────────────────────────────────────────────────────
    def _assign(self, target: Node, value: Any, env: Environment):
        if isinstance(target, VarRef):
            env.update(target.name, value, target.line)
        elif isinstance(target, ArrayRef):
            arr  = env.get(target.name, target.line)
            idxs = [int(self._eval(i, env)) for i in target.indices]
            self._array_set(arr, idxs, value, target.name, target.line)
        else:
            raise RuntimeError_(f"Μη έγκυρο αριστερό μέλος ανάθεσης", getattr(target, 'line', 0))

    # ── Arrays ────────────────────────────────────────────────────────────
    def _make_array(self, dims: List[int], var_type: str) -> Any:
        default = self._default(var_type)
        if len(dims) == 1:
            return [default] * dims[0]
        return [[default] * dims[1] for _ in range(dims[0])]

    def _array_get(self, arr, idxs: List[int], name: str, line: int) -> Any:
        if len(idxs) == 1:
            i = idxs[0] - 1   # 1-based indexing
            if not isinstance(arr, list) or not (0 <= i < len(arr)):
                raise RuntimeError_(
                    f"Εκτός ορίων πίνακα '{name}': δείκτης {idxs[0]}", line)
            return arr[i]
        elif len(idxs) == 2:
            i, j = idxs[0] - 1, idxs[1] - 1
            if not (0 <= i < len(arr)) or not (0 <= j < len(arr[i])):
                raise RuntimeError_(
                    f"Εκτός ορίων πίνακα '{name}': δείκτες {idxs[0]},{idxs[1]}", line)
            return arr[i][j]
        raise RuntimeError_(f"Μη υποστηριζόμενες διαστάσεις πίνακα", line)

    def _array_set(self, arr, idxs: List[int], value: Any, name: str, line: int):
        if len(idxs) == 1:
            i = idxs[0] - 1
            if not isinstance(arr, list) or not (0 <= i < len(arr)):
                raise RuntimeError_(
                    f"Εκτός ορίων πίνακα '{name}': δείκτης {idxs[0]}", line)
            arr[i] = value
        elif len(idxs) == 2:
            i, j = idxs[0] - 1, idxs[1] - 1
            if not (0 <= i < len(arr)) or not (0 <= j < len(arr[i])):
                raise RuntimeError_(
                    f"Εκτός ορίων πίνακα '{name}': δείκτες {idxs[0]},{idxs[1]}", line)
            arr[i][j] = value

    # ── I/O ──────────────────────────────────────────────────────────────
    def _next_input(self, line: int) -> str:
        if self._input_fn:
            return self._input_fn(line)
        if self._in_idx >= len(self._inputs):
            raise InputExhausted(
                f"Το πρόγραμμα ζήτησε εισαγωγή αλλά δεν υπάρχουν άλλες τιμές (γραμμή {line}). "
                "Παρακαλώ δώσε περισσότερες τιμές εισαγωγής.")
        val = self._inputs[self._in_idx].strip()
        self._in_idx += 1
        return val

    def _parse_input(self, raw: str, line: int) -> Any:
        # Try int first, then float, then string
        try:
            return int(raw)
        except ValueError:
            pass
        try:
            return float(raw.replace(',', '.'))
        except ValueError:
            pass
        if raw.upper() == 'ΑΛΗΘΗΣ':
            return True
        if raw.upper() == 'ΨΕΥΔΗΣ':
            return False
        return raw   # treat as string

    # ── Output helper ─────────────────────────────────────────────────────
    def _emit(self, text: str):
        if self._output_fn:
            self._output_fn(text)
        else:
            self._output.append(text)
            if sum(len(s) for s in self._output) > MAX_OUTPUT:
                self._output.append('\n[Η έξοδος περικόπηκε]\n')
                raise StepLimitExceeded

    # ── Helpers ───────────────────────────────────────────────────────────
    def _tick(self):
        self._steps += 1
        if self._steps > MAX_STEPS:
            raise StepLimitExceeded(
                f"Υπέρβαση ορίου εκτέλεσης ({MAX_STEPS:,} βήματα). "
                "Μήπως υπάρχει άπειρος βρόχος;"
            )

    @staticmethod
    def _default(var_type: str) -> Any:
        return {'INT': 0, 'REAL': 0.0, 'CHAR': '', 'BOOL': False, 'ANY': 0}.get(var_type, 0)

    @staticmethod
    def _num(v: Any, line: int) -> float:
        if isinstance(v, (int, float)):
            return v
        if isinstance(v, str):
            try:
                return float(v)
            except ValueError:
                pass
        raise RuntimeError_(f"Αναμενόταν αριθμός, βρέθηκε '{v}'", line)

    @staticmethod
    def _to_bool(v: Any, line: int) -> bool:
        if isinstance(v, bool):
            return v
        if isinstance(v, int):
            return v != 0
        raise RuntimeError_(f"Αναμενόταν λογική τιμή, βρέθηκε '{v}'", line)

    @staticmethod
    def _to_str(v: Any) -> str:
        if isinstance(v, bool):
            return 'ΑΛΗΘΗΣ' if v else 'ΨΕΥΔΗΣ'
        if isinstance(v, float):
            if v == int(v) and abs(v) < 1e15:
                return str(int(v))
            return str(v)
        return str(v)
