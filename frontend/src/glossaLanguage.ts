/**
 * Monaco Editor language definition for ΓΛΩΣΣΑ (Greek pseudocode).
 * Registers syntax highlighting, smart auto-completion (fuzzy + context-aware),
 * and bracket matching.
 */
import type * as Monaco from 'monaco-editor'

export const LANGUAGE_ID = 'glossa'

/* ─── Fuzzy scoring ─────────────────────────────────────────────────────────
 * Returns a score 0..100 for how well `query` matches `candidate`.
 * - Prefix match:    score 100  (ΠΡΑΓΜ → ΠΡΑΓΜΑΤΙΚΕΣ)
 * - Subsequence:     score 60–80 (letters appear in order)
 * - Transposition:   score 30–50 (one or two adjacent swaps)
 * - No match:        score 0
 * ────────────────────────────────────────────────────────────────────────── */
function fuzzyScore(query: string, candidate: string): number {
  if (!query) return 50
  const q = query.toUpperCase()
  const c = candidate.toUpperCase()

  // Exact or prefix
  if (c === q) return 100
  if (c.startsWith(q)) return 95

  // All query chars appear in candidate in order (subsequence)
  let ci = 0
  let qi = 0
  while (ci < c.length && qi < q.length) {
    if (c[ci] === q[qi]) qi++
    ci++
  }
  if (qi === q.length) {
    // Score based on density: how compact the match is
    const density = q.length / ci
    return Math.round(50 + density * 30)
  }

  // Transposition tolerance: try ignoring one wrong char
  if (q.length >= 3) {
    for (let skip = 0; skip < q.length; skip++) {
      const qShort = q.slice(0, skip) + q.slice(skip + 1)
      let ci2 = 0, qi2 = 0
      while (ci2 < c.length && qi2 < qShort.length) {
        if (c[ci2] === qShort[qi2]) qi2++
        ci2++
      }
      if (qi2 === qShort.length && c.startsWith(q[0])) return 35
    }
  }

  return 0
}

/* ─── Candidate pool ────────────────────────────────────────────────────────
 * Every keyword / builtin / snippet the user might want, with metadata.
 * ────────────────────────────────────────────────────────────────────────── */
type CandidateKind = 'keyword' | 'type' | 'snippet' | 'builtin' | 'operator'

interface Candidate {
  label:       string
  kind:        CandidateKind
  detail:      string
  insertText:  string
  isSnippet?:  boolean
  /** Context where this candidate is especially relevant */
  context?:    'varDecl' | 'condition' | 'loop' | 'top' | 'anywhere'
}

