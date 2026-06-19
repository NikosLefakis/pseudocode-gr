# -*- coding: utf-8 -*-
"""
Lexer for ΓΛΩΣΣΑ — the Greek pseudocode language used in Greek high-school
Panhellenic exams (ΑΕΠΠ textbook).
"""

import re
from enum import Enum, auto
from dataclasses import dataclass
from typing import List, Optional


class TokenType(Enum):
    # ── Literals ──────────────────────────────────────────────────────────
    INTEGER     = auto()
    REAL        = auto()
    STRING      = auto()
    BOOL_TRUE   = auto()   # ΑΛΗΘΗΣ
    BOOL_FALSE  = auto()   # ΨΕΥΔΗΣ

    # ── Identifiers ───────────────────────────────────────────────────────
    IDENT       = auto()

    # ── Program structure ─────────────────────────────────────────────────
    KW_PROGRAM      = auto()   # ΠΡΟΓΡΑΜΜΑ
    KW_BEGIN        = auto()   # ΑΡΧΗ
    KW_END_PROGRAM  = auto()   # ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ

    # ── Declaration sections ──────────────────────────────────────────────
    KW_VARIABLES    = auto()   # ΜΕΤΑΒΛΗΤΕΣ
    KW_CONSTANTS    = auto()   # ΣΤΑΘΕΡΕΣ
    KW_ARRAYS       = auto()   # ΠΙΝΑΚΕΣ

    # ── Types ─────────────────────────────────────────────────────────────
    KW_TYPE_INT     = auto()   # ΑΚΕΡΑΙΕΣ  (also ΑΚΕΡΑΙΑ, ΑΚΕΡΑΙΟΣ)
    KW_TYPE_REAL    = auto()   # ΠΡΑΓΜΑΤΙΚΕΣ (also ΠΡΑΓΜΑΤΙΚΗ, ΠΡΑΓΜΑΤΙΚΟΣ)
    KW_TYPE_CHAR    = auto()   # ΧΑΡΑΚΤΗΡΕΣ (also ΧΑΡΑΚΤΗΡΑΣ)
    KW_TYPE_BOOL    = auto()   # ΛΟΓΙΚΕΣ (also ΛΟΓΙΚΗ, ΛΟΓΙΚΟΣ)

    # ── I/O ───────────────────────────────────────────────────────────────
    KW_READ     = auto()   # ΔΙΑΒΑΣΕ
    KW_WRITE    = auto()   # ΓΡΑΨΕ

    # ── Assignment ────────────────────────────────────────────────────────
    ASSIGN      = auto()   # ←  or  <-

    # ── Arithmetic ────────────────────────────────────────────────────────
    PLUS        = auto()
    MINUS       = auto()
    MULTIPLY    = auto()
    DIVIDE      = auto()
    POWER       = auto()
    KW_DIV      = auto()   # DIV  (integer division)
    KW_MOD      = auto()   # MOD  (modulo)

    # ── Comparison ────────────────────────────────────────────────────────
    EQ          = auto()   # =
    NEQ         = auto()   # <>
    LT          = auto()   # <
    GT          = auto()   # >
    LTE         = auto()   # <=
    GTE         = auto()   # >=

    # ── Logical ───────────────────────────────────────────────────────────
    KW_AND      = auto()   # ΚΑΙ
    KW_OR       = auto()   # Η
    KW_NOT      = auto()   # ΟΧΙ

    # ── Conditional ───────────────────────────────────────────────────────
    KW_IF       = auto()   # ΑΝ
    KW_THEN     = auto()   # ΤΟΤΕ
    KW_ELSE     = auto()   # ΑΛΛΙΩΣ
    KW_END_IF   = auto()   # ΤΕΛΟΣ_ΑΝ

    # ── For loop ──────────────────────────────────────────────────────────
    KW_FOR      = auto()   # ΓΙΑ
    KW_FROM     = auto()   # ΑΠΟ
    KW_TO       = auto()   # ΜΕΧΡΙ
    KW_STEP     = auto()   # ΜΕ_ΒΗΜΑ
    KW_END_LOOP = auto()   # ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ

    # ── While loop ────────────────────────────────────────────────────────
    KW_WHILE    = auto()   # ΟΣΟ
    KW_DO       = auto()   # ΕΠΑΝΑΛΑΒΕ

    # ── Repeat-Until loop ─────────────────────────────────────────────────
    KW_REPEAT   = auto()   # ΑΡΧΗ_ΕΠΑΝΑΛΗΨΗΣ
    KW_UNTIL    = auto()   # ΜΕΧΡΙΣ_ΟΤΟΥ

    # ── Functions & Procedures ────────────────────────────────────────────
    KW_FUNCTION      = auto()   # ΣΥΝΑΡΤΗΣΗ
    KW_END_FUNCTION  = auto()   # ΤΕΛΟΣ_ΣΥΝΑΡΤΗΣΗΣ
    KW_PROCEDURE     = auto()   # ΔΙΑΔΙΚΑΣΙΑ
    KW_END_PROCEDURE = auto()   # ΤΕΛΟΣ_ΔΙΑΔΙΚΑΣΙΑΣ
    KW_CALL          = auto()   # ΚΑΛΕΣΕ
    KW_RETURN        = auto()   # ΕΠΙΣΤΡΕΦΕ

    # ── Select/Case ───────────────────────────────────────────────────────
    KW_ELSEIF       = auto()   # ΑΛΛΙΩΣ_ΑΝ
    KW_SELECT       = auto()   # ΕΠΙΛΕΞΕ
    KW_CASE         = auto()   # ΠΕΡΙΠΤΩΣΗ
    KW_END_SELECT   = auto()   # ΤΕΛΟΣ_ΕΠΙΛΟΓΩΝ

    # ── Step (two-word form) ──────────────────────────────────────────────
    KW_ME           = auto()   # ΜΕ  (first word of ΜΕ ΒΗΜΑ)
    KW_STEP_WORD    = auto()   # ΒΗΜΑ (second word of ΜΕ ΒΗΜΑ)

    # ── Write without newline ─────────────────────────────────────────────
    KW_WRITE_NOLINE = auto()   # ΓΡΑΨΕ_

    # ── Punctuation ───────────────────────────────────────────────────────
    LPAREN      = auto()
    RPAREN      = auto()
    LBRACKET    = auto()
    RBRACKET    = auto()
    COMMA       = auto()
    COLON       = auto()
    AMPERSAND   = auto()   # & (string concat)
    DOTDOT      = auto()   # ..  (range in ΠΕΡΙΠΤΩΣΗ)

    # ── Special ───────────────────────────────────────────────────────────
    NEWLINE     = auto()
    EOF         = auto()


