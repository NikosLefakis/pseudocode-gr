# -*- coding: utf-8 -*-
"""
Recursive-descent parser for ΓΛΩΣΣΑ.
Converts a flat token list into an AST (see ast_nodes.py).
"""

from __future__ import annotations
from typing import List, Optional, Tuple

from .lexer import Token, TokenType
from .ast_nodes import *


class ParseError(Exception):
    def __init__(self, message: str, line: int, col: int):
        super().__init__(message)
        self.line = line
        self.col  = col
        self.greek_message = message


class Parser:
    def __init__(self, tokens: List[Token]):
        # Filter out NEWLINE tokens — we use them only to separate statements
        # but handle them explicitly in statement parsing.
        self._tokens  = tokens
        self._pos     = 0

    # ── Internal helpers ──────────────────────────────────────────────────────
    def _peek(self, offset: int = 0) -> Token:
        idx = self._pos + offset
        if idx < len(self._tokens):
            return self._tokens[idx]
        return self._tokens[-1]   # EOF

    def _advance(self) -> Token:
        tok = self._tokens[self._pos]
        if self._pos < len(self._tokens) - 1:
            self._pos += 1
        return tok

    def _check(self, *types: TokenType) -> bool:
        return self._peek().type in types

    def _match(self, *types: TokenType) -> Optional[Token]:
        if self._check(*types):
            return self._advance()
        return None

    def _expect(self, ttype: TokenType, hint: str = "") -> Token:
        tok = self._peek()
        if tok.type != ttype:
            expected = ttype.name
            got      = f"'{tok.value}'" if tok.value is not None else tok.type.name
            msg = f"Σφάλμα σύνταξης στη γραμμή {tok.line}: αναμενόταν {hint or expected}, βρέθηκε {got}"
            raise ParseError(msg, tok.line, tok.col)
        return self._advance()

    def _skip_newlines(self):
        while self._check(TokenType.NEWLINE):
            self._advance()

    def _error(self, msg: str) -> ParseError:
        tok = self._peek()
        return ParseError(msg, tok.line, tok.col)

    # ── Entry point ───────────────────────────────────────────────────────────
    def parse(self) -> Program:
        self._skip_newlines()
        tok = self._expect(TokenType.KW_PROGRAM, "ΠΡΟΓΡΑΜΜΑ")
        name_tok = self._expect(TokenType.IDENT, "όνομα προγράμματος")
        self._skip_newlines()

        constants, variables, arrays, functions, procedures = self._parse_decl_sections()

        self._expect(TokenType.KW_BEGIN, "ΑΡΧΗ")
        self._skip_newlines()
        body = self._parse_statement_list(TokenType.KW_END_PROGRAM)
        self._expect(TokenType.KW_END_PROGRAM, "ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ")
        # optional program name after ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ (skip any non-newline token)
        if not self._check(TokenType.NEWLINE, TokenType.EOF):
            self._advance()

        return Program(
            name=name_tok.value,
            constants=constants,
            variables=variables,
            arrays=arrays,
            functions=functions,
            procedures=procedures,
            body=body,
            line=tok.line, col=tok.col,
        )

    # ── Declaration sections ───────────────────────────────────────────────────
    def _parse_decl_sections(self):
        constants:  List[ConstDecl]   = []
        variables:  List[VarDecl]     = []
        arrays:     List[ArrayDecl]   = []
        functions:  List[FunctionDef] = []
        procedures: List[ProcedureDef]= []

        while True:
            self._skip_newlines()
            if self._check(TokenType.KW_CONSTANTS):
                self._advance()
                self._skip_newlines()
                constants.extend(self._parse_constants())
            elif self._check(TokenType.KW_VARIABLES):
                self._advance()
                self._skip_newlines()
                v, a = self._parse_variables()
                variables.extend(v); arrays.extend(a)
            elif self._check(TokenType.KW_ARRAYS):
                self._advance()
                self._skip_newlines()
                arrays.extend(self._parse_arrays())
            elif self._check(TokenType.KW_FUNCTION):
                functions.append(self._parse_function())
                self._skip_newlines()
            elif self._check(TokenType.KW_PROCEDURE):
                procedures.append(self._parse_procedure())
                self._skip_newlines()
            else:
                break

        return constants, variables, arrays, functions, procedures

    def _parse_constants(self) -> List[ConstDecl]:
        decls = []
        while self._check(TokenType.IDENT):
            tok  = self._advance()
            name = tok.value
            self._expect(TokenType.EQ, "=")
            val_tok = self._peek()
            if self._match(TokenType.INTEGER):
                val = val_tok.value
            elif self._match(TokenType.REAL):
                val = val_tok.value
            elif self._match(TokenType.STRING):
                val = val_tok.value
            elif self._match(TokenType.BOOL_TRUE):
                val = True
            elif self._match(TokenType.BOOL_FALSE):
                val = False
            else:
                # handle negative numbers
                if self._match(TokenType.MINUS):
                    n = self._peek()
                    if self._match(TokenType.INTEGER):
                        val = -n.value
                    elif self._match(TokenType.REAL):
                        val = -n.value
                    else:
                        raise self._error("Αναμενόταν αριθμητική σταθερά")
                else:
                    raise self._error("Αναμενόταν τιμή σταθεράς")
            decls.append(ConstDecl(name=name, value=val, line=tok.line, col=tok.col))
            self._skip_newlines()
        return decls

    def _parse_variables(self) -> Tuple[List[VarDecl], List[ArrayDecl]]:
        """Returns (var_decls, inline_array_decls).
        Handles inline arrays: ΑΚΕΡΑΙΕΣ: i, arr[100], j
        """
        var_decls: List[VarDecl] = []
        arr_decls: List[ArrayDecl] = []
        TYPE_MAP = {
            TokenType.KW_TYPE_INT:  'INT',
            TokenType.KW_TYPE_REAL: 'REAL',
            TokenType.KW_TYPE_CHAR: 'CHAR',
            TokenType.KW_TYPE_BOOL: 'BOOL',
        }
        while self._check(*TYPE_MAP.keys()):
            type_tok = self._advance()
            var_type = TYPE_MAP[type_tok.type]
            self._expect(TokenType.COLON, ":")
            # Parse comma-separated list of names, possibly with [dims] for inline arrays
            names = []   # plain variable names for this type line
            while True:
                name_tok = self._expect(TokenType.IDENT, "όνομα μεταβλητής")
                if self._check(TokenType.LBRACKET):
                    # Inline array declaration: name[d1, d2, ...]
                    self._advance()
                    dims = [self._expect(TokenType.INTEGER, "μέγεθος διάστασης").value]
                    while self._match(TokenType.COMMA):
                        # peek: if next is INTEGER it's another dim, else stop
                        if self._check(TokenType.INTEGER):
                            dims.append(self._advance().value)
                        else:
                            break
                    self._expect(TokenType.RBRACKET, "]")
                    arr_decls.append(ArrayDecl(name=name_tok.value, dims=dims,
                                               var_type=var_type,
                                               line=name_tok.line, col=name_tok.col))
                else:
                    names.append(name_tok.value)
                if not self._match(TokenType.COMMA):
                    break
            if names:
                var_decls.append(VarDecl(names=names, var_type=var_type,
                                         line=type_tok.line, col=type_tok.col))
            self._skip_newlines()
        return var_decls, arr_decls

    def _parse_arrays(self) -> List[ArrayDecl]:
        decls = []
        TYPE_MAP = {
            TokenType.KW_TYPE_INT:  'INT',
            TokenType.KW_TYPE_REAL: 'REAL',
            TokenType.KW_TYPE_CHAR: 'CHAR',
            TokenType.KW_TYPE_BOOL: 'BOOL',
        }
        while self._check(TokenType.IDENT):
            tok  = self._advance()
            name = tok.value
            self._expect(TokenType.LBRACKET, "[")
            dims = [self._expect(TokenType.INTEGER, "μέγεθος διάστασης").value]
            while self._match(TokenType.COMMA):
                dims.append(self._expect(TokenType.INTEGER, "μέγεθος διάστασης").value)
            self._expect(TokenType.RBRACKET, "]")
            self._expect(TokenType.COLON, ":")
            if not self._check(*TYPE_MAP.keys()):
                raise self._error("Αναμενόταν τύπος πίνακα")
            type_tok = self._advance()
            var_type = TYPE_MAP[type_tok.type]
            decls.append(ArrayDecl(name=name, dims=dims, var_type=var_type, line=tok.line, col=tok.col))
            self._skip_newlines()
        return decls

    # ── Function / Procedure definitions ──────────────────────────────────────
    def _parse_params(self) -> List[Param]:
        params = []
        self._expect(TokenType.LPAREN, "(")
        if not self._check(TokenType.RPAREN):
            params.append(self._parse_single_param())
            while self._match(TokenType.SEMICOLON if False else TokenType.COMMA):
                if self._check(TokenType.RPAREN):
                    break
                params.append(self._parse_single_param())
        self._expect(TokenType.RPAREN, ")")
        return params

    def _parse_single_param(self) -> Param:
        # Optional VAR keyword for pass-by-reference (extended syntax)
        by_ref = False
        tok = self._peek()
        name = self._expect(TokenType.IDENT, "όνομα παραμέτρου").value
        return Param(name=name, var_type='ANY', by_ref=by_ref, line=tok.line, col=tok.col)

    def _parse_subprogram_body(self) -> Tuple:
        """Parse optional local ΣΤΑΘΕΡΕΣ, ΜΕΤΑΒΛΗΤΕΣ, ΠΙΝΑΚΕΣ then ΑΡΧΗ."""
        constants: List[ConstDecl] = []
        variables: List[VarDecl]   = []
        arrays:    List[ArrayDecl]  = []
        self._skip_newlines()
        while True:
            if self._check(TokenType.KW_CONSTANTS):
                self._advance(); self._skip_newlines()
                constants.extend(self._parse_constants())
            elif self._check(TokenType.KW_VARIABLES):
                self._advance(); self._skip_newlines()
                v, a = self._parse_variables()
                variables.extend(v); arrays.extend(a)
            elif self._check(TokenType.KW_ARRAYS):
                self._advance(); self._skip_newlines()
                arrays.extend(self._parse_arrays())
            else:
                break
        return constants, variables, arrays

    def _parse_function(self) -> FunctionDef:
        tok = self._expect(TokenType.KW_FUNCTION, "ΣΥΝΑΡΤΗΣΗ")
        name = self._expect(TokenType.IDENT, "όνομα συνάρτησης").value
        params = self._parse_params()
        self._expect(TokenType.COLON, ":")
        TYPE_MAP = {
            TokenType.KW_TYPE_INT:  'INT',
            TokenType.KW_TYPE_REAL: 'REAL',
            TokenType.KW_TYPE_CHAR: 'CHAR',
            TokenType.KW_TYPE_BOOL: 'BOOL',
        }
        if not self._check(*TYPE_MAP.keys()):
            raise self._error("Αναμενόταν τύπος επιστροφής συνάρτησης")
        ret_type = TYPE_MAP[self._advance().type]
        self._skip_newlines()
        constants, variables, arrays = self._parse_subprogram_body()
        self._expect(TokenType.KW_BEGIN, "ΑΡΧΗ")
        self._skip_newlines()
        body = self._parse_statement_list(TokenType.KW_END_FUNCTION)
        self._expect(TokenType.KW_END_FUNCTION, "ΤΕΛΟΣ_ΣΥΝΑΡΤΗΣΗΣ")
        self._skip_newlines()
        return FunctionDef(name=name, params=params, ret_type=ret_type,
                           constants=constants, variables=variables, arrays=arrays,
                           body=body, line=tok.line, col=tok.col)

    def _parse_procedure(self) -> ProcedureDef:
        tok = self._expect(TokenType.KW_PROCEDURE, "ΔΙΑΔΙΚΑΣΙΑ")
        name = self._expect(TokenType.IDENT, "όνομα διαδικασίας").value
        params = self._parse_params()
        self._skip_newlines()
        constants, variables, arrays = self._parse_subprogram_body()
        self._expect(TokenType.KW_BEGIN, "ΑΡΧΗ")
        self._skip_newlines()
        body = self._parse_statement_list(TokenType.KW_END_PROCEDURE)
        self._expect(TokenType.KW_END_PROCEDURE, "ΤΕΛΟΣ_ΔΙΑΔΙΚΑΣΙΑΣ")
        self._skip_newlines()
        return ProcedureDef(name=name, params=params,
                            constants=constants, variables=variables, arrays=arrays,
                            body=body, line=tok.line, col=tok.col)

    # ── Statement list ────────────────────────────────────────────────────────
    def _parse_statement_list(self, *terminators: TokenType) -> List[Node]:
        stmts = []
        while not self._check(*terminators) and not self._check(TokenType.EOF):
            self._skip_newlines()
            if self._check(*terminators) or self._check(TokenType.EOF):
                break
            stmt = self._parse_statement()
            if stmt is not None:
                stmts.append(stmt)
            self._skip_newlines()
        return stmts

    # ── Single statement ──────────────────────────────────────────────────────
    def _parse_statement(self) -> Optional[Node]:
        tok = self._peek()

        if self._check(TokenType.NEWLINE):
            self._advance()
            return None

        # ΔΙΑΒΑΣΕ
        if self._check(TokenType.KW_READ):
            return self._parse_read()

        # ΓΡΑΨΕ
        if self._check(TokenType.KW_WRITE):
            return self._parse_write()

        # ΓΡΑΨΕ_ (no newline)
        if self._check(TokenType.KW_WRITE_NOLINE):
            return self._parse_write_noline()

        # ΑΝ
        if self._check(TokenType.KW_IF):
            return self._parse_if()

        # ΕΠΙΛΕΞΕ
        if self._check(TokenType.KW_SELECT):
            return self._parse_select()

        # ΓΙΑ
        if self._check(TokenType.KW_FOR):
            return self._parse_for()

        # ΟΣΟ
        if self._check(TokenType.KW_WHILE):
            return self._parse_while()

        # ΑΡΧΗ_ΕΠΑΝΑΛΗΨΗΣ
        if self._check(TokenType.KW_REPEAT):
            return self._parse_repeat()

        # ΚΑΛΕΣΕ
        if self._check(TokenType.KW_CALL):
            return self._parse_call()

        # ΕΠΙΣΤΡΕΦΕ
        if self._check(TokenType.KW_RETURN):
            tok2 = self._advance()
            if self._check(TokenType.NEWLINE) or self._check(TokenType.EOF):
                return ReturnStmt(value=None, line=tok2.line, col=tok2.col)
            value = self._parse_expr()
            return ReturnStmt(value=value, line=tok2.line, col=tok2.col)

        # Assignment: IDENT ← expr  or  IDENT[indices] ← expr
        if self._check(TokenType.IDENT):
            return self._parse_assign_or_call()

        raise self._error(f"Μη αναγνώσιμη εντολή: '{tok.value}' (γραμμή {tok.line})")

    def _parse_read(self) -> ReadStmt:
        tok = self._advance()   # consume ΔΙΑΒΑΣΕ
        targets = [self._parse_lvalue()]
        while self._match(TokenType.COMMA):
            targets.append(self._parse_lvalue())
        return ReadStmt(targets=targets, line=tok.line, col=tok.col)

    def _parse_write(self) -> WriteStmt:
        tok = self._advance()   # consume ΓΡΑΨΕ
        values = [self._parse_expr()]
        while self._match(TokenType.COMMA):
            values.append(self._parse_expr())
        return WriteStmt(values=values, line=tok.line, col=tok.col)

    def _parse_write_noline(self) -> WriteNlStmt:
        tok = self._advance()   # consume ΓΡΑΨΕ_
        values = [self._parse_expr()]
        while self._match(TokenType.COMMA):
            values.append(self._parse_expr())
        return WriteNlStmt(values=values, line=tok.line, col=tok.col)

    def _parse_if(self) -> IfStmt:
        tok = self._advance()   # ΑΝ
        cond = self._parse_expr()
        self._expect(TokenType.KW_THEN, "ΤΟΤΕ")
        self._skip_newlines()
        then_body = self._parse_statement_list(
            TokenType.KW_ELSE, TokenType.KW_ELSEIF, TokenType.KW_END_IF)

        # Collect ΑΛΛΙΩΣ_ΑΝ branches
        elseif_branches = []
        while self._check(TokenType.KW_ELSEIF):
            elif_tok = self._advance()
            elif_cond = self._parse_expr()
            self._expect(TokenType.KW_THEN, "ΤΟΤΕ")
            self._skip_newlines()
            elif_body = self._parse_statement_list(
                TokenType.KW_ELSE, TokenType.KW_ELSEIF, TokenType.KW_END_IF)
            elseif_branches.append((elif_tok, elif_cond, elif_body))

        else_body: List[Node] = []
        if self._match(TokenType.KW_ELSE):
            self._skip_newlines()
            else_body = self._parse_statement_list(TokenType.KW_END_IF)
        self._expect(TokenType.KW_END_IF, "ΤΕΛΟΣ_ΑΝ")

        # Build nested IfStmt from innermost out
        result_else = else_body
        for elif_tok, elif_cond, elif_body in reversed(elseif_branches):
            result_else = [IfStmt(condition=elif_cond, then_body=elif_body,
                                  else_body=result_else,
                                  line=elif_tok.line, col=elif_tok.col)]

        return IfStmt(condition=cond, then_body=then_body, else_body=result_else,
                      line=tok.line, col=tok.col)

    def _parse_select(self) -> SelectStmt:
        tok = self._advance()   # ΕΠΙΛΕΞΕ
        expr = self._parse_expr()
        self._skip_newlines()
        cases: List[CaseClause] = []
        else_body: List[Node] = []
        while self._check(TokenType.KW_CASE):
            case_tok = self._advance()   # ΠΕΡΙΠΤΩΣΗ
            if self._check(TokenType.KW_ELSE):
                # ΠΕΡΙΠΤΩΣΗ ΑΛΛΙΩΣ
                self._advance()
                self._expect(TokenType.COLON, ":")
                self._skip_newlines()
                else_body = self._parse_statement_list(TokenType.KW_CASE, TokenType.KW_END_SELECT)
            else:
                values, ranges = self._parse_case_values()
                self._expect(TokenType.COLON, ":")
                self._skip_newlines()
                body = self._parse_statement_list(TokenType.KW_CASE, TokenType.KW_END_SELECT)
                cases.append(CaseClause(values=values, ranges=ranges, body=body,
                                        line=case_tok.line, col=case_tok.col))
        self._expect(TokenType.KW_END_SELECT, "ΤΕΛΟΣ_ΕΠΙΛΟΓΩΝ")
        return SelectStmt(expr=expr, cases=cases, else_body=else_body,
                          line=tok.line, col=tok.col)

    def _parse_case_values(self) -> Tuple[list, list]:
        """Parse comma-separated list of literal values and a..b ranges."""
        values = []
        ranges = []
        while True:
            # Parse a literal value (possibly negative)
            tok = self._peek()
            neg = False
            if tok.type == TokenType.MINUS:
                self._advance(); neg = True; tok = self._peek()
            if tok.type == TokenType.INTEGER:
                v = self._advance().value
                if neg: v = -v
            elif tok.type == TokenType.REAL:
                v = self._advance().value
                if neg: v = -v
            elif tok.type == TokenType.STRING and not neg:
                v = self._advance().value
            elif tok.type == TokenType.BOOL_TRUE and not neg:
                self._advance(); v = True
            elif tok.type == TokenType.BOOL_FALSE and not neg:
                self._advance(); v = False
            else:
                if neg:
                    raise self._error("Αναμενόταν αριθμός μετά το '-'")
                break
            # Check if this is a range: v..v2
            if self._check(TokenType.DOTDOT):
                self._advance()
                neg2 = False
                if self._check(TokenType.MINUS):
                    self._advance(); neg2 = True
                tok2 = self._peek()
                if tok2.type == TokenType.INTEGER:
                    v2 = self._advance().value
                    if neg2: v2 = -v2
                elif tok2.type == TokenType.REAL:
                    v2 = self._advance().value
                    if neg2: v2 = -v2
                else:
                    raise self._error("Αναμενόταν αριθμός μετά το '..'")
                ranges.append((v, v2))
            else:
                values.append(v)
            if not self._match(TokenType.COMMA):
                break
        return values, ranges

    def _parse_for(self) -> ForStmt:
        tok = self._advance()   # ΓΙΑ
        var_tok = self._expect(TokenType.IDENT, "μεταβλητή βρόχου")
        self._expect(TokenType.KW_FROM, "ΑΠΟ")
        start = self._parse_expr()
        self._expect(TokenType.KW_TO, "ΜΕΧΡΙ")
        end   = self._parse_expr()
        step  = None
        if self._match(TokenType.KW_STEP):
            # ΜΕ_ΒΗΜΑ (single token)
            step = self._parse_expr()
        elif self._check(TokenType.KW_ME):
            # ΜΕ ΒΗΜΑ (two separate tokens)
            self._advance()   # consume ΜΕ
            # next should be ΒΗΜΑ keyword or identifier with value ΒΗΜΑ
            if self._check(TokenType.KW_STEP_WORD):
                self._advance()
            elif self._check(TokenType.IDENT) and self._peek().value.upper() == 'ΒΗΜΑ':
                self._advance()
            else:
                raise self._error("Αναμενόταν 'ΒΗΜΑ' μετά το 'ΜΕ'")
            step = self._parse_expr()
        self._skip_newlines()
        body = self._parse_statement_list(TokenType.KW_END_LOOP)
        self._expect(TokenType.KW_END_LOOP, "ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ")
        return ForStmt(var=var_tok.value, start=start, end=end, step=step, body=body,
                       line=tok.line, col=tok.col)

    def _parse_while(self) -> WhileStmt:
        tok = self._advance()   # ΟΣΟ
        cond = self._parse_expr()
        self._expect(TokenType.KW_DO, "ΕΠΑΝΑΛΑΒΕ")
        self._skip_newlines()
        body = self._parse_statement_list(TokenType.KW_END_LOOP)
        self._expect(TokenType.KW_END_LOOP, "ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ")
        return WhileStmt(condition=cond, body=body, line=tok.line, col=tok.col)

    def _parse_repeat(self) -> RepeatStmt:
        tok = self._advance()   # ΑΡΧΗ_ΕΠΑΝΑΛΗΨΗΣ
        self._skip_newlines()
        body = self._parse_statement_list(TokenType.KW_UNTIL)
        self._expect(TokenType.KW_UNTIL, "ΜΕΧΡΙΣ_ΟΤΟΥ")
        cond = self._parse_expr()
        return RepeatStmt(body=body, condition=cond, line=tok.line, col=tok.col)

    def _parse_call(self) -> CallStmt:
        tok = self._advance()   # ΚΑΛΕΣΕ
        name_tok = self._expect(TokenType.IDENT, "όνομα διαδικασίας")
        args = self._parse_arg_list()
        return CallStmt(name=name_tok.value, args=args, line=tok.line, col=tok.col)

    def _parse_assign_or_call(self) -> Node:
        """IDENT may be start of assignment or a procedure call without ΚΑΛΕΣΕ."""
        tok  = self._advance()   # IDENT
        name = tok.value

        # Array element: name[...] ← expr
        if self._check(TokenType.LBRACKET):
            self._advance()
            indices = [self._parse_expr()]
            while self._match(TokenType.COMMA):
                indices.append(self._parse_expr())
            self._expect(TokenType.RBRACKET, "]")
            self._expect(TokenType.ASSIGN, "←")
            value = self._parse_expr()
            return AssignStmt(
                target=ArrayRef(name=name, indices=indices, line=tok.line, col=tok.col),
                value=value, line=tok.line, col=tok.col)

        # Variable assignment: name ← expr
        if self._check(TokenType.ASSIGN):
            self._advance()
            value = self._parse_expr()
            return AssignStmt(
                target=VarRef(name=name, line=tok.line, col=tok.col),
                value=value, line=tok.line, col=tok.col)

        # Implicit procedure call (without ΚΑΛΕΣΕ): name(args)
        if self._check(TokenType.LPAREN):
            args = self._parse_arg_list()
            return CallStmt(name=name, args=args, line=tok.line, col=tok.col)

        raise self._error(f"Αναμενόταν ← ή ( μετά το '{name}' (γραμμή {tok.line})")

    def _parse_lvalue(self) -> Node:
        tok = self._expect(TokenType.IDENT, "μεταβλητή")
        if self._check(TokenType.LBRACKET):
            self._advance()
            indices = [self._parse_expr()]
            while self._match(TokenType.COMMA):
                indices.append(self._parse_expr())
            self._expect(TokenType.RBRACKET, "]")
            return ArrayRef(name=tok.value, indices=indices, line=tok.line, col=tok.col)
        return VarRef(name=tok.value, line=tok.line, col=tok.col)

    def _parse_arg_list(self) -> List[Node]:
        args = []
        self._expect(TokenType.LPAREN, "(")
        if not self._check(TokenType.RPAREN):
            args.append(self._parse_expr())
            while self._match(TokenType.COMMA):
                if self._check(TokenType.RPAREN):
                    break
                args.append(self._parse_expr())
        self._expect(TokenType.RPAREN, ")")
        return args

    # ── Expression parsing (Pratt / recursive descent) ────────────────────────
    def _parse_expr(self) -> Node:
        return self._parse_or()

    def _parse_or(self) -> Node:
        left = self._parse_and()
        while self._check(TokenType.KW_OR):
            tok = self._advance()
            right = self._parse_and()
            left = BinOp(op='Η', left=left, right=right, line=tok.line, col=tok.col)
        return left

    def _parse_and(self) -> Node:
        left = self._parse_not()
        while self._check(TokenType.KW_AND):
            tok = self._advance()
            right = self._parse_not()
            left = BinOp(op='ΚΑΙ', left=left, right=right, line=tok.line, col=tok.col)
        return left

    def _parse_not(self) -> Node:
        if self._check(TokenType.KW_NOT):
            tok = self._advance()
            operand = self._parse_not()
            return UnaryOp(op='ΟΧΙ', operand=operand, line=tok.line, col=tok.col)
        return self._parse_comparison()

    _CMP_OPS = {
        TokenType.EQ:  '=',
        TokenType.NEQ: '<>',
        TokenType.LT:  '<',
        TokenType.GT:  '>',
        TokenType.LTE: '<=',
        TokenType.GTE: '>=',
    }

    def _parse_comparison(self) -> Node:
        left = self._parse_concat()
        while self._check(*self._CMP_OPS.keys()):
            tok = self._advance()
            op  = self._CMP_OPS[tok.type]
            right = self._parse_concat()
            left = BinOp(op=op, left=left, right=right, line=tok.line, col=tok.col)
        return left

    def _parse_concat(self) -> Node:
        left = self._parse_add()
        while self._check(TokenType.AMPERSAND):
            tok = self._advance()
            right = self._parse_add()
            left = BinOp(op='&', left=left, right=right, line=tok.line, col=tok.col)
        return left

    def _parse_add(self) -> Node:
        left = self._parse_mul()
        while self._check(TokenType.PLUS, TokenType.MINUS):
            tok = self._advance()
            op  = '+' if tok.type == TokenType.PLUS else '-'
            right = self._parse_mul()
            left = BinOp(op=op, left=left, right=right, line=tok.line, col=tok.col)
        return left

    def _parse_mul(self) -> Node:
        left = self._parse_power()
        while self._check(TokenType.MULTIPLY, TokenType.DIVIDE, TokenType.KW_DIV, TokenType.KW_MOD):
            tok = self._advance()
            op_map = {
                TokenType.MULTIPLY: '*',
                TokenType.DIVIDE:   '/',
                TokenType.KW_DIV:   'DIV',
                TokenType.KW_MOD:   'MOD',
            }
            right = self._parse_power()
            left = BinOp(op=op_map[tok.type], left=left, right=right, line=tok.line, col=tok.col)
        return left

    def _parse_power(self) -> Node:
        base = self._parse_unary()
        if self._check(TokenType.POWER):
            tok = self._advance()
            exp = self._parse_power()
            return BinOp(op='^', left=base, right=exp, line=tok.line, col=tok.col)
        return base

    def _parse_unary(self) -> Node:
        if self._check(TokenType.MINUS):
            tok = self._advance()
            operand = self._parse_unary()
            return UnaryOp(op='-', operand=operand, line=tok.line, col=tok.col)
        if self._check(TokenType.PLUS):
            self._advance()
            return self._parse_unary()
        return self._parse_primary()

    def _parse_primary(self) -> Node:
        tok = self._peek()

        if self._match(TokenType.INTEGER):
            return IntLiteral(value=tok.value, line=tok.line, col=tok.col)
        if self._match(TokenType.REAL):
            return RealLiteral(value=tok.value, line=tok.line, col=tok.col)
        if self._match(TokenType.STRING):
            return StringLiteral(value=tok.value, line=tok.line, col=tok.col)
        if self._match(TokenType.BOOL_TRUE):
            return BoolLiteral(value=True, line=tok.line, col=tok.col)
        if self._match(TokenType.BOOL_FALSE):
            return BoolLiteral(value=False, line=tok.line, col=tok.col)

        if self._match(TokenType.LPAREN):
            inner = self._parse_expr()
            self._expect(TokenType.RPAREN, ")")
            return inner

        if self._check(TokenType.IDENT):
            name_tok = self._advance()
            name     = name_tok.value
            if self._check(TokenType.LBRACKET):
                self._advance()
                indices = [self._parse_expr()]
                while self._match(TokenType.COMMA):
                    indices.append(self._parse_expr())
                self._expect(TokenType.RBRACKET, "]")
                return ArrayRef(name=name, indices=indices, line=name_tok.line, col=name_tok.col)
            if self._check(TokenType.LPAREN):
                args = self._parse_arg_list()
                return FuncCall(name=name, args=args, line=name_tok.line, col=name_tok.col)
            return VarRef(name=name, line=name_tok.line, col=name_tok.col)

        raise self._error(f"Μη αναμενόμενο σύμβολο: '{tok.value}' στη γραμμή {tok.line}")