const CANDIDATES: Candidate[] = [
  // ── Structure ──────────────────────────────────────────────────────────
  { label: 'ΠΡΟΓΡΑΜΜΑ',       kind: 'snippet', detail: 'Δομή προγράμματος', context: 'top',
    insertText: 'ΠΡΟΓΡΑΜΜΑ ${1:Ονομα}\nΜΕΤΑΒΛΗΤΕΣ\n\tΑΚΕΡΑΙΕΣ: ${2:x}\nΑΡΧΗ\n\t${3}\nΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ', isSnippet: true },
  { label: 'ΑΡΧΗ',            kind: 'keyword', detail: 'Αρχή τμήματος', insertText: 'ΑΡΧΗ' },
  { label: 'ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ', kind: 'keyword', detail: 'Τέλος προγράμματος', insertText: 'ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ' },
  { label: 'ΜΕΤΑΒΛΗΤΕΣ',     kind: 'keyword', detail: 'Τμήμα δηλώσεων μεταβλητών', insertText: 'ΜΕΤΑΒΛΗΤΕΣ' },
  { label: 'ΣΤΑΘΕΡΕΣ',       kind: 'keyword', detail: 'Τμήμα δηλώσεων σταθερών', insertText: 'ΣΤΑΘΕΡΕΣ' },
  { label: 'ΠΙΝΑΚΕΣ',        kind: 'keyword', detail: 'Τμήμα δηλώσεων πινάκων', insertText: 'ΠΙΝΑΚΕΣ' },

  // ── Types (shown prominently after ':' in var declarations) ───────────
  { label: 'ΑΚΕΡΑΙΕΣ',       kind: 'type', detail: 'Τύπος: Ακέραιοι αριθμοί', insertText: 'ΑΚΕΡΑΙΕΣ', context: 'varDecl' },
  { label: 'ΑΚΕΡΑΙΑ',        kind: 'type', detail: 'Τύπος: Ακέραιος (επιστροφή)', insertText: 'ΑΚΕΡΑΙΑ', context: 'varDecl' },
  { label: 'ΑΚΕΡΑΙΟΣ',       kind: 'type', detail: 'Τύπος: Ακέραιος', insertText: 'ΑΚΕΡΑΙΟΣ', context: 'varDecl' },
  { label: 'ΠΡΑΓΜΑΤΙΚΕΣ',    kind: 'type', detail: 'Τύπος: Πραγματικοί αριθμοί', insertText: 'ΠΡΑΓΜΑΤΙΚΕΣ', context: 'varDecl' },
  { label: 'ΠΡΑΓΜΑΤΙΚΗ',     kind: 'type', detail: 'Τύπος: Πραγματική (επιστροφή)', insertText: 'ΠΡΑΓΜΑΤΙΚΗ', context: 'varDecl' },
  { label: 'ΠΡΑΓΜΑΤΙΚΟΣ',    kind: 'type', detail: 'Τύπος: Πραγματικός', insertText: 'ΠΡΑΓΜΑΤΙΚΟΣ', context: 'varDecl' },
  { label: 'ΧΑΡΑΚΤΗΡΕΣ',     kind: 'type', detail: 'Τύπος: Χαρακτήρες (string)', insertText: 'ΧΑΡΑΚΤΗΡΕΣ', context: 'varDecl' },
  { label: 'ΧΑΡΑΚΤΗΡΑΣ',     kind: 'type', detail: 'Τύπος: Χαρακτήρας', insertText: 'ΧΑΡΑΚΤΗΡΑΣ', context: 'varDecl' },
  { label: 'ΛΟΓΙΚΕΣ',        kind: 'type', detail: 'Τύπος: Λογικές τιμές', insertText: 'ΛΟΓΙΚΕΣ', context: 'varDecl' },
  { label: 'ΛΟΓΙΚΗ',         kind: 'type', detail: 'Τύπος: Λογική τιμή', insertText: 'ΛΟΓΙΚΗ', context: 'varDecl' },
  { label: 'ΛΟΓΙΚΟΣ',        kind: 'type', detail: 'Τύπος: Λογικός', insertText: 'ΛΟΓΙΚΟΣ', context: 'varDecl' },

  // ── Boolean literals ───────────────────────────────────────────────────
  { label: 'ΑΛΗΘΗΣ',         kind: 'keyword', detail: 'Λογική τιμή ΑΛΗΘΗΣ (true)', insertText: 'ΑΛΗΘΗΣ' },
  { label: 'ΨΕΥΔΗΣ',         kind: 'keyword', detail: 'Λογική τιμή ΨΕΥΔΗΣ (false)', insertText: 'ΨΕΥΔΗΣ' },

  // ── I/O ────────────────────────────────────────────────────────────────
  { label: 'ΔΙΑΒΑΣΕ',        kind: 'keyword', detail: 'Ανάγνωση μεταβλητής από είσοδο',
    insertText: 'ΔΙΑΒΑΣΕ ${1:x}', isSnippet: true },
  { label: 'ΓΡΑΨΕ',          kind: 'keyword', detail: 'Εκτύπωση στην έξοδο',
    insertText: "ΓΡΑΨΕ ${1:'κείμενο'}", isSnippet: true },
  { label: 'ΓΡΑΨΕ_',         kind: 'keyword', detail: 'Εκτύπωση χωρίς αλλαγή γραμμής',
    insertText: 'ΓΡΑΨΕ_ ${1:τιμή}', isSnippet: true },

  // ── If ─────────────────────────────────────────────────────────────────
  { label: 'ΑΝ',             kind: 'snippet', detail: 'Εντολή ΑΝ-ΤΟΤΕ', context: 'condition',
    insertText: 'ΑΝ ${1:συνθήκη} ΤΟΤΕ\n\t${2}\nΤΕΛΟΣ_ΑΝ', isSnippet: true },
  { label: 'ΑΝ-ΑΛΛΙΩΣ',     kind: 'snippet', detail: 'Εντολή ΑΝ-ΑΛΛΙΩΣ', context: 'condition',
    insertText: 'ΑΝ ${1:συνθήκη} ΤΟΤΕ\n\t${2}\nΑΛΛΙΩΣ\n\t${3}\nΤΕΛΟΣ_ΑΝ', isSnippet: true },
  { label: 'ΑΝ-ΑΛΛΙΩΣ_ΑΝ',  kind: 'snippet', detail: 'Εντολή ΑΝ με ΑΛΛΙΩΣ_ΑΝ', context: 'condition',
    insertText: 'ΑΝ ${1:συνθ1} ΤΟΤΕ\n\t${2}\nΑΛΛΙΩΣ_ΑΝ ${3:συνθ2} ΤΟΤΕ\n\t${4}\nΑΛΛΙΩΣ\n\t${5}\nΤΕΛΟΣ_ΑΝ', isSnippet: true },
  { label: 'ΤΟΤΕ',           kind: 'keyword', detail: 'Τμήμα ΤΟΤΕ', insertText: 'ΤΟΤΕ' },
  { label: 'ΑΛΛΙΩΣ',        kind: 'keyword', detail: 'Εναλλακτικός κλάδος', insertText: 'ΑΛΛΙΩΣ' },
  { label: 'ΑΛΛΙΩΣ_ΑΝ',     kind: 'keyword', detail: 'Αλλιώς αν (elseif)', insertText: 'ΑΛΛΙΩΣ_ΑΝ ${1:συνθήκη} ΤΟΤΕ', isSnippet: true },
  { label: 'ΤΕΛΟΣ_ΑΝ',      kind: 'keyword', detail: 'Τέλος εντολής ΑΝ', insertText: 'ΤΕΛΟΣ_ΑΝ' },

  // ── Select ─────────────────────────────────────────────────────────────
  { label: 'ΕΠΙΛΕΞΕ',        kind: 'snippet', detail: 'Εντολή ΕΠΙΛΕΞΕ-ΠΕΡΙΠΤΩΣΗ',
    insertText: 'ΕΠΙΛΕΞΕ ${1:έκφρ}\n\tΠΕΡΙΠΤΩΣΗ ${2:τιμή}:\n\t\t${3}\n\tΠΕΡΙΠΤΩΣΗ ΑΛΛΙΩΣ:\n\t\t${4}\nΤΕΛΟΣ_ΕΠΙΛΟΓΩΝ', isSnippet: true },
  { label: 'ΠΕΡΙΠΤΩΣΗ',      kind: 'keyword', detail: 'Κλάδος ΠΕΡΙΠΤΩΣΗ', insertText: 'ΠΕΡΙΠΤΩΣΗ ${1:τιμή}:', isSnippet: true },
  { label: 'ΤΕΛΟΣ_ΕΠΙΛΟΓΩΝ', kind: 'keyword', detail: 'Τέλος εντολής ΕΠΙΛΕΞΕ', insertText: 'ΤΕΛΟΣ_ΕΠΙΛΟΓΩΝ' },

  // ── Loops ──────────────────────────────────────────────────────────────
  { label: 'ΓΙΑ',            kind: 'snippet', detail: 'Βρόχος ΓΙΑ-ΑΠΟ-ΜΕΧΡΙ', context: 'loop',
    insertText: 'ΓΙΑ ${1:i} ΑΠΟ ${2:1} ΜΕΧΡΙ ${3:n}\n\t${4}\nΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ', isSnippet: true },
  { label: 'ΓΙΑ-ΒΗΜΑ',       kind: 'snippet', detail: 'Βρόχος ΓΙΑ με βήμα',
    insertText: 'ΓΙΑ ${1:i} ΑΠΟ ${2:1} ΜΕΧΡΙ ${3:n} ΜΕ_ΒΗΜΑ ${4:2}\n\t${5}\nΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ', isSnippet: true },
  { label: 'ΟΣΟ',            kind: 'snippet', detail: 'Βρόχος ΟΣΟ-ΕΠΑΝΑΛΑΒΕ', context: 'loop',
    insertText: 'ΟΣΟ ${1:συνθήκη} ΕΠΑΝΑΛΑΒΕ\n\t${2}\nΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ', isSnippet: true },
  { label: 'ΑΡΧΗ_ΕΠΑΝΑΛΗΨΗΣ', kind: 'snippet', detail: 'Βρόχος ΑΡΧΗ_ΕΠΑΝΑΛΗΨΗΣ-ΜΕΧΡΙΣ_ΟΤΟΥ',
    insertText: 'ΑΡΧΗ_ΕΠΑΝΑΛΗΨΗΣ\n\t${1}\nΜΕΧΡΙΣ_ΟΤΟΥ ${2:συνθήκη}', isSnippet: true },
  { label: 'ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ', kind: 'keyword', detail: 'Τέλος βρόχου', insertText: 'ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ' },
  { label: 'ΜΕΧΡΙΣ_ΟΤΟΥ',    kind: 'keyword', detail: 'Συνθήκη τερματισμού επανάληψης', insertText: 'ΜΕΧΡΙΣ_ΟΤΟΥ ${1:συνθήκη}', isSnippet: true },
  { label: 'ΑΠΟ',            kind: 'keyword', detail: 'Αρχή εύρους ΓΙΑ', insertText: 'ΑΠΟ' },
  { label: 'ΜΕΧΡΙ',          kind: 'keyword', detail: 'Τέλος εύρους ΓΙΑ', insertText: 'ΜΕΧΡΙ' },
  { label: 'ΜΕ_ΒΗΜΑ',        kind: 'keyword', detail: 'Βήμα βρόχου ΓΙΑ', insertText: 'ΜΕ_ΒΗΜΑ ${1:βήμα}', isSnippet: true },
  { label: 'ΕΠΑΝΑΛΑΒΕ',      kind: 'keyword', detail: 'Λέξη-κλειδί βρόχου ΟΣΟ', insertText: 'ΕΠΑΝΑΛΑΒΕ' },

  // ── Functions / Procedures ─────────────────────────────────────────────
  { label: 'ΣΥΝΑΡΤΗΣΗ',      kind: 'snippet', detail: 'Ορισμός συνάρτησης',
    insertText: 'ΣΥΝΑΡΤΗΣΗ ${1:Ονομα}(${2:παραμ}): ${3:ΑΚΕΡΑΙΑ}\nΜΕΤΑΒΛΗΤΕΣ\n\tΑΚΕΡΑΙΕΣ: ${4}\nΑΡΧΗ\n\t${5}\n\t${1} ← ${6:0}\nΤΕΛΟΣ_ΣΥΝΑΡΤΗΣΗΣ', isSnippet: true },
  { label: 'ΤΕΛΟΣ_ΣΥΝΑΡΤΗΣΗΣ', kind: 'keyword', detail: 'Τέλος συνάρτησης', insertText: 'ΤΕΛΟΣ_ΣΥΝΑΡΤΗΣΗΣ' },
  { label: 'ΔΙΑΔΙΚΑΣΙΑ',     kind: 'snippet', detail: 'Ορισμός διαδικασίας',
    insertText: 'ΔΙΑΔΙΚΑΣΙΑ ${1:Ονομα}(${2:παραμ})\nΜΕΤΑΒΛΗΤΕΣ\n\tΑΚΕΡΑΙΕΣ: ${3}\nΑΡΧΗ\n\t${4}\nΤΕΛΟΣ_ΔΙΑΔΙΚΑΣΙΑΣ', isSnippet: true },
  { label: 'ΤΕΛΟΣ_ΔΙΑΔΙΚΑΣΙΑΣ', kind: 'keyword', detail: 'Τέλος διαδικασίας', insertText: 'ΤΕΛΟΣ_ΔΙΑΔΙΚΑΣΙΑΣ' },
  { label: 'ΚΑΛΕΣΕ',         kind: 'keyword', detail: 'Κλήση διαδικασίας', insertText: 'ΚΑΛΕΣΕ ${1:Ονομα}(${2})', isSnippet: true },
  { label: 'ΕΠΙΣΤΡΕΦΕ',      kind: 'keyword', detail: 'Επιστροφή τιμής', insertText: 'ΕΠΙΣΤΡΕΦΕ ${1:τιμή}', isSnippet: true },

  // ── Logic operators ────────────────────────────────────────────────────
  { label: 'ΚΑΙ',            kind: 'operator', detail: 'Λογικό ΚΑΙ (AND)', insertText: 'ΚΑΙ', context: 'condition' },
  { label: 'Η',              kind: 'operator', detail: 'Λογικό Η (OR)', insertText: 'Η', context: 'condition' },
  { label: 'ΟΧΙ',            kind: 'operator', detail: 'Λογική άρνηση (NOT)', insertText: 'ΟΧΙ ', context: 'condition' },
  { label: 'DIV',            kind: 'operator', detail: 'Ακέραια διαίρεση (π.χ. 7 DIV 2 = 3)', insertText: 'DIV' },
  { label: 'MOD',            kind: 'operator', detail: 'Υπόλοιπο διαίρεσης (π.χ. 7 MOD 2 = 1)', insertText: 'MOD' },

  // ── Math builtins ──────────────────────────────────────────────────────
  { label: 'ΑΡΣ',    kind: 'builtin', detail: 'Τετραγωνική ρίζα  ΑΡΣ(x)', insertText: 'ΑΡΣ(${1:x})', isSnippet: true },
  { label: 'Τ_Ρ',    kind: 'builtin', detail: 'Τετραγωνική ρίζα  Τ_Ρ(x)', insertText: 'Τ_Ρ(${1:x})', isSnippet: true },
  { label: 'ΛΟΓ',    kind: 'builtin', detail: 'Φυσικός λογάριθμος  ΛΟΓ(x)', insertText: 'ΛΟΓ(${1:x})', isSnippet: true },
  { label: 'Ε',      kind: 'builtin', detail: 'Εκθετική συνάρτηση  Ε(x)', insertText: 'Ε(${1:x})', isSnippet: true },
  { label: 'ΗΜ',     kind: 'builtin', detail: 'Ημίτονο  ΗΜ(x)', insertText: 'ΗΜ(${1:x})', isSnippet: true },
  { label: 'ΣΥΝ',    kind: 'builtin', detail: 'Συνημίτονο  ΣΥΝ(x)', insertText: 'ΣΥΝ(${1:x})', isSnippet: true },
  { label: 'ΕΦ',     kind: 'builtin', detail: 'Εφαπτόμενη  ΕΦ(x)', insertText: 'ΕΦ(${1:x})', isSnippet: true },
  { label: 'Α_Τ',    kind: 'builtin', detail: 'Απόλυτη τιμή  Α_Τ(x)', insertText: 'Α_Τ(${1:x})', isSnippet: true },
  { label: 'Α_Μ',    kind: 'builtin', detail: 'Ακέραιο μέρος  Α_Μ(x)', insertText: 'Α_Μ(${1:x})', isSnippet: true },
  { label: 'Τ_Α',    kind: 'builtin', detail: 'Τυχαίος ακέραιος 0..x-1  Τ_Α(x)', insertText: 'Τ_Α(${1:x})', isSnippet: true },
  { label: 'ΤΥΧΑΙΟΣ',kind: 'builtin', detail: 'Τυχαίος πραγματικός 0..1', insertText: 'ΤΥΧΑΙΟΣ', isSnippet: false },
  { label: 'ΑΠΟ_Τ',  kind: 'builtin', detail: 'Ακέραιος από πραγματικό  ΑΠΟ_Τ(x)', insertText: 'ΑΠΟ_Τ(${1:x})', isSnippet: true },

  // ── String builtins ────────────────────────────────────────────────────
  { label: 'ΜΗΚΟΣ',    kind: 'builtin', detail: 'Μήκος συμβολοσειράς  ΜΗΚΟΣ(s)', insertText: 'ΜΗΚΟΣ(${1:s})', isSnippet: true },
  { label: 'ΚΕΦΑΛΑΙΑ', kind: 'builtin', detail: 'Κεφαλαία γράμματα  ΚΕΦΑΛΑΙΑ(s)', insertText: 'ΚΕΦΑΛΑΙΑ(${1:s})', isSnippet: true },
  { label: 'ΠΕΖΑ',     kind: 'builtin', detail: 'Πεζά γράμματα  ΠΕΖΑ(s)', insertText: 'ΠΕΖΑ(${1:s})', isSnippet: true },
]