# Maps Greek (and Latin) keyword strings → TokenType
KEYWORDS: dict[str, TokenType] = {
    # Program structure
    "ΠΡΟΓΡΑΜΜΑ":            TokenType.KW_PROGRAM,
    "ΑΡΧΗ":                 TokenType.KW_BEGIN,
    "ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ":  TokenType.KW_END_PROGRAM,

    # Sections
    "ΜΕΤΑΒΛΗΤΕΣ":           TokenType.KW_VARIABLES,
    "ΣΤΑΘΕΡΕΣ":             TokenType.KW_CONSTANTS,
    "ΠΙΝΑΚΕΣ":              TokenType.KW_ARRAYS,

    # Types (multiple grammatical forms accepted)
    "ΑΚΕΡΑΙΕΣ":             TokenType.KW_TYPE_INT,
    "ΑΚΕΡΑΙΑ":              TokenType.KW_TYPE_INT,
    "ΑΚΕΡΑΙΟΣ":             TokenType.KW_TYPE_INT,
    "ΠΡΑΓΜΑΤΙΚΕΣ":          TokenType.KW_TYPE_REAL,
    "ΠΡΑΓΜΑΤΙΚΗ":           TokenType.KW_TYPE_REAL,
    "ΠΡΑΓΜΑΤΙΚΟΣ":          TokenType.KW_TYPE_REAL,
    "ΧΑΡΑΚΤΗΡΕΣ":           TokenType.KW_TYPE_CHAR,
    "ΧΑΡΑΚΤΗΡΑΣ":           TokenType.KW_TYPE_CHAR,
    "ΛΟΓΙΚΕΣ":              TokenType.KW_TYPE_BOOL,
    "ΛΟΓΙΚΗ":               TokenType.KW_TYPE_BOOL,
    "ΛΟΓΙΚΟΣ":              TokenType.KW_TYPE_BOOL,

    # Boolean literals
    "ΑΛΗΘΗΣ":               TokenType.BOOL_TRUE,
    "ΨΕΥΔΗΣ":               TokenType.BOOL_FALSE,

    # I/O
    "ΔΙΑΒΑΣΕ":              TokenType.KW_READ,
    "ΓΡΑΨΕ":                TokenType.KW_WRITE,
    "ΓΡΑΨΕ_":               TokenType.KW_WRITE_NOLINE,

    # Arithmetic operators (keywords)
    "DIV":                  TokenType.KW_DIV,
    "MOD":                  TokenType.KW_MOD,

    # Logical
    "ΚΑΙ":                  TokenType.KW_AND,
    "Η":                    TokenType.KW_OR,
    "ΟΧΙ":                  TokenType.KW_NOT,

    # Conditional
    "ΑΝ":                   TokenType.KW_IF,
    "ΤΟΤΕ":                 TokenType.KW_THEN,
    "ΑΛΛΙΩΣ":               TokenType.KW_ELSE,
    "ΑΛΛΙΩΣ_ΑΝ":            TokenType.KW_ELSEIF,
    "ΤΕΛΟΣ_ΑΝ":             TokenType.KW_END_IF,

    # Select/Case
    "ΕΠΙΛΕΞΕ":              TokenType.KW_SELECT,
    "ΠΕΡΙΠΤΩΣΗ":            TokenType.KW_CASE,
    "ΤΕΛΟΣ_ΕΠΙΛΟΓΩΝ":      TokenType.KW_END_SELECT,

    # For loop
    "ΓΙΑ":                  TokenType.KW_FOR,
    "ΑΠΟ":                  TokenType.KW_FROM,
    "ΜΕΧΡΙ":                TokenType.KW_TO,
    "ΜΕ_ΒΗΜΑ":              TokenType.KW_STEP,
    "ΜΕ":                   TokenType.KW_ME,
    "ΒΗΜΑ":                 TokenType.KW_STEP_WORD,
    "ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ":    TokenType.KW_END_LOOP,

    # While
    "ΟΣΟ":                  TokenType.KW_WHILE,
    "ΕΠΑΝΑΛΑΒΕ":            TokenType.KW_DO,

    # Repeat-Until
    "ΑΡΧΗ_ΕΠΑΝΑΛΗΨΗΣ":     TokenType.KW_REPEAT,
    "ΜΕΧΡΙΣ_ΟΤΟΥ":          TokenType.KW_UNTIL,

    # Functions / Procedures
    "ΣΥΝΑΡΤΗΣΗ":            TokenType.KW_FUNCTION,
    "ΤΕΛΟΣ_ΣΥΝΑΡΤΗΣΗΣ":    TokenType.KW_END_FUNCTION,
    "ΔΙΑΔΙΚΑΣΙΑ":           TokenType.KW_PROCEDURE,
    "ΤΕΛΟΣ_ΔΙΑΔΙΚΑΣΙΑΣ":   TokenType.KW_END_PROCEDURE,
    "ΚΑΛΕΣΕ":               TokenType.KW_CALL,
    "ΕΠΙΣΤΡΕΦΕ":            TokenType.KW_RETURN,
}


