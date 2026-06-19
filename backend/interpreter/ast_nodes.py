# -*- coding: utf-8 -*-
"""AST node classes for GLOSSA."""
from __future__ import annotations
from typing import Any, List, Optional


class Node:
    def __init__(self, line=0, col=0):
        self.line = line
        self.col  = col

class Program(Node):
    def __init__(self, name, constants, variables, arrays, functions, procedures, body, line=0, col=0):
        super().__init__(line, col)
        self.name=name; self.constants=constants; self.variables=variables
        self.arrays=arrays; self.functions=functions; self.procedures=procedures; self.body=body

class ConstDecl(Node):
    def __init__(self, name, value, line=0, col=0):
        super().__init__(line, col); self.name=name; self.value=value

class VarDecl(Node):
    def __init__(self, names, var_type, line=0, col=0):
        super().__init__(line, col); self.names=names; self.var_type=var_type

class ArrayDecl(Node):
    def __init__(self, name, dims, var_type, line=0, col=0):
        super().__init__(line, col); self.name=name; self.dims=dims; self.var_type=var_type

class IntLiteral(Node):
    def __init__(self, value, line=0, col=0):
        super().__init__(line, col); self.value=value

class RealLiteral(Node):
    def __init__(self, value, line=0, col=0):
        super().__init__(line, col); self.value=value

class StringLiteral(Node):
    def __init__(self, value, line=0, col=0):
        super().__init__(line, col); self.value=value

class BoolLiteral(Node):
    def __init__(self, value, line=0, col=0):
        super().__init__(line, col); self.value=value

class VarRef(Node):
    def __init__(self, name, line=0, col=0):
        super().__init__(line, col); self.name=name

class ArrayRef(Node):
    def __init__(self, name, indices, line=0, col=0):
        super().__init__(line, col); self.name=name; self.indices=indices

class BinOp(Node):
    def __init__(self, op, left, right, line=0, col=0):
        super().__init__(line, col); self.op=op; self.left=left; self.right=right

class UnaryOp(Node):
    def __init__(self, op, operand, line=0, col=0):
        super().__init__(line, col); self.op=op; self.operand=operand

class FuncCall(Node):
    def __init__(self, name, args, line=0, col=0):
        super().__init__(line, col); self.name=name; self.args=args

class AssignStmt(Node):
    def __init__(self, target, value, line=0, col=0):
        super().__init__(line, col); self.target=target; self.value=value

class ReadStmt(Node):
    def __init__(self, targets, line=0, col=0):
        super().__init__(line, col); self.targets=targets

class WriteStmt(Node):
    def __init__(self, values, line=0, col=0):
        super().__init__(line, col); self.values=values

class CallStmt(Node):
    def __init__(self, name, args, line=0, col=0):
        super().__init__(line, col); self.name=name; self.args=args

class ReturnStmt(Node):
    def __init__(self, value, line=0, col=0):
        super().__init__(line, col); self.value=value

class IfStmt(Node):
    def __init__(self, condition, then_body, else_body, line=0, col=0):
        super().__init__(line, col); self.condition=condition; self.then_body=then_body; self.else_body=else_body

class ForStmt(Node):
    def __init__(self, var, start, end, step, body, line=0, col=0):
        super().__init__(line, col); self.var=var; self.start=start; self.end=end; self.step=step; self.body=body

class WhileStmt(Node):
    def __init__(self, condition, body, line=0, col=0):
        super().__init__(line, col); self.condition=condition; self.body=body

class RepeatStmt(Node):
    def __init__(self, body, condition, line=0, col=0):
        super().__init__(line, col); self.body=body; self.condition=condition

class Param(Node):
    def __init__(self, name, var_type, by_ref=False, line=0, col=0):
        super().__init__(line, col); self.name=name; self.var_type=var_type; self.by_ref=by_ref

class FunctionDef(Node):
    def __init__(self, name, params, ret_type, constants, variables, arrays, body, line=0, col=0):
        super().__init__(line, col)
        self.name=name; self.params=params; self.ret_type=ret_type
        self.constants=constants; self.variables=variables; self.arrays=arrays; self.body=body

class ProcedureDef(Node):
    def __init__(self, name, params, constants, variables, arrays, body, line=0, col=0):
        super().__init__(line, col)
        self.name=name; self.params=params
        self.constants=constants; self.variables=variables; self.arrays=arrays; self.body=body


class SelectStmt(Node):
    def __init__(self, expr, cases, else_body, line=0, col=0):
        super().__init__(line, col); self.expr=expr; self.cases=cases; self.else_body=else_body

class CaseClause(Node):
    def __init__(self, values, ranges, body, line=0, col=0):
        super().__init__(line, col)
        self.values=values
        self.ranges=ranges
        self.body=body

class WriteNlStmt(Node):
    def __init__(self, values, line=0, col=0):
        super().__init__(line, col); self.values=values