/* ─── Context detection ──────────────────────────────────────────────────────
 * Looks at the text before the cursor to determine where we are.
 * ────────────────────────────────────────────────────────────────────────── */
function detectContext(model: Monaco.editor.ITextModel, position: Monaco.Position): string {
  // Current line text before cursor
  const lineText = model.getLineContent(position.lineNumber)
  const before   = lineText.substring(0, position.column - 1).trimStart()

  // After ':' on a line that looks like a type declaration
  if (/:\s*\w*$/.test(before)) return 'varDecl'

  // Inside ΑΝ condition (before ΤΟΤΕ)
  if (/^ΑΝ\s/.test(before) && !before.includes('ΤΟΤΕ')) return 'condition'

  // Scan upward for ΜΕΤΑΒΛΗΤΕΣ / ΠΙΝΑΚΕΣ context
  for (let ln = position.lineNumber; ln >= Math.max(1, position.lineNumber - 20); ln--) {
    const l = model.getLineContent(ln).trim()
    if (l === 'ΑΡΧΗ' || l === 'ΑΡΧΗ_ΕΠΑΝΑΛΗΨΗΣ') break
    if (l === 'ΜΕΤΑΒΛΗΤΕΣ' || l === 'ΠΙΝΑΚΕΣ' || l === 'ΣΤΑΘΕΡΕΣ') return 'varDecl'
  }

  return 'anywhere'
}