@dataclass
class Token:
    type: TokenType
    value: object          # raw Python value (int, float, str, bool, or the lexeme)
    line: int
    col: int

    def __repr__(self):
        return f"Token({self.type.name}, {self.value!r}, L{self.line}:C{self.col})"


class LexerError(Exception):
    def __init__(self, message: str, line: int, col: int):
        super().__init__(message)
        self.line = line
        self.col = col
        self.greek_message = message


class Lexer:
    """
    Tokenises ΓΛΩΣΣΑ source code.

    Supports:
    • Greek Unicode identifiers and keywords
    • ← (U+2190) or <- for assignment
    • String literals with single quotes  'hello'
    • Comments starting with !
    • Multi-word keywords: ΤΕΛΟΣ_ΑΝ, ΜΕ_ΒΗΜΑ, ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ, etc.
    """

    # Regex for Greek + Latin identifier characters
    # Includes accented lowercase Greek (ά-ώ = U+03AC–U+03CE) which α-ω misses
    _IDENT_START = re.compile(r'[A-Za-zΑ-Ωα-ωΆ-Ώά-ώ_]', re.UNICODE)
    _IDENT_CONT  = re.compile(r'[A-Za-zΑ-Ωα-ωΆ-Ώά-ώ0-9_]', re.UNICODE)

    def __init__(self, source: str):
        self.source  = source
        self.pos     = 0
        self.line    = 1
        self.col     = 1
        self.tokens: List[Token] = []

    # ── helpers ───────────────────────────────────────────────────────────
    def _peek(self, offset: int = 0) -> str:
        idx = self.pos + offset
        return self.source[idx] if idx < len(self.source) else '\0'

    def _advance(self) -> str:
        ch = self.source[self.pos]
        self.pos += 1
        if ch == '\n':
            self.line += 1
            self.col   = 1
        else:
            self.col += 1
        return ch

    def _add(self, ttype: TokenType, value=None, line=None, col=None):
        self.tokens.append(Token(ttype, value, line or self.line, col or self.col))

    def _error(self, msg: str) -> LexerError:
        return LexerError(msg, self.line, self.col)

    # ── main tokeniser ────────────────────────────────────────────────────
    def tokenize(self) -> List[Token]:
        while self.pos < len(self.source):
            start_line = self.line
            start_col  = self.col
            ch = self._peek()

            # Skip spaces and tabs
            if ch in (' ', '\t', '\r'):
                self._advance()
                continue

            # Newline — significant as statement separator
            if ch == '\n':
                self._advance()
                # Avoid consecutive newlines cluttering the token stream
                if not self.tokens or self.tokens[-1].type != TokenType.NEWLINE:
                    self._add(TokenType.NEWLINE, '\n', start_line, start_col)
                continue

            # Comments: ! until end of line
            if ch == '!':
                while self.pos < len(self.source) and self._peek() != '\n':
                    self._advance()
                continue

            # String literal: 'text'
            if ch == "'":
                self._advance()
                buf = []
                while self.pos < len(self.source) and self._peek() != "'":
                    if self._peek() == '\n':
                        raise self._error("Μη κλειστό αλφαριθμητικό (λείπει η κλειστή απόστροφος)")
                    buf.append(self._advance())
                if self.pos >= len(self.source):
                    raise self._error("Μη κλειστό αλφαριθμητικό")
                self._advance()  # consume closing '
                self._add(TokenType.STRING, ''.join(buf), start_line, start_col)
                continue

            # String literal: "text"
            if ch == '"':
                self._advance()
                buf = []
                while self.pos < len(self.source) and self._peek() != '"':
                    if self._peek() == '\n':
                        raise self._error("Μη κλειστό αλφαριθμητικό (λείπει η κλειστή εισαγωγική)")
                    buf.append(self._advance())
                if self.pos >= len(self.source):
                    raise self._error("Μη κλειστό αλφαριθμητικό")
                self._advance()
                self._add(TokenType.STRING, ''.join(buf), start_line, start_col)
                continue

            # Numbers
            if ch.isdigit():
                self._read_number(start_line, start_col)
                continue

            # ← (U+2190) assignment
            if ch == '←':
                self._advance()
                self._add(TokenType.ASSIGN, '←', start_line, start_col)
                continue

            # < could be <, <=, <>, <-
            if ch == '<':
                self._advance()
                nxt = self._peek()
                if nxt == '=':
                    self._advance()
                    self._add(TokenType.LTE, '<=', start_line, start_col)
                elif nxt == '>':
                    self._advance()
                    self._add(TokenType.NEQ, '<>', start_line, start_col)
                elif nxt == '-':
                    self._advance()
                    self._add(TokenType.ASSIGN, '<-', start_line, start_col)
                else:
                    self._add(TokenType.LT, '<', start_line, start_col)
                continue

            # >  or  >=
            if ch == '>':
                self._advance()
                if self._peek() == '=':
                    self._advance()
                    self._add(TokenType.GTE, '>=', start_line, start_col)
                else:
                    self._add(TokenType.GT, '>', start_line, start_col)
                continue

            # .. range operator (used in ΠΕΡΙΠΤΩΣΗ)
            if ch == '.':
                self._advance()
                if self._peek() == '.':
                    self._advance()
                    self._add(TokenType.DOTDOT, '..', start_line, start_col)
                else:
                    raise self._error("Άγνωστος χαρακτήρας: '.' (εννοείτε '..'?)")
                continue

            # Single-char symbols
            SIMPLE = {
                '=': TokenType.EQ,
                '+': TokenType.PLUS,
                '-': TokenType.MINUS,
                '*': TokenType.MULTIPLY,
                '/': TokenType.DIVIDE,
                '^': TokenType.POWER,
                '(': TokenType.LPAREN,
                ')': TokenType.RPAREN,
                '[': TokenType.LBRACKET,
                ']': TokenType.RBRACKET,
                ',': TokenType.COMMA,
                ':': TokenType.COLON,
                '&': TokenType.AMPERSAND,
            }
            if ch in SIMPLE:
                self._advance()
                self._add(SIMPLE[ch], ch, start_line, start_col)
                continue

            # Identifiers and keywords
            if self._IDENT_START.match(ch):
                self._read_ident(start_line, start_col)
                continue

            raise self._error(f"Άγνωστος χαρακτήρας: '{ch}'")

        self._add(TokenType.EOF, None)
        return self.tokens

    def _read_number(self, start_line: int, start_col: int):
        buf = []
        while self._peek().isdigit():
            buf.append(self._advance())
        if self._peek() == '.' and self.source[self.pos + 1:self.pos + 2].isdigit():
            buf.append(self._advance())  # .
            while self._peek().isdigit():
                buf.append(self._advance())
            self._add(TokenType.REAL, float(''.join(buf)), start_line, start_col)
        else:
            self._add(TokenType.INTEGER, int(''.join(buf)), start_line, start_col)

    def _read_ident(self, start_line: int, start_col: int):
        buf = []
        while self.pos < len(self.source) and self._IDENT_CONT.match(self._peek()):
            buf.append(self._advance())
        word = ''.join(buf)
        upper = word.upper()

        # Check keyword table (uppercase comparison for case-insensitive matching)
        if upper in KEYWORDS:
            ttype = KEYWORDS[upper]
            if ttype == TokenType.BOOL_TRUE:
                self._add(ttype, True, start_line, start_col)
            elif ttype == TokenType.BOOL_FALSE:
                self._add(ttype, False, start_line, start_col)
            else:
                self._add(ttype, upper, start_line, start_col)
        else:
            self._add(TokenType.IDENT, word, start_line, start_col)
