# -*- coding: utf-8 -*-
"""
ΓΛΩΣΣΑ interpreter package.

Usage:
    from interpreter import run_glossa

    result = run_glossa(source_code, inputs=["5", "10"])
    print(result["output"])
"""

from .lexer import Lexer, LexerError
from .parser import Parser, ParseError
from .interpreter import Interpreter, RuntimeError_, StepLimitExceeded, InputExhausted
from typing import List


def run_glossa(source: str, inputs: List[str] | None = None) -> dict:
    """
    Compile and run a ΓΛΩΣΣΑ program.

    Returns a dict:
        {
            "success": bool,
            "output": str,          # program output
            "error": str | None,    # Greek error message if not success
            "error_line": int,      # 0 if unknown
        }
    """
    inputs = inputs or []

    # ── Lex ──────────────────────────────────────────────────────────────
    try:
        lexer  = Lexer(source)
        tokens = lexer.tokenize()
    except LexerError as e:
        return {
            "success": False,
            "output": "",
            "error": f"Λεξιλογικό σφάλμα (γραμμή {e.line}): {e.greek_message}",
            "error_line": e.line,
        }

    # ── Parse ─────────────────────────────────────────────────────────────
    try:
        parser  = Parser(tokens)
        program = parser.parse()
    except ParseError as e:
        return {
            "success": False,
            "output": "",
            "error": e.greek_message,
            "error_line": e.line,
        }

    # ── Execute ───────────────────────────────────────────────────────────
    try:
        interp = Interpreter(inputs)
        output = interp.execute(program)
        return {
            "success": True,
            "output": output,
            "error": None,
            "error_line": 0,
        }
    except InputExhausted as e:
        return {
            "success": False,
            "output": "",
            "error": str(e),
            "error_line": 0,
        }
    except StepLimitExceeded as e:
        return {
            "success": False,
            "output": "",
            "error": str(e),
            "error_line": 0,
        }
    except RuntimeError_ as e:
        return {
            "success": False,
            "output": "",
            "error": e.greek_message,
            "error_line": e.line,
        }
    except Exception as e:
        return {
            "success": False,
            "output": "",
            "error": f"Εσωτερικό σφάλμα: {e}",
            "error_line": 0,
        }