/* ─── Kind → Monaco CompletionItemKind mapping ──────────────────────────── */
function monacoKind(monaco: typeof Monaco, k: CandidateKind) {
  switch (k) {
    case 'snippet':  return monaco.languages.CompletionItemKind.Snippet
    case 'type':     return monaco.languages.CompletionItemKind.TypeParameter
    case 'builtin':  return monaco.languages.CompletionItemKind.Function
    case 'operator': return monaco.languages.CompletionItemKind.Operator
    default:         return monaco.languages.CompletionItemKind.Keyword
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   registerGlossa
═══════════════════════════════════════════════════════════════════════════ */
export function registerGlossa(monaco: typeof Monaco) {
  if (monaco.languages.getLanguages().some(l => l.id === LANGUAGE_ID)) return

  monaco.languages.register({ id: LANGUAGE_ID, extensions: ['.gls'], aliases: ['ΓΛΩΣΣΑ', 'glossa'] })

  // ── Syntax highlighting ─────────────────────────────────────────────────
  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
    keywords: [
      'ΠΡΟΓΡΑΜΜΑ','ΑΡΧΗ','ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ',
      'ΜΕΤΑΒΛΗΤΕΣ','ΣΤΑΘΕΡΕΣ','ΠΙΝΑΚΕΣ',
      'ΑΚΕΡΑΙΕΣ','ΑΚΕΡΑΙΑ','ΑΚΕΡΑΙΟΣ',
      'ΠΡΑΓΜΑΤΙΚΕΣ','ΠΡΑΓΜΑΤΙΚΗ','ΠΡΑΓΜΑΤΙΚΟΣ',
      'ΧΑΡΑΚΤΗΡΕΣ','ΧΑΡΑΚΤΗΡΑΣ',
      'ΛΟΓΙΚΕΣ','ΛΟΓΙΚΗ','ΛΟΓΙΚΟΣ',
      'ΑΛΗΘΗΣ','ΨΕΥΔΗΣ',
      'ΔΙΑΒΑΣΕ','ΓΡΑΨΕ','ΓΡΑΨΕ_',
      'ΑΝ','ΤΟΤΕ','ΑΛΛΙΩΣ','ΑΛΛΙΩΣ_ΑΝ','ΤΕΛΟΣ_ΑΝ',
      'ΕΠΙΛΕΞΕ','ΠΕΡΙΠΤΩΣΗ','ΤΕΛΟΣ_ΕΠΙΛΟΓΩΝ',
      'ΓΙΑ','ΑΠΟ','ΜΕΧΡΙ','ΜΕ','ΒΗΜΑ','ΜΕ_ΒΗΜΑ','ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ',
      'ΟΣΟ','ΕΠΑΝΑΛΑΒΕ',
      'ΑΡΧΗ_ΕΠΑΝΑΛΗΨΗΣ','ΜΕΧΡΙΣ_ΟΤΟΥ',
      'ΣΥΝΑΡΤΗΣΗ','ΤΕΛΟΣ_ΣΥΝΑΡΤΗΣΗΣ',
      'ΔΙΑΔΙΚΑΣΙΑ','ΤΕΛΟΣ_ΔΙΑΔΙΚΑΣΙΑΣ',
      'ΚΑΛΕΣΕ','ΕΠΙΣΤΡΕΦΕ',
      'ΚΑΙ','Η','ΟΧΙ',
      'DIV','MOD',
    ],
    builtins: [
      'Α_Τ','Τ_Α','ΑΠΟ_Τ','ΤΥΧΑΙΟΣ',
      'ΗΜ','ΣΥΝ','ΕΦ','ΑΡΣ','Τ_Ρ','ΛΟΓ','Ε','Α_Μ',
      'ΜΗΚΟΣ','ΚΕΦΑΛΑΙΑ','ΠΕΖΑ',
    ],
    tokenizer: {
      root: [
        [/!.*$/, 'comment'],
        [/'[^']*'/, 'string'],
        [/"[^"]*"/, 'string'],
        [/\d+\.\d+/, 'number.float'],
        [/\d+/, 'number'],
        [/←|<-/, 'keyword.operator'],
        [/[+\-*\/^<>=&]|<>|<=|>=/, 'operator'],
        [/[Α-ΩA-Zα-ωa-zΆ-Ώ_][Α-ΩA-Zα-ωa-z0-9_Ά-Ώ]*/, {
          cases: { '@keywords': 'keyword', '@builtins': 'predefined', '@default': 'identifier' }
        }],
        [/[()[\],:]/, 'delimiter'],
        [/\s+/, 'white'],
      ],
    },
  } as Monaco.languages.IMonarchLanguage)

  // ── Language config ─────────────────────────────────────────────────────
  monaco.languages.setLanguageConfiguration(LANGUAGE_ID, {
    comments: { lineComment: '!' },
    brackets: [['(', ')'], ['[', ']']],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: "'", close: "'", notIn: ['string'] },
    ],
    surroundingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: "'", close: "'" },
    ],
    folding: {
      markers: {
        start: /^\s*(ΑΡΧΗ|ΑΝ.*ΤΟΤΕ|ΟΣΟ.*ΕΠΑΝΑΛΑΒΕ|ΑΡΧΗ_ΕΠΑΝΑΛΗΨΗΣ|ΓΙΑ)/,
        end:   /^\s*(ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ|ΤΕΛΟΣ_ΑΝ|ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ|ΤΕΛΟΣ_ΣΥΝΑΡΤΗΣΗΣ|ΤΕΛΟΣ_ΔΙΑΔΙΚΑΣΙΑΣ)/,
      }
    }
  })

  // ── Smart completion provider ───────────────────────────────────────────
  monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
    // Trigger on every character (including Greek letters and '_')
    triggerCharacters: 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψωΆΈΊΌΎΏάέίόύώ_ABCDEFGHIJKLMNOPQRSTUVWXYZ:'.split(''),

    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const typed = word.word   // what the user has typed so far

      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber:   position.lineNumber,
        startColumn:     word.startColumn,
        endColumn:       word.endColumn,
      }

      const ctx = detectContext(model, position)

      // Score and filter candidates
      const scored = CANDIDATES
        .map(c => {
          let score = fuzzyScore(typed, c.label)
          if (score === 0) return null

          // Boost context-relevant items
          if (c.context === ctx)                  score += 20
          if (ctx === 'varDecl' && c.kind === 'type') score += 30
          if (ctx === 'condition' && c.kind === 'operator') score += 15

          // Suppress very low scores when user has typed enough
          if (typed.length >= 2 && score < 20) return null

          return { c, score }
        })
        .filter(Boolean) as { c: Candidate; score: number }[]

      // Sort by score descending
      scored.sort((a, b) => b.score - a.score)

      // If nothing typed yet and context is varDecl, show only types first
      const results = (typed === '' && ctx === 'varDecl')
        ? CANDIDATES.filter(c => c.kind === 'type')
        : scored.map(s => s.c)

      const InsertAsSnippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet

      return {
        suggestions: results.map((c, i) => ({
          label:      c.label,
          kind:       monacoKind(monaco, c.kind),
          detail:     c.detail,
          insertText: c.insertText,
          insertTextRules: c.isSnippet ? InsertAsSnippet : undefined,
          range,
          // sortText: pad index so Monaco preserves our order
          sortText:   String(i).padStart(4, '0'),
          // filterText: use the label so Monaco's own filter doesn't discard
          filterText: c.label,
          // Documentation shown in the detail popup
          documentation: {
            value: `**${c.label}**\n\n${c.detail}`,
            isTrusted: true,
          },
        })),
      }
    },
  })

  // ── Themes ─────────────────────────────────────────────────────────────
  monaco.editor.defineTheme('glossa-dark', {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'keyword',          foreground: '60a5fa', fontStyle: 'bold' },
      { token: 'keyword.operator', foreground: 'f472b6', fontStyle: 'bold' },
      { token: 'predefined',       foreground: '34d399', fontStyle: 'italic' },
      { token: 'string',           foreground: 'fbbf24' },
      { token: 'number',           foreground: 'fb923c' },
      { token: 'number.float',     foreground: 'fb923c' },
      { token: 'comment',          foreground: '64748b', fontStyle: 'italic' },
      { token: 'operator',         foreground: 'e2e8f0' },
      { token: 'identifier',       foreground: 'e2e8f0' },
      { token: 'delimiter',        foreground: '94a3b8' },
    ],
    colors: {
      'editor.background':              '#0f172a',
      'editor.foreground':              '#e2e8f0',
      'editor.lineHighlightBackground': '#1e293b',
      'editorLineNumber.foreground':    '#475569',
      'editorCursor.foreground':        '#60a5fa',
      'editor.selectionBackground':     '#1d4ed866',
      'editorIndentGuide.background1':  '#1e293b',
    }
  })

  monaco.editor.defineTheme('glossa-light', {
    base: 'vs', inherit: true,
    rules: [
      { token: 'keyword',          foreground: '1d4ed8', fontStyle: 'bold' },
      { token: 'keyword.operator', foreground: 'be185d', fontStyle: 'bold' },
      { token: 'predefined',       foreground: '047857', fontStyle: 'italic' },
      { token: 'string',           foreground: 'b45309' },
      { token: 'number',           foreground: 'c2410c' },
      { token: 'number.float',     foreground: 'c2410c' },
      { token: 'comment',          foreground: '94a3b8', fontStyle: 'italic' },
      { token: 'operator',         foreground: '334155' },
      { token: 'identifier',       foreground: '0f172a' },
      { token: 'delimiter',        foreground: '64748b' },
    ],
    colors: {
      'editor.background':              '#ffffff',
      'editor.foreground':              '#0f172a',
      'editor.lineHighlightBackground': '#f1f5f9',
      'editorLineNumber.foreground':    '#94a3b8',
      'editorCursor.foreground':        '#2563eb',
      'editor.selectionBackground':     '#bfdbfe88',
      'editorIndentGuide.background1':  '#e2e8f0',
    }
  })
}
