# ΓΛΩΣΣΑ Online — Διερμηνευτής Ψευδοκώδικα ΑΕΠΠ

Διαδικτυακό IDE για τον ψευδοκώδικα ΓΛΩΣΣΑ, ειδικά σχεδιασμένο για μαθητές Γ' Λυκείου που προετοιμάζονται για τις Πανελλήνιες εξετάσεις ΑΕΠΠ.

---

## Stack & Αρχιτεκτονική

| Επίπεδο | Τεχνολογία | Λόγος επιλογής |
|---------|-----------|----------------|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind | Γρήγορο, type-safe, εξαιρετικό DX |
| **Editor** | Monaco Editor (VS Code engine) | Syntax highlighting + autocomplete για ΓΛΩΣΣΑ |
| **Backend** | Python FastAPI + Uvicorn | Ο interpreter είναι Python, φυσική επιλογή |
| **Interpreter** | Custom Python (lexer → parser → tree-walk) | Πλήρης υποστήριξη ΑΕΠΠ semantics |
| **Reverse Proxy** | nginx | Rate limiting, SSL termination, static files |
| **Container** | Docker Compose | Zero-config deployment |

## Αρχιτεκτονικό Διάγραμμα

```
┌─────────────────────────────────────────────────────┐
│  Browser                                            │
│  ┌─────────────────────────────────────────────┐   │
│  │  React App (Vite build)                     │   │
│  │  ├── Monaco Editor (ΓΛΩΣΣΑ syntax)          │   │
│  │  ├── Input panel (ΔΙΑΒΑΣΕ data)             │   │
│  │  ├── Output console                         │   │
│  │  └── Examples library                       │   │
│  └───────────────┬─────────────────────────────┘   │
└──────────────────┼──────────────────────────────────┘
                   │ HTTPS
┌──────────────────▼──────────────────────────────────┐
│  nginx (port 80/443)                                │
│  ├── /        → frontend:80 (static React)          │
│  └── /api/*   → backend:8000 (FastAPI)              │
└──────────┬──────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────┐
│  FastAPI (Uvicorn, 4 workers)                       │
│  ├── POST /api/execute  → run_glossa()              │
│  ├── POST /api/validate → syntax check              │
│  ├── GET  /api/examples → bundled programs          │
│  └── GET  /api/health   → liveness probe            │
│                                                     │
│  Interpreter Pipeline:                              │
│  Source → Lexer → Token[] → Parser → AST           │
│                                    → Interpreter    │
│                                    → Output string  │
└─────────────────────────────────────────────────────┘
```

## ΓΛΩΣΣΑ — Υποστηριζόμενο Συντακτικό

```
ΠΡΟΓΡΑΜΜΑ Όνομα
ΣΤΑΘΕΡΕΣ          ! Σταθερές
  PI = 3.14159
ΜΕΤΑΒΛΗΤΕΣ        ! Δήλωση μεταβλητών
  ΑΚΕΡΑΙΕΣ: x, y
  ΠΡΑΓΜΑΤΙΚΕΣ: a
  ΧΑΡΑΚΤΗΡΕΣ: s
  ΛΟΓΙΚΕΣ: flag
ΠΙΝΑΚΕΣ            ! Πίνακες (1D & 2D, 1-based)
  A[10]: ΑΚΕΡΑΙΕΣ
  B[3,4]: ΠΡΑΓΜΑΤΙΚΕΣ

ΑΡΧΗ
  x ← 5            ! Ανάθεση (← ή <-)
  ΔΙΑΒΑΣΕ y        ! Είσοδος
  ΓΡΑΨΕ x + y      ! Έξοδος

  ΑΝ x > 3 ΤΟΤΕ   ! Εντολή απόφασης
    ΓΡΑΨΕ 'Μεγάλο'
  ΑΛΛΙΩΣ
    ΓΡΑΨΕ 'Μικρό'
  ΤΕΛΟΣ_ΑΝ

  ΓΙΑ i ΑΠΟ 1 ΜΕΧΡΙ 10 ΜΕ_ΒΗΜΑ 2  ! For loop
    ΓΡΑΨΕ i
  ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ

  ΟΣΟ x > 0 ΕΠΑΝΑΛΑΒΕ  ! While loop
    x ← x - 1
  ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ

  ΑΡΧΗ_ΕΠΑΝΑΛΗΨΗΣ       ! Repeat-Until
    x ← x + 1
  ΜΕΧΡΙΣ_ΟΤΟΥ x = 5

  ΚΑΛΕΣΕ Διαδικασια(x)  ! Κλήση διαδικασίας
  y ← Συνάρτηση(x)      ! Κλήση συνάρτησης

ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ
```

### Τελεστές
| Κατηγορία | Τελεστές |
|-----------|---------|
| Αριθμητικοί | `+  -  *  /  ^  DIV  MOD` |
| Σύγκρισης | `=  <>  <  >  <=  >=` |
| Λογικοί | `ΚΑΙ  Η  ΟΧΙ` |
| Αλφαριθμητικοί | `&` (συνένωση) |

### Ενσωματωμένες Συναρτήσεις
`Α_Τ` `Τ_Α` `ΑΠΟ_Τ` `ΤΥΧΑΙΟΣ` `ΗΜ` `ΣΥΝ` `ΕΦ` `ΑΡΣ` `ΛΟΓ` `Ε` `ΜΗΚΟΣ` `ΚΕΦΑΛΑΙΑ` `ΠΕΖΑ`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/execute` | Εκτέλεση κώδικα ΓΛΩΣΣΑ |
| `POST` | `/api/validate` | Σύνταξη μόνο (χωρίς εκτέλεση) |
| `GET` | `/api/examples` | Βιβλιοθήκη παραδειγμάτων |
| `GET` | `/api/health` | Liveness probe |

### POST /api/execute
```json
// Request
{ "code": "ΠΡΟΓΡΑΜΜΑ...", "inputs": ["5", "10"] }

// Response
{ "success": true, "output": "15\n", "error": null, "error_line": 0, "time_ms": 2.3 }
```

## Εκκίνηση (Development)

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (νέο terminal)
cd frontend
npm install
npm run dev      # http://localhost:5173
```

## Deploy (Production)

```bash
docker compose up -d --build
# Η εφαρμογή εκτελείται στο http://localhost:80
```

Για HTTPS, τοποθέτησε τα πιστοποιητικά SSL στον φάκελο `ssl/` και
ενημέρωσε το `nginx.conf` αναλόγως.

## Ασφάλεια Production

- **Rate limiting:** 20 αιτήσεις/λεπτό ανά IP (nginx + FastAPI)
- **Timeout:** Εκτέλεση τερματίζεται μετά από 200.000 βήματα (≈infinite loop guard)
- **Max output:** 5.000 χαρακτήρες εξόδου
- **CORS:** Περιόρισε το `allow_origins` στο domain σου για production
- **Input validation:** Pydantic + max_length σε όλα τα fields
