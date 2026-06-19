# -*- coding: utf-8 -*-
"""
FastAPI backend for the ΓΛΩΣΣΑ online IDE.
POST /api/execute   – run pseudocode
POST /api/validate  – syntax-check only
GET  /api/examples  – return example programs
GET  /api/health    – liveness probe
"""

from __future__ import annotations
import asyncio
import concurrent.futures
import time
import logging
from typing import List, Optional

from fastapi import FastAPI, Request, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from interpreter import run_glossa
from interpreter.lexer import Lexer, LexerError
from interpreter.parser import Parser, ParseError
from interpreter.interpreter import Interpreter, RuntimeError_, StepLimitExceeded, InputExhausted
from exercises import EXERCISES

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("glossa")

app = FastAPI(
    title="ΓΛΩΣΣΑ Online IDE",
    description="Web interpreter for Greek high-school ΑΕΠΠ pseudocode",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://pseudocode.gr",
        "https://www.pseudocode.gr",
        # local dev
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Simple in-memory rate limiter ──────────────────────────────────────────────
from collections import defaultdict
_rate: dict[str, list[float]] = defaultdict(list)
RATE_WINDOW   = 60   # seconds
RATE_MAX_REQS = 30   # per window per IP

def _check_rate(ip: str):
    now = time.time()
    reqs = [t for t in _rate[ip] if now - t < RATE_WINDOW]
    if len(reqs) >= RATE_MAX_REQS:
        raise HTTPException(status_code=429,
                            detail=f"Πολλές αιτήσεις. Περίμενε {RATE_WINDOW} δευτερόλεπτα.")
    reqs.append(now)
    _rate[ip] = reqs


# ── Schemas ────────────────────────────────────────────────────────────────────
class ExecuteRequest(BaseModel):
    code:   str   = Field(..., max_length=50_000)
    inputs: List[str] = Field(default_factory=list, max_length=200)

class ExecuteResponse(BaseModel):
    success:    bool
    output:     str
    error:      Optional[str]
    error_line: int
    time_ms:    float


# ── Endpoints ──────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/execute", response_model=ExecuteResponse)
async def execute(req: ExecuteRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    _check_rate(ip)

    t0 = time.perf_counter()
    result = run_glossa(req.code, req.inputs)
    elapsed = (time.perf_counter() - t0) * 1000

    logger.info("execute ip=%s success=%s time=%.1fms", ip, result["success"], elapsed)
    return ExecuteResponse(
        success    = result["success"],
        output     = result["output"],
        error      = result.get("error"),
        error_line = result.get("error_line", 0),
        time_ms    = round(elapsed, 1),
    )


@app.post("/api/validate")
async def validate(req: ExecuteRequest, request: Request):
    """Syntax-check only — does not execute."""
    from interpreter.lexer import Lexer, LexerError
    from interpreter.parser import Parser, ParseError

    try:
        tokens = Lexer(req.code).tokenize()
        Parser(tokens).parse()
        return {"valid": True, "error": None, "error_line": 0}
    except (LexerError, ParseError) as e:
        return {"valid": False, "error": e.greek_message, "error_line": e.line}


@app.get("/api/examples")
def examples():
    return {"examples": EXAMPLES}


@app.get("/api/exercises")
def get_exercises():
    """Return all exercises (without test case expected outputs — keep them hidden)."""
    public = []
    for ex in EXERCISES:
        public.append({
            "id":          ex["id"],
            "title":       ex["title"],
            "category":    ex["category"],
            "difficulty":  ex["difficulty"],
            "description": ex["description"],
            "starter_code": ex["starter_code"],
            "test_count":  len(ex["test_cases"]),
        })
    return {"exercises": public}


class GradeRequest(BaseModel):
    exercise_id: str
    code: str = Field(..., max_length=50_000)

class TestResult(BaseModel):
    index: int
    passed: bool
    output: str
    expected: str

class GradeResponse(BaseModel):
    passed: int
    total: int
    results: List[TestResult]

@app.post("/api/grade", response_model=GradeResponse)
async def grade(req: GradeRequest, request: Request):
    """Run code against exercise test cases and return pass/fail per test."""
    ip = request.client.host if request.client else "unknown"
    _check_rate(ip)

    # Find the exercise
    exercise = next((e for e in EXERCISES if e["id"] == req.exercise_id), None)
    if not exercise:
        raise HTTPException(status_code=404, detail="Άσκηση δεν βρέθηκε.")

    results = []
    passed = 0

    for i, tc in enumerate(exercise["test_cases"]):
        result = run_glossa(req.code, tc["inputs"])
        # Normalize: strip each line, remove trailing empty lines
        def normalize(s: str) -> str:
            lines = [l.rstrip() for l in s.rstrip("\n").split("\n")]
            return "\n".join(lines)

        got      = normalize(result.get("output", ""))
        expected = normalize(tc["expected"])

        ok = result["success"] and got == expected
        if ok:
            passed += 1

        results.append(TestResult(
            index=i,
            passed=ok,
            output=got if result["success"] else result.get("error", ""),
            expected=expected,
        ))

    logger.info("grade exercise=%s ip=%s passed=%d/%d",
                req.exercise_id, ip, passed, len(results))

    return GradeResponse(passed=passed, total=len(results), results=results)


# ── Contact form ──────────────────────────────────────────────────────────────
import json as _json
from pathlib import Path as _Path
from datetime import datetime as _dt

class ContactRequest(BaseModel):
    name:    str = Field(..., min_length=1, max_length=100)
    email:   str = Field("", max_length=200)
    message: str = Field(..., min_length=1, max_length=2000)

_CONTACT_FILE = _Path(__file__).parent / "contacts.jsonl"

@app.post("/api/contact")
async def contact(req: ContactRequest):
    entry = {
        "ts":      _dt.utcnow().isoformat(),
        "name":    req.name,
        "email":   req.email,
        "message": req.message,
    }
    try:
        with _CONTACT_FILE.open("a", encoding="utf-8") as f:
            f.write(_json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as e:
        logger.error("contact write error: %s", e)
        raise HTTPException(status_code=500, detail="Σφάλμα αποθήκευσης.")
    logger.info("contact from=%s email=%s", req.name, req.email)
    return {"ok": True}


# ── WebSocket interactive execution ────────────────────────────────────────────
_ws_executor = concurrent.futures.ThreadPoolExecutor(max_workers=10)

@app.websocket("/ws/execute")
async def ws_execute(websocket: WebSocket):
    await websocket.accept()
    loop = asyncio.get_running_loop()
    input_queue: asyncio.Queue[str] = asyncio.Queue()

    try:
        data = await websocket.receive_json()
        code = data.get("code", "")

        # ── callbacks (called from interpreter thread) ─────────────────────
        def sync_output(text: str):
            asyncio.run_coroutine_threadsafe(
                websocket.send_json({"type": "output", "text": text}), loop
            )

        def sync_input(line_num: int) -> str:
            # Signal frontend that input is needed
            asyncio.run_coroutine_threadsafe(
                websocket.send_json({"type": "input_request", "line": line_num}), loop
            )
            # Block this thread until frontend sends the value
            future = asyncio.run_coroutine_threadsafe(input_queue.get(), loop)
            return future.result(timeout=300)

        # ── run interpreter in thread ──────────────────────────────────────
        def run_interp():
            try:
                tokens  = Lexer(code).tokenize()
                program = Parser(tokens).parse()
                interp  = Interpreter(input_fn=sync_input, output_fn=sync_output)
                interp.execute(program)
                asyncio.run_coroutine_threadsafe(
                    websocket.send_json({"type": "done", "success": True}), loop
                )
            except LexerError as e:
                asyncio.run_coroutine_threadsafe(
                    websocket.send_json({"type": "done", "success": False,
                        "error": f"Λεξιλογικό σφάλμα (γραμμή {e.line}): {e.greek_message}",
                        "error_line": e.line}), loop
                )
            except ParseError as e:
                asyncio.run_coroutine_threadsafe(
                    websocket.send_json({"type": "done", "success": False,
                        "error": e.greek_message, "error_line": e.line}), loop
                )
            except RuntimeError_ as e:
                asyncio.run_coroutine_threadsafe(
                    websocket.send_json({"type": "done", "success": False,
                        "error": e.greek_message, "error_line": e.line}), loop
                )
            except (StepLimitExceeded, InputExhausted) as e:
                asyncio.run_coroutine_threadsafe(
                    websocket.send_json({"type": "done", "success": False,
                        "error": str(e), "error_line": 0}), loop
                )
            except Exception as e:
                asyncio.run_coroutine_threadsafe(
                    websocket.send_json({"type": "done", "success": False,
                        "error": f"Εσωτερικό σφάλμα: {e}", "error_line": 0}), loop
                )

        future = _ws_executor.submit(run_interp)

        # ── receive loop: relay input from frontend → interpreter thread ───
        while not future.done():
            try:
                msg = await asyncio.wait_for(websocket.receive_json(), timeout=0.05)
                if msg.get("type") == "input":
                    await input_queue.put(msg.get("value", ""))
            except asyncio.TimeoutError:
                continue
            except WebSocketDisconnect:
                future.cancel()
                break

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error("ws_execute error: %s", e)
        try:
            await websocket.send_json({"type": "done", "success": False,
                                       "error": f"Σφάλμα: {e}", "error_line": 0})
        except Exception:
            pass


# ── Bundled examples ───────────────────────────────────────────────────────────
EXAMPLES = [
    {
        "id": "temp_convert",
        "title": "Μετατροπή Θερμοκρασίας",
        "category": "Βασικά",
        "description": "Μετατρέπει βαθμούς Celsius σε Fahrenheit.",
        "inputs": ["100"],
        "code": """\
ΠΡΟΓΡΑΜΜΑ ΜετατροπηΘερμοκρασιας
ΜΕΤΑΒΛΗΤΕΣ
  ΠΡΑΓΜΑΤΙΚΕΣ: celsius, fahrenheit
ΑΡΧΗ
  ΔΙΑΒΑΣΕ celsius
  fahrenheit ← celsius * 9 / 5 + 32
  ΓΡΑΨΕ celsius, ' °C =', fahrenheit, ' °F'
ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ""",
    },
    {
        "id": "bmi",
        "title": "Υπολογισμός ΔΜΣ (BMI)",
        "category": "Βασικά",
        "description": "Υπολογίζει τον Δείκτη Μάζας Σώματος και χαρακτηρίζει το αποτέλεσμα.",
        "inputs": ["70", "1.75"],
        "code": """\
ΠΡΟΓΡΑΜΜΑ ΥπολογισμοςBMI
ΜΕΤΑΒΛΗΤΕΣ
  ΠΡΑΓΜΑΤΙΚΕΣ: βαρος, υψος, bmi
ΑΡΧΗ
  ΔΙΑΒΑΣΕ βαρος
  ΔΙΑΒΑΣΕ υψος
  bmi ← βαρος / (υψος * υψος)
  ΓΡΑΨΕ 'ΔΜΣ:', bmi
  ΑΝ bmi < 18.5 ΤΟΤΕ
    ΓΡΑΨΕ 'Λιποβαρής'
  ΑΛΛΙΩΣ_ΑΝ bmi < 25 ΤΟΤΕ
    ΓΡΑΨΕ 'Κανονικό βάρος'
  ΑΛΛΙΩΣ_ΑΝ bmi < 30 ΤΟΤΕ
    ΓΡΑΨΕ 'Υπέρβαρος'
  ΑΛΛΙΩΣ
    ΓΡΑΨΕ 'Παχυσαρκία'
  ΤΕΛΟΣ_ΑΝ
ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ""",
    },
    {
        "id": "gcd",
        "title": "ΜΚΔ — Αλγόριθμος Ευκλείδη",
        "category": "Αποφάσεις",
        "description": "Βρίσκει τον Μέγιστο Κοινό Διαιρέτη δύο αριθμών.",
        "inputs": ["48", "18"],
        "code": """\
ΠΡΟΓΡΑΜΜΑ ΜεγιστοςΚοινοςΔιαιρετης
ΜΕΤΑΒΛΗΤΕΣ
  ΑΚΕΡΑΙΕΣ: a, b, temp
ΑΡΧΗ
  ΔΙΑΒΑΣΕ a
  ΔΙΑΒΑΣΕ b
  ΟΣΟ b <> 0 ΕΠΑΝΑΛΑΒΕ
    temp ← b
    b ← a MOD b
    a ← temp
  ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ
  ΓΡΑΨΕ 'ΜΚΔ:', a
ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ""",
    },
    {
        "id": "multiplication_table",
        "title": "Πίνακας Πολλαπλασιασμού",
        "category": "Βρόχοι",
        "description": "Εκτυπώνει τον πίνακα πολλαπλασιασμού για έναν αριθμό (1 έως 10).",
        "inputs": ["7"],
        "code": """\
ΠΡΟΓΡΑΜΜΑ ΠινακαςΠολλαπλασιασμου
ΜΕΤΑΒΛΗΤΕΣ
  ΑΚΕΡΑΙΕΣ: n, i
ΑΡΧΗ
  ΔΙΑΒΑΣΕ n
  ΓΙΑ i ΑΠΟ 1 ΜΕΧΡΙ 10
    ΓΡΑΨΕ n, 'x', i, '=', n * i
  ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ
ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ""",
    },
    {
        "id": "capital_growth",
        "title": "Ανάπτυξη Κεφαλαίου",
        "category": "Βρόχοι",
        "description": "Υπολογίζει πόσα χρόνια χρειάζεται κεφάλαιο να διπλασιαστεί με επιτόκιο 5%.",
        "inputs": ["1000"],
        "code": """\
ΠΡΟΓΡΑΜΜΑ ΑναπτυξηΚεφαλαιου
ΜΕΤΑΒΛΗΤΕΣ
  ΠΡΑΓΜΑΤΙΚΕΣ: kefalio, stoxos
  ΑΚΕΡΑΙΕΣ: xronia
ΑΡΧΗ
  ΔΙΑΒΑΣΕ kefalio
  stoxos ← kefalio * 2
  xronia ← 0
  ΟΣΟ kefalio < stoxos ΕΠΑΝΑΛΑΒΕ
    kefalio ← kefalio * 1.05
    xronia ← xronia + 1
  ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ
  ΓΡΑΨΕ 'Χρόνια για διπλασιασμό:', xronia
ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ""",
    },
    {
        "id": "array_search",
        "title": "Σειριακή Αναζήτηση",
        "category": "Πίνακες",
        "description": "Αναζητά μια τιμή σε πίνακα 6 στοιχείων και εκτυπώνει τη θέση της.",
        "inputs": ["10", "20", "30", "40", "50", "60", "30"],
        "code": """\
ΠΡΟΓΡΑΜΜΑ ΣειριακηΑναζητηση
ΜΕΤΑΒΛΗΤΕΣ
  ΑΚΕΡΑΙΕΣ: i, target, thesi
  ΛΟΓΙΚΕΣ: vrethike
ΠΙΝΑΚΕΣ
  A[6]: ΑΚΕΡΑΙΕΣ
ΑΡΧΗ
  ΓΙΑ i ΑΠΟ 1 ΜΕΧΡΙ 6
    ΔΙΑΒΑΣΕ A[i]
  ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ
  ΔΙΑΒΑΣΕ target
  vrethike ← ΨΕΥΔΗΣ
  ΓΙΑ i ΑΠΟ 1 ΜΕΧΡΙ 6
    ΑΝ A[i] = target ΤΟΤΕ
      vrethike ← ΑΛΗΘΗΣ
      thesi ← i
    ΤΕΛΟΣ_ΑΝ
  ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ
  ΑΝ vrethike ΤΟΤΕ
    ΓΡΑΨΕ 'Βρέθηκε στη θέση:', thesi
  ΑΛΛΙΩΣ
    ΓΡΑΨΕ 'Δεν βρέθηκε'
  ΤΕΛΟΣ_ΑΝ
ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ""",
    },
    {
        "id": "array_avg",
        "title": "Μέσος Όρος Πίνακα",
        "category": "Πίνακες",
        "description": "Διαβάζει Ν αριθμούς, υπολογίζει τον μέσο όρο και μετράει πόσοι υπερβαίνουν τον ΜΟ.",
        "inputs": ["5", "80", "65", "90", "70", "55"],
        "code": """\
ΠΡΟΓΡΑΜΜΑ ΜεσοςΟροςΠινακα
ΜΕΤΑΒΛΗΤΕΣ
  ΑΚΕΡΑΙΕΣ: n, i, plithos
  ΠΡΑΓΜΑΤΙΚΕΣ: athroisma, mesos
ΠΙΝΑΚΕΣ
  A[100]: ΠΡΑΓΜΑΤΙΚΕΣ
ΑΡΧΗ
  ΔΙΑΒΑΣΕ n
  athroisma ← 0
  ΓΙΑ i ΑΠΟ 1 ΜΕΧΡΙ n
    ΔΙΑΒΑΣΕ A[i]
    athroisma ← athroisma + A[i]
  ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ
  mesos ← athroisma / n
  ΓΡΑΨΕ 'Μέσος Όρος:', mesos
  plithos ← 0
  ΓΙΑ i ΑΠΟ 1 ΜΕΧΡΙ n
    ΑΝ A[i] > mesos ΤΟΤΕ
      plithos ← plithos + 1
    ΤΕΛΟΣ_ΑΝ
  ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ
  ΓΡΑΨΕ 'Πάνω από ΜΟ:', plithos
ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ""",
    },
    {
        "id": "func_example",
        "title": "Συνάρτηση: Δύναμη",
        "category": "Συναρτήσεις",
        "description": "Υπολογίζει b^n με επαναληπτική συνάρτηση.",
        "inputs": ["2", "10"],
        "code": """\
ΠΡΟΓΡΑΜΜΑ Δυναμη
ΜΕΤΑΒΛΗΤΕΣ
  ΑΚΕΡΑΙΕΣ: baση, exponent

ΣΥΝΑΡΤΗΣΗ Dynamh(b, n): ΑΚΕΡΑΙΑ
ΜΕΤΑΒΛΗΤΕΣ
  ΑΚΕΡΑΙΕΣ: i, result
ΑΡΧΗ
  result ← 1
  ΓΙΑ i ΑΠΟ 1 ΜΕΧΡΙ n
    result ← result * b
  ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ
  Dynamh ← result
ΤΕΛΟΣ_ΣΥΝΑΡΤΗΣΗΣ

ΑΡΧΗ
  ΔΙΑΒΑΣΕ baση
  ΔΙΑΒΑΣΕ exponent
  ΓΡΑΨΕ Dynamh(baση, exponent)
ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ""",
    },
]
