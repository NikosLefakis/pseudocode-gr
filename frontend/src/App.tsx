import { useState, useCallback, useRef, useEffect } from 'react'
import Editor, { OnMount, loader } from '@monaco-editor/react'
import { registerGlossa, LANGUAGE_ID } from './glossaLanguage'
import type * as Monaco from 'monaco-editor'

// Load Monaco from CDN — keeps monaco-editor out of the Vite production bundle
loader.config({
  paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.50.0/min/vs' }
})

/* ─── config ─────────────────────────────────────────────────────────── */
const API    = import.meta.env.VITE_API_URL || ''
const WS_URL = API.replace(/^http/, 'ws') || ''

const DEFAULT_CODE = ``

/* ─── types ──────────────────────────────────────────────────────────── */
interface Example {
  id: string; title: string; category: string; description: string
  code: string; inputs: string[]
}
interface Exercise {
  id: string; title: string; category: string; difficulty: string
  description: string; starter_code: string; test_count: number
}
interface TestResult { index: number; passed: boolean; output: string; expected: string }
interface GradeResponse { passed: number; total: number; results: TestResult[] }

type TermLine =
  | { kind: 'out';  text: string }
  | { kind: 'echo'; text: string }
  | { kind: 'err';  text: string }
  | { kind: 'info'; text: string }
type SplitDir = 'h' | 'v'
type AppMode  = 'editor' | 'exercises'
type Theme    = 'dark' | 'light' | 'hc-dark' | 'hc-light'

/* ─── difficulty color ───────────────────────────────────────────────── */
const diffColor: Record<string, string> = {
  'Εισαγωγικό': '#22c55e',
  'Βασικό':     '#3b82f6',
  'Μέτριο':     '#f59e0b',
  'Δύσκολο':    '#ef4444',
}

/* ─── icons ──────────────────────────────────────────────────────────── */
const IC = {
  play:    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>,
  stop:    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>,
  trash:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>,
  copy:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  check:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>,
  book:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>,
  pencil:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  term:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 9l3 3-3 3M13 15h4"/></svg>,
  sun:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  moon:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
  contrast:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20" opacity="0.3"/><path d="M12 2a10 10 0 010 20z" fill="currentColor" stroke="none"/></svg>,
  alert:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>,
  x:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  enter:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3 h-3" aria-hidden="true"><path d="M9 10l-5 5 5 5"/><path d="M20 4v7a4 4 0 01-4 4H4"/></svg>,
  splitH:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M12 3v18"/></svg>,
  splitV:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 12h20"/></svg>,
  expand:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>,
  fontUp:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><text x="2" y="17" fontSize="14" fontWeight="bold" stroke="none" fill="currentColor">A</text><path d="M18 8v13M15 18l3 3 3-3"/></svg>,
  back:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>,
  grade:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
}

/* ═══════════════════════════════════════════════════════════════════════
   Theme helpers
═══════════════════════════════════════════════════════════════════════ */
const isHC = (th: Theme) => th === 'hc-dark' || th === 'hc-light'
const isDark = (th: Theme) => th === 'dark' || th === 'hc-dark'

function themeVars(th: Theme) {
  if (th === 'hc-dark') return {
    '--bg':       '#060d1a', '--surface':  '#0d1a2e', '--surface2': '#112240',
    '--header':   '#060d1a', '--terminal': '#040b14', '--border':   '#2a5298',
    '--text':     '#ffffff', '--text2':    '#c8dcff', '--text3':    '#6a9fd8',
  } as React.CSSProperties
  if (th === 'hc-light') return {
    '--bg':       '#ffffff', '--surface':  '#f0f4ff', '--surface2': '#e8eeff',
    '--header':   '#ffffff', '--terminal': '#f8faff', '--border':   '#000000',
    '--text':     '#000000', '--text2':    '#111827', '--text3':    '#374151',
  } as React.CSSProperties
  if (th === 'light') return {
    '--bg':       '#f1f5f9', '--surface':  '#ffffff', '--surface2': '#f8fafc',
    '--header':   '#ffffff', '--terminal': '#f8fafc', '--border':   '#e2e8f0',
    '--text':     '#0f172a', '--text2':    '#334155', '--text3':    '#64748b',
  } as React.CSSProperties
  // dark — deep blue
  return {
    '--bg':       '#08111f', '--surface':  '#0f1e34', '--surface2': '#152844',
    '--header':   '#0a1628', '--terminal': '#060e1a', '--border':   '#1a3a5c',
    '--text':     '#dbeafe', '--text2':    '#93c5fd', '--text3':    '#3b6fa8',
  } as React.CSSProperties
}

function monacoThemeName(th: Theme) {
  if (th === 'hc-dark')  return 'hc-black'
  if (th === 'hc-light') return 'hc-light'
  if (th === 'light')    return 'glossa-light'
  return 'glossa-dark'
}

/* ─── useIsMobile ──────────────────────────────────────────────────────── */
function useIsMobile(bp = 768) {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < bp)
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < bp)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [bp])
  return mobile
}

/* ═══════════════════════════════════════════════════════════════════════
   App
═══════════════════════════════════════════════════════════════════════ */
export default function App() {
  /* theme & layout */
  const [theme, setTheme]           = useState<Theme>('dark')
  const [splitDir, setSplitDir]     = useState<SplitDir>('h')
  const [splitRatio, setSplitRatio] = useState(0.58)
  const [editorFull, setEditorFull] = useState(false)
  const [termFull, setTermFull]     = useState(false)
  const [fontSize, setFontSize]     = useState(14)
  const [mode, setMode]             = useState<AppMode>('editor')

  /* execution */
  const [code, setCode]             = useState(DEFAULT_CODE)
  const [running, setRunning]       = useState(false)
  const [done, setDone]             = useState<{ success: boolean; error?: string; line?: number } | null>(null)
  const [termLines, setTermLines]   = useState<TermLine[]>([])
  const [awaitInput, setAwaitInput] = useState(false)
  const [inputVal, setInputVal]     = useState('')

  /* examples */
  const [showExamples, setShowExamples] = useState(false)
  const [examples, setExamples]     = useState<Example[]>([])
  const [selCat, setSelCat]         = useState('Όλα')

  /* exercises */
  const [exercises, setExercises]       = useState<Exercise[]>([])
  const [selExercise, setSelExercise]   = useState<Exercise | null>(null)
  const [exCat, setExCat]               = useState('Όλα')
  const [grading, setGrading]           = useState(false)
  const [gradeResult, setGradeResult]   = useState<GradeResponse | null>(null)
  const [liveAnnounce, setLiveAnnounce] = useState('')

  /* misc */
  const [cursorPos, setCursorPos]   = useState({ line: 1, col: 1 })
  const [copied, setCopied]         = useState(false)
  const [footerModal, setFooterModal] = useState<'terms'|'privacy'|'cookies'|'credits'|'contact'|null>(null)

  /* mobile */
  const mobile = useIsMobile()
  const [mobileTab, setMobileTab]       = useState<'code'|'terminal'>('code')
  const [mobileExView, setMobileExView] = useState<'list'|'problem'|'editor'>('list')

  /* refs */
  const editorRef    = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef    = useRef<typeof Monaco | null>(null)
  const wsRef        = useRef<WebSocket | null>(null)
  const termEndRef   = useRef<HTMLDivElement | null>(null)
  const inputRef     = useRef<HTMLInputElement | null>(null)
  const decoRef      = useRef<string[]>([])
  const containerRef  = useRef<HTMLDivElement | null>(null)
  const isDragging    = useRef(false)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── CSS vars ─────────────────────────────────────────────────────── */
  const vars    = themeVars(theme)
  const dark    = isDark(theme)
  const hc      = isHC(theme)
  const bg      = 'var(--bg)'
  const surface = 'var(--surface)'
  const surface2= 'var(--surface2)'
  const border  = 'var(--border)'
  const text    = 'var(--text)'
  const text2   = 'var(--text2)'
  const text3   = 'var(--text3)'

  /* ── effects ──────────────────────────────────────────────────────── */
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(monacoThemeName(theme))
    }
  }, [theme, dark])

  useEffect(() => {
    fetch(`${API}/api/examples`).then(r => r.json())
      .then(d => setExamples(d.examples || [])).catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`${API}/api/exercises`).then(r => r.json())
      .then(d => setExercises(d.exercises || [])).catch(() => {})
  }, [])

  useEffect(() => { termEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [termLines, awaitInput])
  useEffect(() => { if (awaitInput) setTimeout(() => inputRef.current?.focus(), 50) }, [awaitInput])

  // Update Monaco font size live
  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize })
  }, [fontSize])

  /* ── drag to resize ───────────────────────────────────────────────── */
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current || !isDragging.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const ratio = splitDir === 'h'
        ? (ev.clientX - rect.left)  / rect.width
        : (ev.clientY - rect.top)   / rect.height
      setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)))
    }
    const onUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  /* ── editor mount ─────────────────────────────────────────────────── */
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current  = editor
    monacoRef.current  = monaco
    registerGlossa(monaco)
    monaco.editor.setModelLanguage(editor.getModel()!, LANGUAGE_ID)
    monaco.editor.setTheme(monacoThemeName(theme))
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, handleRun)
    editor.onDidChangeCursorPosition(e =>
      setCursorPos({ line: e.position.lineNumber, col: e.position.column })
    )
  }

  const clearDecos = () => {
    if (editorRef.current && decoRef.current.length) {
      decoRef.current = editorRef.current.deltaDecorations(decoRef.current, [])
    }
  }

  /* ── stop ─────────────────────────────────────────────────────────── */
  const handleStop = useCallback(() => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
    wsRef.current?.close(); wsRef.current = null
    setRunning(false); setAwaitInput(false)
    setTermLines(p => [...p, { kind: 'info', text: '⏹ Διακοπή από χρήστη.' }])
  }, [])

  /* ── run ──────────────────────────────────────────────────────────── */
  const handleRun = useCallback(() => {
    if (running) return
    if (!code.trim()) {
      editorRef.current?.focus()
      return
    }
    setTermLines([]); setDone(null); setAwaitInput(false); setInputVal('')
    setGradeResult(null); setRunning(true); clearDecos()

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host  = window.location.host
    const wsUrl = WS_URL
      ? `${WS_URL.replace(/^http/, 'ws')}/ws/execute`
      : `${proto}://${host}/ws/execute`

    let retries = 0
    const MAX_RETRIES = 12   // 12 × 5s = 60s max wait (Render cold start)
    let stopped = false

    const connect = () => {
      if (stopped) return
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        retries = 0
        setTermLines([])          // clear any "waking up" messages
        ws.send(JSON.stringify({ code }))
      }

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'output')        setTermLines(p => [...p, { kind: 'out',  text: msg.text }])
        if (msg.type === 'input_request') setAwaitInput(true)
        if (msg.type === 'done') {
          setRunning(false); setAwaitInput(false)
          stopped = true; ws.close(); wsRef.current = null
          setDone({ success: msg.success, error: msg.error, line: msg.error_line })
          if (!msg.success && msg.error_line && editorRef.current && monacoRef.current) {
            const m = monacoRef.current
            decoRef.current = editorRef.current.deltaDecorations([], [{
              range: new m.Range(msg.error_line, 1, msg.error_line, 9999),
              options: { isWholeLine: true, className: 'monaco-error-line' }
            }])
          }
        }
      }

      ws.onerror = () => {
        ws.close()
        if (stopped) return
        retries++
        if (retries <= MAX_RETRIES) {
          const elapsed = retries * 5
          setTermLines([{ kind: 'info', text: `🕐 Ο διακομιστής ξυπνάει... (${elapsed}/${MAX_RETRIES * 5} δευτ.) — παρακαλώ περιμένετε` }])
          retryTimerRef.current = setTimeout(connect, 5000)
        } else {
          stopped = true
          setRunning(false); setAwaitInput(false)
          setTermLines([{ kind: 'err', text: '❌ Αδυναμία σύνδεσης. Ο διακομιστής δεν ανταποκρίθηκε. Δοκίμασε ξανά σε λίγο.' }])
          setDone({ success: false, error: 'Αδυναμία σύνδεσης με τον διακομιστή.' })
        }
      }

      ws.onclose = () => {
        if (stopped || retries > 0) return
        setRunning(false); setAwaitInput(false)
      }
    }

    connect()
  }, [code, running])

  /* ── submit input ─────────────────────────────────────────────────── */
  const submitInput = useCallback(() => {
    if (!wsRef.current || !awaitInput) return
    wsRef.current.send(JSON.stringify({ type: 'input', value: inputVal }))
    setTermLines(p => [...p, { kind: 'echo', text: inputVal }])
    setInputVal(''); setAwaitInput(false)
  }, [awaitInput, inputVal])

  /* ── grade exercise ───────────────────────────────────────────────── */
  const handleGrade = useCallback(async () => {
    if (!selExercise || grading) return
    setGrading(true); setGradeResult(null)
    setLiveAnnounce('Έλεγχος λύσης...')
    try {
      const res = await fetch(`${API}/api/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercise_id: selExercise.id, code }),
      })
      const data: GradeResponse = await res.json()
      setGradeResult(data)
      setLiveAnnounce(
        `Αποτέλεσμα: ${data.passed} από ${data.total} test cases πέρασαν.`
      )
    } catch {
      setLiveAnnounce('Σφάλμα κατά τον έλεγχο.')
    } finally {
      setGrading(false)
    }
  }, [selExercise, code, grading])

  /* ── helpers ──────────────────────────────────────────────────────── */
  const loadExample = (ex: Example) => {
    setCode(ex.code); setTermLines([]); setDone(null)
    clearDecos(); setShowExamples(false)
    setTimeout(() => editorRef.current?.focus(), 100)
  }
  const loadExercise = (ex: Exercise) => {
    setSelExercise(ex); setCode(ex.starter_code)
    setTermLines([]); setDone(null); setGradeResult(null); clearDecos()
    if (mobile) { setMobileExView('problem'); setMobileTab('code') }
    else setTimeout(() => editorRef.current?.focus(), 100)
  }
  const copyCode = () => {
    navigator.clipboard.writeText(code)
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }
  const cycleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  const themeLabel = theme === 'dark' ? 'Φωτεινό θέμα' : 'Σκούρο θέμα'
  const themeIcon  = theme === 'dark' ? IC.sun : IC.moon

  const cats       = ['Όλα', ...Array.from(new Set(examples.map(e => e.category)))]
  const filteredEx = selCat === 'Όλα' ? examples : examples.filter(e => e.category === selCat)
  const exCats     = ['Όλα', ...Array.from(new Set(exercises.map(e => e.category)))]
  const filteredExercises = exCat === 'Όλα' ? exercises : exercises.filter(e => e.category === exCat)

  /* ── computed sizes ───────────────────────────────────────────────── */
  const editorStyle = editorFull
    ? { flex: '1 1 100%' }
    : termFull
      ? { flex: '0 0 0', overflow: 'hidden' }
      : { flex: `0 0 ${splitRatio * 100}%` }

  const termStyle = termFull
    ? { flex: '1 1 100%' }
    : editorFull
      ? { flex: '0 0 0', overflow: 'hidden' }
      : { flex: '1 1 0' }

  /* ═════════════════════════════════════════════════════════════════════
     RENDER
  ═════════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col h-screen overflow-hidden select-none"
      style={{ ...vars, background: bg, color: text }}
      lang="el">

      {/* Screen-reader live region */}
      <div role="status" aria-live="polite" aria-atomic="true"
        className="sr-only">{liveAnnounce}</div>

      {/* ══ HEADER ════════════════════════════════════════════════════ */}
      <header role="banner" className="flex items-center gap-3 px-4 py-2 shrink-0 z-10 border-b"
        style={{ background: 'var(--header)', borderColor: border }}>

        {/* Logo */}
        <div className="flex items-center gap-2.5">
          {/* Ψ logo mark */}
          <div className="w-9 h-9 rounded-xl shrink-0 shadow-lg shadow-blue-900/40" aria-hidden="true"
            style={{ background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)' }}>
            <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-9 h-9">
              <defs>
                <linearGradient id="psi-fg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffffff"/>
                  <stop offset="100%" stopColor="#bfdbfe"/>
                </linearGradient>
              </defs>
              {/* Ψ stem */}
              <rect x="16" y="20" width="4" height="10" rx="1.5" fill="url(#psi-fg)"/>
              {/* Left arm */}
              <path d="M8 10 Q8 22 15 23" stroke="url(#psi-fg)" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
              {/* Right arm */}
              <path d="M28 10 Q28 22 21 23" stroke="url(#psi-fg)" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
              {/* Top crossbar */}
              <rect x="6" y="8" width="24" height="3.5" rx="1.75" fill="url(#psi-fg)"/>
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold leading-none tracking-tight" style={{ color: text }}>
              pseudocode<span style={{ color: '#3b82f6' }}>.gr</span>
            </div>
            <div className="hidden sm:block text-xs mt-0.5" style={{ color: text3 }}>Ψευδοκώδικας ΑΕΠΠ · Πανελλήνιες</div>
          </div>
        </div>

        <div className="flex-1" />

        {/* Nav: Editor / Exercises */}
        <nav aria-label="Κύρια πλοήγηση" className="flex items-center rounded-lg border overflow-hidden" style={{ borderColor: border }}>
          <button
            onClick={() => setMode('editor')}
            aria-pressed={mode === 'editor'}
            aria-label="Επεξεργαστής κώδικα"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all"
            style={mode === 'editor'
              ? { background: '#3b82f6', color: 'white' }
              : { background: surface2, color: text2 }}>
            {IC.pencil}<span className="hidden sm:inline">Επεξεργαστής</span>
          </button>
          <button
            onClick={() => setMode('exercises')}
            aria-pressed={mode === 'exercises'}
            aria-label="Ασκήσεις"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all"
            style={mode === 'exercises'
              ? { background: '#3b82f6', color: 'white' }
              : { background: surface2, color: text2 }}>
            {IC.grade}<span className="hidden sm:inline">Ασκήσεις</span>
          </button>
        </nav>

        {/* Split direction (editor only, desktop only) */}
        {mode === 'editor' && !mobile && (
          <div className="hidden sm:flex items-center rounded-lg border overflow-hidden" style={{ borderColor: border }}>
            <button onClick={() => setSplitDir('h')} title="Οριζόντια διαίρεση" aria-label="Οριζόντια διαίρεση" aria-pressed={splitDir === 'h'}
              className="flex items-center justify-center w-8 h-7 transition-all"
              style={{ background: splitDir === 'h' ? '#3b82f6' : surface2, color: splitDir === 'h' ? 'white' : text3 }}>
              {IC.splitH}
            </button>
            <button onClick={() => setSplitDir('v')} title="Κατακόρυφη διαίρεση" aria-label="Κατακόρυφη διαίρεση" aria-pressed={splitDir === 'v'}
              className="flex items-center justify-center w-8 h-7 transition-all"
              style={{ background: splitDir === 'v' ? '#3b82f6' : surface2, color: splitDir === 'v' ? 'white' : text3 }}>
              {IC.splitV}
            </button>
          </div>
        )}

        {/* Font size (desktop only) */}
        <div className="hidden sm:flex items-center gap-1" role="group" aria-label="Μέγεθος γραμματοσειράς">
          <button onClick={() => setFontSize(s => Math.max(10, s - 2))} aria-label="Μικρότερη γραμματοσειρά"
            className="w-7 h-7 rounded border flex items-center justify-center text-xs font-bold transition-all"
            style={{ background: surface2, borderColor: border, color: text2 }}>A-</button>
          <span className="text-xs font-mono w-6 text-center" style={{ color: text3 }} aria-label={`Μέγεθος ${fontSize}`}>{fontSize}</span>
          <button onClick={() => setFontSize(s => Math.min(24, s + 2))} aria-label="Μεγαλύτερη γραμματοσειρά"
            className="w-7 h-7 rounded border flex items-center justify-center text-xs font-bold transition-all"
            style={{ background: surface2, borderColor: border, color: text2 }}>A+</button>
        </div>

        {/* Examples (editor only) */}
        {mode === 'editor' && (
          <button onClick={() => setShowExamples(true)} aria-label="Παραδείγματα προγραμμάτων"
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg border transition-all"
            style={{ background: surface2, borderColor: border, color: text2 }}>
            {IC.book}<span className="hidden sm:inline">Παραδείγματα</span>
          </button>
        )}

        {/* Theme cycle */}
        <button onClick={cycleTheme} title={themeLabel} aria-label={themeLabel}
          className="p-2 rounded-lg border transition-all"
          style={{ background: surface2, borderColor: border, color: text2 }}>
          {themeIcon}
        </button>
      </header>

      {/* ══ EXERCISES MODE ════════════════════════════════════════════ */}
      {mode === 'exercises' && (
        <div className="flex flex-1 overflow-hidden" style={{ background: bg }}>

          {mobile ? (
            /* ── MOBILE EXERCISES: 3-view navigation ─────────────────── */
            <div className="flex flex-col flex-1 overflow-hidden">

              {/* View 1: list */}
              {(!selExercise || mobileExView === 'list') && (
                <main className="flex flex-col flex-1 overflow-hidden p-4" aria-label="Λίστα ασκήσεων">
                  <h1 className="text-lg font-bold mb-1" style={{ color: text }}>Ασκήσεις ΓΛΩΣΣΑ</h1>
                  <p className="text-xs mb-3" style={{ color: text3 }}>Επίλεξε μια άσκηση και έλεγξε τη λύση σου αυτόματα.</p>
                  <div className="flex gap-2 flex-wrap mb-3" role="group" aria-label="Φίλτρο κατηγορίας">
                    {exCats.map(cat => (
                      <button key={cat} onClick={() => setExCat(cat)} aria-pressed={exCat === cat}
                        className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                        style={exCat === cat ? { background: '#3b82f6', color: 'white' } : { background: surface2, color: text2, border: `1px solid ${border}` }}>
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="overflow-y-auto flex-1 space-y-2" role="list">
                    {filteredExercises.map(ex => (
                      <button key={ex.id} onClick={() => loadExercise(ex)} role="listitem"
                        aria-label={`Άσκηση: ${ex.title}`}
                        className="w-full text-left p-4 rounded-xl border transition-all active:scale-[0.99]"
                        style={{ background: surface2, borderColor: border }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-sm font-semibold" style={{ color: text }}>{ex.title}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                style={{ background: (diffColor[ex.difficulty] || '#64748b') + '22', color: diffColor[ex.difficulty] || '#64748b' }}>
                                {ex.difficulty}
                              </span>
                            </div>
                            <p className="text-xs leading-snug" style={{ color: text3 }}>{ex.description.split('\n')[0]}</p>
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full border shrink-0 mt-0.5"
                            style={{ color: text3, borderColor: border, background: surface }}>{ex.category}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </main>
              )}

              {/* View 2: problem statement */}
              {selExercise && mobileExView === 'problem' && (
                <>
                  <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0"
                    style={{ borderColor: border, background: 'var(--header)' }}>
                    <button onClick={() => { setSelExercise(null); setMobileExView('list'); setGradeResult(null) }}
                      aria-label="Επιστροφή στη λίστα"
                      className="p-2 rounded-lg shrink-0" style={{ color: text3, background: surface2 }}>
                      {IC.back}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate" style={{ color: text }}>{selExercise.title}</div>
                      <div className="text-xs mt-0.5">
                        <span style={{ color: diffColor[selExercise.difficulty] || text3 }}>{selExercise.difficulty}</span>
                        <span style={{ color: text3 }}> · {selExercise.category}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: text3 }}>Εκφώνηση</p>
                    <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: text2 }}>{selExercise.description}</p>
                    <div className="mt-4 pt-4 border-t" style={{ borderColor: border }}>
                      <p className="text-xs" style={{ color: text3 }}>{selExercise.test_count} κρυφά test cases θα ελέγξουν τη λύση σου.</p>
                    </div>
                    {gradeResult && (
                      <div className="mt-4" role="region" aria-live="polite">
                        <div className={`text-sm font-bold mb-2 ${gradeResult.passed === gradeResult.total ? 'text-green-500' : 'text-amber-500'}`}>
                          {gradeResult.passed === gradeResult.total ? '🎉 Άριστα! Όλα σωστά!' : `${gradeResult.passed}/${gradeResult.total} tests πέρασαν`}
                        </div>
                        <div className="space-y-1">
                          {gradeResult.results.map((r, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs rounded-lg p-2"
                              style={{ background: r.passed ? '#15803d22' : '#b91c1c22' }}>
                              <span>{r.passed ? '✓' : '✗'}</span>
                              <div className="flex-1 min-w-0">
                                <span style={{ color: r.passed ? '#4ade80' : '#f87171' }}>Test {i + 1}</span>
                                {!r.passed && (
                                  <div className="mt-0.5 font-mono text-xs" style={{ color: text3 }}>
                                    <div>Έξοδος: <span style={{ color: '#f87171' }}>{r.output || '(κενό)'}</span></div>
                                    <div>Αναμ.: <span style={{ color: '#4ade80' }}>{r.expected}</span></div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-4 border-t shrink-0 flex flex-col gap-2" style={{ borderColor: border }}>
                    <button onClick={() => { setMobileExView('editor'); setTimeout(() => editorRef.current?.focus(), 100) }}
                      className="w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.99]"
                      style={{ background: '#2563eb', color: 'white' }}>
                      Κωδικοποίηση →
                    </button>
                    <button onClick={handleGrade} disabled={grading} aria-busy={grading}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold border transition-all"
                      style={{ borderColor: '#3b82f640', background: '#3b82f610', color: '#60a5fa', opacity: grading ? 0.7 : 1 }}>
                      {grading ? '⏳ Έλεγχος...' : '🧪 Έλεγχος Λύσης'}
                    </button>
                  </div>
                </>
              )}

              {/* View 3: editor */}
              {selExercise && mobileExView === 'editor' && (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0"
                    style={{ borderColor: border, background: 'var(--header)' }}>
                    <button onClick={() => setMobileExView('problem')}
                      aria-label="Επιστροφή στην εκφώνηση"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0"
                      style={{ color: text2, background: surface2 }}>
                      {IC.back}<span>Εκφώνηση</span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate" style={{ color: text3 }}>{selExercise.title}</div>
                    </div>
                  </div>
                  <EditorTerminalPanel
                    code={code} setCode={setCode}
                    running={running} done={done}
                    termLines={termLines} awaitInput={awaitInput}
                    inputVal={inputVal} setInputVal={setInputVal}
                    handleRun={handleRun} handleStop={handleStop}
                    submitInput={submitInput} copyCode={copyCode}
                    copied={copied} clearDecos={clearDecos}
                    editorRef={editorRef} monacoRef={monacoRef}
                    termEndRef={termEndRef} inputRef={inputRef}
                    decoRef={decoRef} handleEditorMount={handleEditorMount}
                    cursorPos={cursorPos}
                    editorFull={editorFull} setEditorFull={setEditorFull}
                    termFull={termFull} setTermFull={setTermFull}
                    splitDir={splitDir} splitRatio={splitRatio}
                    startDrag={startDrag} containerRef={containerRef}
                    dark={dark} hc={hc} bg={bg} surface={surface} surface2={surface2}
                    border={border} text={text} text2={text2} text3={text3}
                    fontSize={fontSize} setDone={setDone} setTermLines={setTermLines}
                    mobile={true} mobileTab={mobileTab} onMobileTabChange={setMobileTab}
                  />
                </>
              )}
            </div>

          ) : (
            /* ── DESKTOP EXERCISES ─────────────────────────────────────── */
            <>
              {!selExercise ? (
                /* Exercise list */
                <main className="flex flex-col w-full max-w-2xl mx-auto overflow-hidden p-6" aria-label="Λίστα ασκήσεων">
                  <h1 className="text-xl font-bold mb-1" style={{ color: text }}>Ασκήσεις ΓΛΩΣΣΑ</h1>
                  <p className="text-sm mb-4" style={{ color: text3 }}>Επίλεξε μια άσκηση, γράψε τον κώδικά σου και έλεγξε τη λύση σου αυτόματα.</p>
                  <div className="flex gap-2 flex-wrap mb-4" role="group" aria-label="Φίλτρο κατηγορίας">
                    {exCats.map(cat => (
                      <button key={cat} onClick={() => setExCat(cat)} aria-pressed={exCat === cat}
                        className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                        style={exCat === cat ? { background: '#3b82f6', color: 'white' } : { background: surface2, color: text2, border: `1px solid ${border}` }}>
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="overflow-y-auto flex-1 space-y-2" role="list" aria-label="Ασκήσεις">
                    {filteredExercises.map(ex => (
                      <button key={ex.id} onClick={() => loadExercise(ex)} role="listitem"
                        aria-label={`Άσκηση: ${ex.title}, δυσκολία ${ex.difficulty}, ${ex.test_count} test cases`}
                        className="w-full text-left p-4 rounded-xl border transition-all group"
                        style={{ background: surface2, borderColor: border }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold group-hover:text-blue-500 transition-colors" style={{ color: text }}>{ex.title}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                style={{ background: (diffColor[ex.difficulty] || '#64748b') + '22', color: diffColor[ex.difficulty] || '#64748b' }}>
                                {ex.difficulty}
                              </span>
                            </div>
                            <p className="text-xs leading-snug whitespace-pre-line" style={{ color: text3 }}>{ex.description.split('\n')[0]}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-xs px-2 py-0.5 rounded-full border" style={{ color: text3, borderColor: border, background: surface }}>{ex.category}</span>
                            <span className="text-xs" style={{ color: text3 }}>{ex.test_count} tests</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </main>
              ) : (
                /* Exercise solving view: description left + editor right */
                <div className="flex flex-1 overflow-hidden">
                  <aside className="w-80 shrink-0 flex flex-col border-r overflow-hidden"
                    style={{ borderColor: border, background: surface }} aria-label="Εκφώνηση άσκησης">
                    <div className="p-4 border-b flex items-center gap-2" style={{ borderColor: border }}>
                      <button onClick={() => { setSelExercise(null); setGradeResult(null) }}
                        aria-label="Επιστροφή στη λίστα ασκήσεων"
                        className="p-1.5 rounded-lg transition-all" style={{ color: text3, background: surface2 }}>
                        {IC.back}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate" style={{ color: text }}>{selExercise.title}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs" style={{ color: diffColor[selExercise.difficulty] || text3 }}>{selExercise.difficulty}</span>
                          <span className="text-xs" style={{ color: text3 }}>· {selExercise.category}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                      <h2 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: text3 }}>Εκφώνηση</h2>
                      <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: text2 }}>{selExercise.description}</p>
                      <div className="mt-4 pt-4 border-t" style={{ borderColor: border }}>
                        <p className="text-xs" style={{ color: text3 }}>{selExercise.test_count} κρυφά test cases θα ελέγξουν τη λύση σου.</p>
                      </div>
                    </div>
                    <div className="p-4 border-t" style={{ borderColor: border }}>
                      <button onClick={handleGrade} disabled={grading}
                        aria-label="Έλεγχος λύσης" aria-busy={grading}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all"
                        style={{ background: grading ? '#1d4ed8' : '#2563eb', color: 'white', opacity: grading ? 0.7 : 1 }}>
                        {grading
                          ? <><svg className="spinner w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>Έλεγχος...</>
                          : <>{IC.grade}Έλεγχος Λύσης</>}
                      </button>
                      {gradeResult && (
                        <div className="mt-3" role="region" aria-label="Αποτελέσματα βαθμολόγησης" aria-live="polite">
                          <div className={`text-sm font-bold mb-2 ${gradeResult.passed === gradeResult.total ? 'text-green-500' : 'text-amber-500'}`}>
                            {gradeResult.passed === gradeResult.total ? '🎉 Άριστα! Όλα σωστά!' : `${gradeResult.passed}/${gradeResult.total} test cases πέρασαν`}
                          </div>
                          <div className="space-y-1.5">
                            {gradeResult.results.map((r, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs rounded-lg p-2"
                                style={{ background: r.passed ? '#15803d22' : '#b91c1c22' }} role="listitem"
                                aria-label={`Test ${i + 1}: ${r.passed ? 'Πέρασε' : 'Απέτυχε'}`}>
                                <span aria-hidden="true">{r.passed ? '✓' : '✗'}</span>
                                <div className="flex-1 min-w-0">
                                  <span style={{ color: r.passed ? '#4ade80' : '#f87171' }}>Test {i + 1}</span>
                                  {!r.passed && (
                                    <div className="mt-1 space-y-0.5 font-mono text-xs" style={{ color: text3 }}>
                                      <div>Έξοδος: <span style={{ color: '#f87171' }}>{r.output || '(κενό)'}</span></div>
                                      <div>Αναμ.: <span style={{ color: '#4ade80' }}>{r.expected}</span></div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </aside>
                  <div className="flex flex-1 overflow-hidden flex-col">
                    <EditorTerminalPanel
                      code={code} setCode={setCode}
                      running={running} done={done}
                      termLines={termLines} awaitInput={awaitInput}
                      inputVal={inputVal} setInputVal={setInputVal}
                      handleRun={handleRun} handleStop={handleStop}
                      submitInput={submitInput} copyCode={copyCode}
                      copied={copied} clearDecos={clearDecos}
                      editorRef={editorRef} monacoRef={monacoRef}
                      termEndRef={termEndRef} inputRef={inputRef}
                      decoRef={decoRef} handleEditorMount={handleEditorMount}
                      cursorPos={cursorPos}
                      editorFull={editorFull} setEditorFull={setEditorFull}
                      termFull={termFull} setTermFull={setTermFull}
                      splitDir={splitDir} splitRatio={splitRatio}
                      startDrag={startDrag} containerRef={containerRef}
                      dark={dark} hc={hc} bg={bg} surface={surface} surface2={surface2}
                      border={border} text={text} text2={text2} text3={text3}
                      fontSize={fontSize} setDone={setDone} setTermLines={setTermLines}
                      mobile={false}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ══ EDITOR MODE ═══════════════════════════════════════════════ */}
      {mode === 'editor' && (
        <EditorTerminalPanel
          code={code} setCode={setCode}
          running={running} done={done}
          termLines={termLines} awaitInput={awaitInput}
          inputVal={inputVal} setInputVal={setInputVal}
          handleRun={handleRun} handleStop={handleStop}
          submitInput={submitInput} copyCode={copyCode}
          copied={copied} clearDecos={clearDecos}
          editorRef={editorRef} monacoRef={monacoRef}
          termEndRef={termEndRef} inputRef={inputRef}
          decoRef={decoRef} handleEditorMount={handleEditorMount}
          cursorPos={cursorPos}
          editorFull={editorFull} setEditorFull={setEditorFull}
          termFull={termFull} setTermFull={setTermFull}
          splitDir={splitDir} splitRatio={splitRatio}
          startDrag={startDrag} containerRef={containerRef}
          dark={dark} hc={hc} bg={bg} surface={surface} surface2={surface2}
          border={border} text={text} text2={text2} text3={text3}
          fontSize={fontSize} setDone={setDone} setTermLines={setTermLines}
          mobile={mobile} mobileTab={mobileTab} onMobileTabChange={setMobileTab}
        />
      )}

      {/* ══ STATUS BAR ════════════════════════════════════════════════ */}
      <div className="flex items-center gap-4 px-4 py-1 bg-blue-600 text-xs text-blue-100 shrink-0 select-none">
        <span className="font-mono" aria-label={`Γραμμή ${cursorPos.line}, στήλη ${cursorPos.col}`}>
          Γρ. {cursorPos.line} · Στ. {cursorPos.col}
        </span>
        <div className="flex-1" />
        <span className="hidden sm:inline opacity-60">ΓΛΩΣΣΑ · ΑΕΠΠ Ψευδοκώδικας</span>
        <div className="hidden sm:block flex-1" />
        <div className="hidden sm:flex items-center gap-1 opacity-80">
          <kbd className="px-1.5 py-0.5 bg-blue-500/50 rounded font-mono" aria-label="πλήκτρο εκτέλεσης">Ctrl+Enter</kbd>
          <span>Εκτέλεση</span>
        </div>
      </div>

      {/* ══ FOOTER ════════════════════════════════════════════════════ */}
      <footer role="contentinfo" className="flex items-center justify-center flex-wrap gap-x-3 gap-y-1 px-4 py-1.5 shrink-0 border-t"
        style={{ background: 'var(--header)', borderColor: border }}>
        {(['terms','privacy','cookies','credits','contact'] as const).map((key, i, arr) => (
          <span key={key} className="flex items-center gap-3">
            <button onClick={() => setFooterModal(key)}
              className="text-xs hover:underline underline-offset-2 transition-opacity hover:opacity-100"
              style={{ color: key === 'contact' ? '#60a5fa' : text3 }}>
              {{ terms: 'Όροι Χρήσης', privacy: 'Απόρρητο', cookies: 'Cookies', credits: 'Αναφορά', contact: 'Επικοινωνία' }[key]}
            </button>
            {i < arr.length - 1 && <span aria-hidden="true" className="text-xs" style={{ color: text3, opacity: 0.4 }}>·</span>}
          </span>
        ))}
        <span aria-hidden="true" className="text-xs" style={{ color: text3, opacity: 0.3 }}>·</span>
        <span className="text-xs" style={{ color: text3, opacity: 0.4 }}>© {new Date().getFullYear()} pseudocode.gr</span>
      </footer>

      {/* ══ FOOTER MODALS ═════════════════════════════════════════════ */}
      {footerModal && (
        <FooterModal
          which={footerModal}
          onClose={() => setFooterModal(null)}
          onSwitchTo={setFooterModal}
          surface={surface} surface2={surface2} border={border}
          text={text} text2={text2} text3={text3}
        />
      )}

      {/* ══ EXAMPLES MODAL ════════════════════════════════════════════ */}
      {showExamples && (
        <div role="dialog" aria-modal="true" aria-label="Παραδείγματα Προγραμμάτων"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowExamples(false)}>
          <div className="fade-in rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl border overflow-hidden"
            style={{ background: surface, borderColor: border }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: border }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: '#3b82f620', border: '1px solid #3b82f640', color: '#60a5fa' }} aria-hidden="true">
                {IC.book}
              </div>
              <div>
                <h2 className="text-sm font-bold" style={{ color: text }}>Παραδείγματα Προγραμμάτων</h2>
                <p className="text-xs" style={{ color: text3 }}>Κλίκαρε για να φορτώσεις</p>
              </div>
              <button onClick={() => setShowExamples(false)} aria-label="Κλείσιμο παραδειγμάτων"
                className="ml-auto p-1.5 rounded-lg transition-all" style={{ color: text3, background: surface2 }}>
                {IC.x}
              </button>
            </div>

            <div className="flex gap-1.5 px-5 py-3 border-b overflow-x-auto" style={{ borderColor: border }}
              role="group" aria-label="Κατηγορίες παραδειγμάτων">
              {cats.map(cat => (
                <button key={cat} onClick={() => setSelCat(cat)} aria-pressed={selCat === cat}
                  className="shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all"
                  style={selCat === cat
                    ? { background: '#3b82f6', color: 'white' }
                    : { background: surface2, color: text2, border: `1px solid ${border}` }
                  }>{cat}</button>
              ))}
            </div>

            <div className="overflow-y-auto flex-1 p-3 space-y-1.5" role="list">
              {filteredEx.map(ex => (
                <button key={ex.id} onClick={() => loadExample(ex)}
                  role="listitem"
                  aria-label={`Παράδειγμα: ${ex.title}`}
                  className="w-full text-left p-4 rounded-xl border transition-all group"
                  style={{ background: surface2, borderColor: border }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold transition-colors group-hover:text-blue-500" style={{ color: text }}>
                        {ex.title}
                      </div>
                      <div className="text-xs mt-0.5 leading-snug" style={{ color: text3 }}>{ex.description}</div>
                    </div>
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border" style={{ color: text3, borderColor: border, background: surface }}>
                      {ex.category}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   EditorTerminalPanel — shared between editor mode & exercise mode
═══════════════════════════════════════════════════════════════════════ */
interface PanelProps {
  code: string; setCode: (v: string) => void
  running: boolean; done: { success: boolean; error?: string; line?: number } | null
  termLines: TermLine[]; awaitInput: boolean
  inputVal: string; setInputVal: (v: string) => void
  handleRun: () => void; handleStop: () => void; submitInput: () => void
  copyCode: () => void; copied: boolean; clearDecos: () => void
  editorRef: React.MutableRefObject<Monaco.editor.IStandaloneCodeEditor | null>
  monacoRef: React.MutableRefObject<typeof Monaco | null>
  termEndRef: React.MutableRefObject<HTMLDivElement | null>
  inputRef: React.MutableRefObject<HTMLInputElement | null>
  decoRef: React.MutableRefObject<string[]>
  handleEditorMount: OnMount
  cursorPos: { line: number; col: number }
  editorFull: boolean; setEditorFull: (f: (v: boolean) => boolean) => void
  termFull: boolean; setTermFull: (f: (v: boolean) => boolean) => void
  splitDir: SplitDir; splitRatio: number
  startDrag: (e: React.MouseEvent) => void
  containerRef: React.MutableRefObject<HTMLDivElement | null>
  dark: boolean; hc: boolean
  bg: string; surface: string; surface2: string
  border: string; text: string; text2: string; text3: string
  fontSize: number
  setDone: (v: any) => void; setTermLines: (fn: any) => void
  mobile?: boolean
  mobileTab?: 'code' | 'terminal'
  onMobileTabChange?: (t: 'code' | 'terminal') => void
}

const IC2 = {
  play:   <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>,
  stop:   <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>,
  trash:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>,
  copy:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  check:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>,
  alert:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>,
  x:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  enter:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3 h-3" aria-hidden="true"><path d="M9 10l-5 5 5 5"/><path d="M20 4v7a4 4 0 01-4 4H4"/></svg>,
  expand: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>,
}

function EditorTerminalPanel(p: PanelProps) {
  const editorStyle = p.editorFull
    ? { flex: '1 1 100%' }
    : p.termFull
      ? { flex: '0 0 0', overflow: 'hidden' }
      : { flex: `0 0 ${p.splitRatio * 100}%` }

  const termStyle = p.termFull
    ? { flex: '1 1 100%' }
    : p.editorFull
      ? { flex: '0 0 0', overflow: 'hidden' }
      : { flex: '1 1 0' }

  // Auto-switch to terminal on mobile when running or awaiting input
  useEffect(() => {
    if (p.mobile && p.running) p.onMobileTabChange?.('terminal')
  }, [p.running, p.mobile])
  useEffect(() => {
    if (p.mobile && p.awaitInput) p.onMobileTabChange?.('terminal')
  }, [p.awaitInput, p.mobile])

  // Mobile: section visibility
  const showEditor   = !p.mobile || p.mobileTab === 'code'
  const showTerminal = !p.mobile || p.mobileTab === 'terminal'

  return (
    <div ref={p.containerRef}
      className={`flex flex-1 overflow-hidden ${p.mobile ? 'flex-col' : p.splitDir === 'v' ? 'flex-col' : 'flex-row'}`}>

      {/* ── EDITOR PANEL ─────────────────────────────────────────── */}
      <section className="flex flex-col overflow-hidden border-r"
        style={{ ...(p.mobile ? (showEditor ? { flex: '1 1 100%' } : { display: 'none' }) : editorStyle), borderColor: p.border }}
        aria-label="Επεξεργαστής κώδικα">

        {/* Editor toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 shrink-0 border-b"
          style={{ background: 'var(--header)', borderColor: p.border }}>

          {/* File tab */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border"
            style={{ background: '#3b82f610', borderColor: '#3b82f640' }}>
            {/* GLS file icon */}
            <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
              <rect x="2" y="1" width="9" height="13" rx="1.5" fill="#1e40af" opacity="0.7"/>
              <rect x="5" y="1" width="6" height="13" rx="1.5" fill="#3b82f6" opacity="0.5"/>
              <path d="M9 1v3.5h3.5" stroke="#60a5fa" strokeWidth="1" strokeLinecap="round"/>
              <rect x="9" y="1" width="3.5" height="3.5" rx="0.5" fill="#2563eb" opacity="0.8"/>
              <text x="4.2" y="11.5" fontSize="4" fontWeight="bold" fill="#93c5fd" fontFamily="monospace">GLS</text>
            </svg>
            <span className="text-xs font-mono" style={{ color: '#60a5fa' }}>κώδικας.gls</span>
            <span className="text-xs px-1 py-0.5 rounded" style={{ background: '#3b82f620', color: '#60a5fa80', fontSize: '9px', fontFamily: 'monospace' }}>ΑΕΠΠ</span>
          </div>

          <div className="flex-1" />
          <button onClick={() => { p.setEditorFull(f => !f); p.setTermFull(() => false) }}
            title={p.editorFull ? 'Επαναφορά' : 'Μεγιστοποίηση επεξεργαστή'}
            aria-label={p.editorFull ? 'Επαναφορά επεξεργαστή' : 'Μεγιστοποίηση επεξεργαστή'}
            aria-pressed={p.editorFull}
            className="p-1.5 rounded-lg transition-all"
            style={{ color: p.editorFull ? '#3b82f6' : p.text3, background: p.editorFull ? '#3b82f620' : 'transparent' }}>
            {IC2.expand}
          </button>
          <button onClick={() => { p.setCode(''); p.clearDecos(); p.editorRef.current?.focus() }}
            title="Καθαρισμός" aria-label="Καθαρισμός κώδικα"
            className="p-1.5 rounded-lg transition-all" style={{ color: p.text3 }}>
            {IC2.trash}
          </button>
          <button onClick={p.copyCode} title="Αντιγραφή" aria-label="Αντιγραφή κώδικα"
            className="p-1.5 rounded-lg transition-all"
            style={{ color: p.copied ? '#22c55e' : p.text3 }}>
            {p.copied ? IC2.check : IC2.copy}
          </button>
          <div className="w-px h-5 mx-1" style={{ background: p.border }} aria-hidden="true" />
          {p.running ? (
            <button onClick={p.handleStop} aria-label="Διακοπή εκτέλεσης"
              className="flex items-center gap-2 px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition-all shadow-lg shadow-red-900/30">
              {IC2.stop}<span>Διακοπή</span>
            </button>
          ) : (
            <button onClick={p.handleRun} aria-label="Εκτέλεση κώδικα (Ctrl+Enter)"
              className="btn-run flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-all shadow-lg shadow-blue-900/30">
              {IC2.play}<span>Εκτέλεση</span>
              <kbd className="ml-1 text-xs font-mono bg-blue-500/50 px-1.5 py-0.5 rounded text-blue-200 hidden sm:inline" aria-hidden="true">⌃↵</kbd>
            </button>
          )}
        </div>

        {/* Monaco editor */}
        <div className="flex-1 overflow-hidden select-text" role="region" aria-label="Κώδικας ΓΛΩΣΣΑ">
          <Editor
            height="100%"
            defaultLanguage={LANGUAGE_ID}
            value={p.code}
            onChange={v => p.setCode(v || '')}
            onMount={p.handleEditorMount}
            options={{
              fontSize: p.fontSize,
              fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code',monospace",
              fontLigatures: true,
              lineNumbers: 'on',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 14, bottom: 14 },
              suggest: { showSnippets: true },
              quickSuggestions: { other: true, comments: false, strings: false },
              bracketPairColorization: { enabled: true },
              renderLineHighlight: 'line',
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              tabSize: 2,
              glyphMargin: false,
              lineNumbersMinChars: 3,
              occurrencesHighlight: 'off',
              selectionHighlight: false,
              unicodeHighlight: {
                ambiguousCharacters: false,
                invisibleCharacters: false,
                nonBasicASCII: false,
              },
              accessibilitySupport: 'on',
              ariaLabel: 'Επεξεργαστής κώδικα ΓΛΩΣΣΑ',
            }}
          />
        </div>
      </section>

      {/* ── DRAG HANDLE ──────────────────────────────────────────── */}
      {!p.mobile && !p.editorFull && !p.termFull && (
        <div onMouseDown={p.startDrag}
          className={p.splitDir === 'h' ? 'drag-handle' : 'drag-handle-v'}
          role="separator" aria-orientation={p.splitDir === 'h' ? 'vertical' : 'horizontal'}
          aria-label="Αλλαγή μεγέθους πάνελ"
          style={{
            background: p.border,
            width:  p.splitDir === 'h' ? '5px' : '100%',
            height: p.splitDir === 'h' ? '100%' : '5px',
            flexShrink: 0,
            transition: 'background .15s',
          }}
        />
      )}

      {/* ── TERMINAL PANEL ────────────────────────────────────────── */}
      <section className="flex flex-col overflow-hidden"
        style={{ ...(p.mobile ? (showTerminal ? { flex: '1 1 100%' } : { display: 'none' }) : termStyle), background: 'var(--terminal)', borderColor: p.border }}
        aria-label="Τερματικό εξόδου">

        {/* Terminal header */}
        <div className="flex items-center gap-2 px-3 py-2 shrink-0 border-b"
          style={{ background: 'var(--header)', borderColor: p.border }}>
          <div className={`w-2 h-2 rounded-full transition-all ${
            p.running        ? 'bg-yellow-400 shadow-sm shadow-yellow-400/60' :
            !p.done          ? '' :
            p.done.success   ? 'bg-green-400 shadow-sm shadow-green-400/50' :
                               'bg-red-400 shadow-sm shadow-red-400/50'
          }`} style={{ background: !p.running && !p.done ? p.border : undefined }} aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: p.text3 }}>Τερματικό</span>
          {p.running && (
            <span className="flex items-center gap-1 text-xs text-yellow-500" role="status" aria-live="polite">
              <svg className="spinner w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              Εκτέλεση...
            </span>
          )}
          {!p.running && p.done && (
            <span className={`text-xs font-medium ${p.done.success ? 'text-green-500' : 'text-red-500'}`}
              role="status" aria-live="polite">
              {p.done.success ? '✓ Επιτυχία' : '✗ Σφάλμα'}
            </span>
          )}
          {p.awaitInput && (
            <span className="text-xs text-blue-400 animate-pulse" role="status" aria-live="assertive">● Αναμένει είσοδο</span>
          )}
          <div className="flex-1" />
          <button onClick={() => { p.setTermFull(f => !f); p.setEditorFull(() => false) }}
            title={p.termFull ? 'Επαναφορά' : 'Μεγιστοποίηση τερματικού'}
            aria-label={p.termFull ? 'Επαναφορά τερματικού' : 'Μεγιστοποίηση τερματικού'}
            aria-pressed={p.termFull}
            className="p-1 rounded transition-all"
            style={{ color: p.termFull ? '#3b82f6' : p.text3, background: p.termFull ? '#3b82f620' : 'transparent' }}>
            {IC2.expand}
          </button>
          {p.termLines.length > 0 && !p.running && (
            <button onClick={() => { p.setTermLines([]); p.setDone(null); p.clearDecos() }}
              title="Καθαρισμός τερματικού" aria-label="Καθαρισμός τερματικού"
              className="p-1 rounded transition-all" style={{ color: p.text3 }}>
              {IC2.x}
            </button>
          )}
        </div>

        {/* Terminal body */}
        <div className="flex-1 overflow-auto p-4 select-text text-sm leading-relaxed"
          role="log" aria-label="Έξοδος προγράμματος" aria-live="polite"
          style={{ fontFamily: "'JetBrains Mono',monospace", color: p.text }}>

          {p.termLines.length === 0 && !p.running && !p.done && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4 fade-in" aria-hidden="false">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: p.surface2, border: `1px solid ${p.border}` }} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" className="w-8 h-8" style={{ stroke: p.border }}>
                  <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 9l3 3-3 3M13 15h4"/>
                </svg>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium" style={{ color: p.text2 }}>Έτοιμο για εκτέλεση</p>
                <p className="text-xs" style={{ color: p.text3 }}>Γράψε τον κώδικά σου αριστερά</p>
                <div className="flex items-center justify-center gap-1 mt-2 px-2.5 py-1.5 rounded-lg border text-xs font-mono"
                  style={{ background: p.surface2, borderColor: p.border, color: p.text2 }}>
                  <span>Ctrl</span><span style={{ color: p.text3 }}>+</span>{IC2.enter}<span>Enter</span>
                  <span style={{ color: p.text3 }}>για Εκτέλεση</span>
                </div>
              </div>
            </div>
          )}

          {p.termLines.map((line, i) => {
            if (line.kind === 'out')
              return <div key={i} className="fade-in whitespace-pre-wrap break-words py-px" style={{ color: p.text }}>{line.text}</div>
            if (line.kind === 'echo')
              return (
                <div key={i} className="fade-in flex items-center gap-1.5 py-px">
                  <span aria-hidden="true" style={{ color: '#3b82f6' }}>▶</span>
                  <span style={{ color: '#60a5fa' }}>{line.text}</span>
                </div>
              )
            if (line.kind === 'err')
              return <div key={i} className="fade-in py-px" role="alert" style={{ color: '#f87171' }}>{line.text}</div>
            if (line.kind === 'info')
              return <div key={i} className="fade-in italic py-px" style={{ color: p.text3 }}>{line.text}</div>
            return null
          })}

          {p.awaitInput && (
            <div className="fade-in flex items-center gap-2 mt-1 py-1.5 px-3 rounded-lg border-l-2"
              style={{ background: p.dark ? '#1e3a5f22' : '#eff6ff', borderColor: '#3b82f6' }}
              role="group" aria-label="Εισαγωγή δεδομένων">
              <span className="text-blue-500 select-none text-sm" aria-hidden="true">▶</span>
              <input ref={p.inputRef} type="text"
                value={p.inputVal}
                onChange={e => p.setInputVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') p.submitInput() }}
                className="flex-1 bg-transparent outline-none text-sm placeholder:opacity-40"
                style={{ color: '#60a5fa', fontFamily: 'inherit', fontSize: p.fontSize }}
                placeholder="Γράψε την τιμή σου..."
                autoComplete="off" spellCheck={false}
                aria-label="Εισαγωγή τιμής για το πρόγραμμα"
              />
              <button onClick={p.submitInput} aria-label="Αποστολή τιμής"
                className="flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded border transition-all"
                style={{ background: '#3b82f620', borderColor: '#3b82f640', color: '#60a5fa' }}>
                {IC2.enter} Enter
              </button>
            </div>
          )}

          {p.running && p.termLines.length === 0 && (
            <div className="flex items-center gap-2 text-sm mt-2 fade-in" style={{ color: p.text3 }} role="status">
              <svg className="spinner w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              Εκκίνηση προγράμματος...
            </div>
          )}

          {!p.running && p.done && !p.done.success && (
            <div className="fade-in mt-3 rounded-xl p-3.5 border" role="alert"
              style={{ background: p.dark ? '#450a0a30' : '#fef2f2', borderColor: p.dark ? '#7f1d1d60' : '#fecaca' }}>
              <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5" style={{ color: '#f87171' }}>
                {IC2.alert}
                {p.done.line ? `Σφάλμα στη γραμμή ${p.done.line}` : 'Σφάλμα εκτέλεσης'}
              </div>
              <p className="text-sm leading-snug" style={{ color: p.dark ? '#fca5a5' : '#b91c1c' }}>{p.done.error}</p>
              {p.done.line && (
                <button
                  onClick={() => {
                    const line = p.done!.line!
                    // On mobile, switch to code tab first
                    p.onMobileTabChange?.('code')
                    setTimeout(() => {
                      const ed = p.editorRef.current
                      if (!ed) return
                      ed.revealLineInCenter(line)
                      ed.setPosition({ lineNumber: line, column: 1 })
                      ed.focus()
                    }, p.mobile ? 80 : 0)
                  }}
                  className="mt-2 flex items-center gap-1 text-xs underline underline-offset-2 transition-colors"
                  style={{ color: '#f87171' }}
                  aria-label={`Μετάβαση στη γραμμή ${p.done.line}`}>
                  Μετάβαση στη γραμμή {p.done.line} →
                </button>
              )}
            </div>
          )}

          {!p.running && p.done?.success && (
            <div className="fade-in mt-2 flex items-center gap-1.5 text-xs font-medium" style={{ color: '#4ade80' }} role="status">
              {IC2.check} Εκτελέστηκε επιτυχώς
            </div>
          )}

          <div ref={p.termEndRef} />
        </div>

        {/* Quick reference (desktop only) */}
        {!p.mobile && (
          <QuickRef dark={p.dark} border={p.border} surface={p.surface} surface2={p.surface2}
            text={p.text} text2={p.text2} text3={p.text3} />
        )}
      </section>

      {/* ── MOBILE BOTTOM TAB BAR ────────────────────────────────── */}
      {p.mobile && (
        <div className="flex items-center shrink-0 border-t"
          style={{ background: 'var(--header)', borderColor: p.border }}>
          {/* Code tab */}
          <button
            onClick={() => p.onMobileTabChange?.('code')}
            aria-pressed={p.mobileTab === 'code'}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 transition-all"
            style={{ color: p.mobileTab === 'code' ? '#3b82f6' : p.text3 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5" aria-hidden="true">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            <span className="text-xs font-medium">Κώδικας</span>
          </button>

          {/* Run / Stop button in center */}
          {p.running ? (
            <button onClick={p.handleStop}
              className="flex flex-col items-center justify-center gap-0.5 py-2.5 px-5 transition-all"
              style={{ color: '#f87171' }} aria-label="Διακοπή εκτέλεσης">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>
              <span className="text-xs font-medium">Διακοπή</span>
            </button>
          ) : (
            <button onClick={p.handleRun}
              className="flex flex-col items-center justify-center gap-0.5 py-2.5 px-5 transition-all"
              style={{ color: '#3b82f6' }} aria-label="Εκτέλεση κώδικα">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
              <span className="text-xs font-medium">Εκτέλεση</span>
            </button>
          )}

          {/* Terminal tab */}
          <button
            onClick={() => p.onMobileTabChange?.('terminal')}
            aria-pressed={p.mobileTab === 'terminal'}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 transition-all relative"
            style={{ color: p.mobileTab === 'terminal' ? '#3b82f6' : p.text3 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5" aria-hidden="true">
              <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 9l3 3-3 3M13 15h4"/>
            </svg>
            <span className="text-xs font-medium">Τερματικό</span>
            {/* Running indicator dot */}
            {p.running && (
              <span className="absolute top-2 right-5 w-2 h-2 rounded-full bg-yellow-400" aria-hidden="true" />
            )}
            {/* Await input indicator */}
            {p.awaitInput && (
              <span className="absolute top-2 right-5 w-2 h-2 rounded-full bg-blue-400 animate-pulse" aria-hidden="true" />
            )}
          </button>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   FooterModal — Terms / Privacy / Cookies / Credits / Contact
═══════════════════════════════════════════════════════════════════════ */
const PORTFOLIO = 'https://nikoslefakis.vercel.app'

interface FooterModalProps {
  which: 'terms' | 'privacy' | 'cookies' | 'credits' | 'contact'
  onClose: () => void
  onSwitchTo: (m: FooterModalProps['which']) => void
  surface: string; surface2: string; border: string
  text: string; text2: string; text3: string
}

const FOOTER_CONTENT: Record<Exclude<FooterModalProps['which'], 'contact' | 'credits'>, { title: string; body: JSX.Element }> = {
  terms: {
    title: 'Όροι Χρήσης',
    body: (
      <div className="space-y-4 text-sm leading-relaxed">
        <p>Η πλατφόρμα <strong>ΓΛΩΣΣΑ Online</strong> είναι ένα δωρεάν εκπαιδευτικό εργαλείο που απευθύνεται σε μαθητές Λυκείου και υποψηφίους Πανελληνίων Εξετάσεων που επιθυμούν να εξασκηθούν στον ψευδοκώδικα της ΑΕΠΠ.</p>
        <h3 className="font-semibold text-sm">1. Αποδοχή Όρων</h3>
        <p>Η χρήση της πλατφόρμας συνεπάγεται την πλήρη αποδοχή των παρόντων Όρων Χρήσης. Εάν δεν συμφωνείτε, παρακαλούμε να απέχετε από τη χρήση της.</p>
        <h3 className="font-semibold text-sm">2. Εκπαιδευτικός Σκοπός</h3>
        <p>Η πλατφόρμα προορίζεται αποκλειστικά για εκπαιδευτικούς σκοπούς. Ο κώδικας που εκτελείται τρέχει σε απομονωμένο περιβάλλον (sandbox) και δεν αποθηκεύεται μόνιμα.</p>
        <h3 className="font-semibold text-sm">3. Αποποίηση Ευθύνης</h3>
        <p>Η πλατφόρμα παρέχεται «ως έχει» χωρίς καμία εγγύηση ακρίβειας ή αδιάλειπτης λειτουργίας. Ο δημιουργός δεν φέρει ευθύνη για τυχόν λάθη στα αποτελέσματα εκτέλεσης ή αξιολόγησης.</p>
        <h3 className="font-semibold text-sm">4. Πνευματική Ιδιοκτησία</h3>
        <p>Το σύνολο του λογισμικού, της σχεδίασης και του περιεχομένου αποτελεί πνευματική ιδιοκτησία του δημιουργού. Απαγορεύεται η αναπαραγωγή ή εμπορική εκμετάλλευση χωρίς γραπτή άδεια.</p>
        <h3 className="font-semibold text-sm">5. Τροποποίηση Όρων</h3>
        <p>Ο δημιουργός διατηρεί το δικαίωμα τροποποίησης των παρόντων όρων. Η συνέχιση χρήσης της πλατφόρμας μετά από τροποποίηση συνεπάγεται αποδοχή των νέων όρων.</p>
      </div>
    ),
  },
  privacy: {
    title: 'Πολιτική Απορρήτου',
    body: (
      <div className="space-y-4 text-sm leading-relaxed">
        <p>Η προστασία των προσωπικών σας δεδομένων αποτελεί προτεραιότητα. Η παρούσα Πολιτική Απορρήτου περιγράφει ποιες πληροφορίες συλλέγονται και πώς χρησιμοποιούνται, σε συμμόρφωση με τον <strong>Γενικό Κανονισμό Προστασίας Δεδομένων (GDPR — Κανονισμός ΕΕ 2016/679)</strong>.</p>
        <h3 className="font-semibold text-sm">1. Δεδομένα που συλλέγονται</h3>
        <p>Η πλατφόρμα <strong>δεν συλλέγει</strong> προσωπικά δεδομένα (ονόματα, e-mail, διευθύνσεις IP ή cookies τρίτων). Δεν απαιτείται εγγραφή ή σύνδεση.</p>
        <h3 className="font-semibold text-sm">2. Κώδικας & Εκτέλεση</h3>
        <p>Ο κώδικας που υποβάλλεται για εκτέλεση ή αξιολόγηση επεξεργάζεται στιγμιαία στον διακομιστή και <strong>δεν αποθηκεύεται</strong> σε βάση δεδομένων ούτε κοινοποιείται σε τρίτους.</p>
        <h3 className="font-semibold text-sm">3. Τεχνικά Δεδομένα</h3>
        <p>Ενδέχεται να καταγράφονται ανώνυμα τεχνικά δεδομένα (π.χ. τύπος προγράμματος περιήγησης) αποκλειστικά για τη διασφάλιση της σωστής λειτουργίας της υπηρεσίας.</p>
        <h3 className="font-semibold text-sm">4. Δικαιώματά σας</h3>
        <p>Βάσει GDPR έχετε δικαίωμα πρόσβασης, διόρθωσης και διαγραφής δεδομένων. Δεδομένου ότι δεν αποθηκεύουμε προσωπικά δεδομένα, τα δικαιώματα αυτά ικανοποιούνται εκ προοιμίου.</p>
        <h3 className="font-semibold text-sm">5. Επικοινωνία</h3>
        <p>Για ερωτήματα σχετικά με το απόρρητο επικοινωνήστε με τον υπεύθυνο επεξεργασίας: <strong><a href={PORTFOLIO} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>Νίκος Λεφάκης</a></strong>.</p>
      </div>
    ),
  },
  cookies: {
    title: 'Πολιτική Cookies',
    body: (
      <div className="space-y-4 text-sm leading-relaxed">
        <p>Η παρούσα πολιτική εξηγεί τη χρήση cookies στην πλατφόρμα <strong>ΓΛΩΣΣΑ Online</strong>, σύμφωνα με την Οδηγία 2009/136/ΕΚ (ePrivacy) και τον GDPR.</p>
        <h3 className="font-semibold text-sm">1. Τι είναι τα Cookies</h3>
        <p>Τα cookies είναι μικρά αρχεία κειμένου που αποθηκεύονται στη συσκευή σας από το πρόγραμμα περιήγησης κατά την επίσκεψή σας σε έναν ιστότοπο.</p>
        <h3 className="font-semibold text-sm">2. Cookies που χρησιμοποιούμε</h3>
        <p>Χρησιμοποιούμε <strong>αποκλειστικά τεχνικά/λειτουργικά cookies</strong> που είναι απολύτως απαραίτητα για τη σωστή λειτουργία της πλατφόρμας (π.χ. αποθήκευση θέματος εμφάνισης, μεγέθους γραμματοσειράς). Αυτά τα cookies <strong>δεν απαιτούν τη συγκατάθεσή σας</strong> βάσει νόμου.</p>
        <h3 className="font-semibold text-sm">3. Cookies Τρίτων</h3>
        <p>Η πλατφόρμα <strong>δεν χρησιμοποιεί</strong> cookies τρίτων, cookies διαφήμισης, cookies ανάλυσης συμπεριφοράς (analytics) ή cookies κοινωνικών δικτύων.</p>
        <h3 className="font-semibold text-sm">4. Διαχείριση Cookies</h3>
        <p>Μπορείτε να διαγράψετε ή να απενεργοποιήσετε τα cookies μέσω των ρυθμίσεων του προγράμματος περιήγησής σας. Ωστόσο, αυτό ενδέχεται να επηρεάσει ορισμένες λειτουργίες της πλατφόρμας.</p>
      </div>
    ),
  },
}

function ContactForm({ onClose, surface2, border, text, text2, text3 }: Omit<FooterModalProps, 'which'|'onSwitchTo'> & { surface2: string }) {
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [msg, setMsg]         = useState('')
  const [status, setStatus]   = useState<'idle'|'sending'|'ok'|'err'>('idle')

  const send = async () => {
    if (!name.trim() || !msg.trim()) return
    setStatus('sending')
    try {
      const r = await fetch(`${API}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message: msg }),
      })
      setStatus(r.ok ? 'ok' : 'err')
    } catch { setStatus('err') }
  }

  if (status === 'ok') return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#22c55e20', color: '#4ade80' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-6 h-6" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
      </div>
      <p className="font-semibold" style={{ color: text }}>Το μήνυμά σου στάλθηκε!</p>
      <p className="text-sm" style={{ color: text3 }}>Θα επικοινωνήσω μαζί σου σύντομα.</p>
      <button onClick={onClose} className="mt-2 px-5 py-2 rounded-lg text-sm font-medium" style={{ background: '#3b82f6', color: '#fff' }}>Κλείσιμο</button>
    </div>
  )

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: text3 }}>Όνομα *</label>
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="Το όνομά σου"
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-all"
          style={{ background: surface2, borderColor: border, color: text }}
          onFocus={e => (e.target.style.borderColor = '#3b82f6')}
          onBlur={e => (e.target.style.borderColor = border)}
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: text3 }}>Email <span className="opacity-50">(προαιρετικό)</span></label>
        <input value={email} onChange={e => setEmail(e.target.value)}
          type="email" placeholder="email@example.com"
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-all"
          style={{ background: surface2, borderColor: border, color: text }}
          onFocus={e => (e.target.style.borderColor = '#3b82f6')}
          onBlur={e => (e.target.style.borderColor = border)}
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: text3 }}>Μήνυμα *</label>
        <textarea value={msg} onChange={e => setMsg(e.target.value)}
          rows={4} placeholder="Γράψε το μήνυμά σου..."
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-all resize-none"
          style={{ background: surface2, borderColor: border, color: text, fontFamily: 'inherit' }}
          onFocus={e => (e.target.style.borderColor = '#3b82f6')}
          onBlur={e => (e.target.style.borderColor = border)}
        />
      </div>
      {status === 'err' && (
        <p className="text-xs" style={{ color: '#f87171' }}>Κάτι πήγε στραβά. Δοκίμασε ξανά.</p>
      )}
      <div className="flex items-center justify-between pt-1">
        <p className="text-xs" style={{ color: text3 }}>
          Ή επικοινώνησε μέσω{' '}
          <a href={PORTFOLIO} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>portfolio</a>
        </p>
        <button onClick={send} disabled={status === 'sending' || !name.trim() || !msg.trim()}
          className="px-5 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40"
          style={{ background: '#3b82f6', color: '#fff' }}>
          {status === 'sending' ? 'Αποστολή…' : 'Αποστολή'}
        </button>
      </div>
    </div>
  )
}

function CreditsBody({ onReport, surface2, border, text, text3 }: {
  onReport: () => void
  surface2: string; border: string; text: string; text3: string
}) {
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      {/* Creator card */}
      <a href={PORTFOLIO} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-3 p-3 rounded-xl border transition-opacity hover:opacity-80"
        style={{ borderColor: '#3b82f640', background: '#3b82f610', textDecoration: 'none' }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shrink-0" style={{ background: '#3b82f630', color: '#60a5fa' }}>Ν</div>
        <div className="flex-1">
          <div className="font-semibold" style={{ color: '#93c5fd' }}>Νίκος Λεφάκης</div>
          <div className="text-xs opacity-70">Δημιουργός & Προγραμματιστής</div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" className="w-4 h-4 opacity-60" aria-hidden="true">
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
        </svg>
      </a>

      <p style={{ color: text3 }}>Η πλατφόρμα <strong style={{ color: text }}>pseudocode.gr</strong> αναπτύχθηκε εθελοντικά για κάθε μαθητή που προετοιμάζεται για τις Πανελλήνιες ΑΕΠΠ — δωρεάν, χωρίς διαφημίσεις.</p>

      <a href={PORTFOLIO} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm transition-opacity hover:opacity-80"
        style={{ color: '#60a5fa' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/>
        </svg>
        nikoslefakis.vercel.app
      </a>

      {/* Report bug section */}
      <div className="rounded-xl border p-3" style={{ borderColor: border, background: surface2 }}>
        <div className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-2" style={{ color: text }}>Αναφορά Τεχνικού Προβλήματος</div>
        <p className="text-xs mb-3" style={{ color: text3 }}>Εντόπισες κάποιο σφάλμα ή έχεις πρόταση βελτίωσης; Στείλε μήνυμα και θα το εξετάσω άμεσα.</p>
        <button onClick={onReport}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: '#3b82f620', color: '#60a5fa', border: '1px solid #3b82f640' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Αναφορά Προβλήματος
        </button>
      </div>

      <p className="text-xs opacity-30 pt-1">© {new Date().getFullYear()} pseudocode.gr</p>
    </div>
  )
}

function FooterModal({ which, onClose, onSwitchTo, surface, surface2, border, text, text2, text3 }: FooterModalProps) {
  const isContact = which === 'contact'
  const isCredits = which === 'credits'
  const content   = (!isContact && !isCredits) ? FOOTER_CONTENT[which as Exclude<typeof which, 'contact'|'credits'>] : null
  const title     = isContact ? 'Επικοινωνία' : isCredits ? 'Αναφορά' : content!.title

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      role="dialog" aria-modal="true" aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="fade-in rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl border overflow-hidden"
        style={{ background: surface, borderColor: border }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: border, background: surface2 }}>
          <h2 className="text-sm font-bold" style={{ color: text }}>{title}</h2>
          <button onClick={onClose} aria-label="Κλείσιμο"
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-opacity hover:opacity-70"
            style={{ background: border + '40', color: text3 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4" style={{ color: text2 }}>
          {isContact
            ? <ContactForm onClose={onClose} surface={surface} surface2={surface2} border={border} text={text} text2={text2} text3={text3} />
            : isCredits
              ? <CreditsBody onReport={() => onSwitchTo('contact')} surface2={surface2} border={border} text={text} text3={text3} />
              : content!.body
          }
        </div>

        {/* Footer (only for non-contact modals) */}
        {!isContact && (
          <div className="px-5 py-3 border-t shrink-0 flex justify-end" style={{ borderColor: border, background: surface2 }}>
            <button onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
              style={{ background: '#3b82f6', color: '#fff' }}>
              Κατανοώ
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Quick Reference ──────────────────────────────────────────────────────── */
function QuickRef({ dark, border, surface, surface2, text, text2, text3 }: {
  dark: boolean; border: string; surface: string; surface2: string
  text: string; text2: string; text3: string
}) {
  const [open, setOpen] = useState(false)

  const sections = [
    { title: 'Εντολές', items: [
      { l: 'Ανάθεση',  c: 'x ← τιμή' },
      { l: 'Εισαγωγή', c: 'ΔΙΑΒΑΣΕ x, y' },
      { l: 'Εκτύπωση', c: "ΓΡΑΨΕ 'κείμενο', x" },
    ]},
    { title: 'Αποφάσεις', items: [
      { l: 'ΑΝ-ΤΟΤΕ',   c: 'ΑΝ x>0 ΤΟΤΕ … ΤΕΛΟΣ_ΑΝ' },
      { l: 'ΑΝ-ΑΛΛΙΩΣ', c: '… ΑΛΛΙΩΣ … ΤΕΛΟΣ_ΑΝ' },
    ]},
    { title: 'Επαναλήψεις', items: [
      { l: 'ΓΙΑ',      c: 'ΓΙΑ i ΑΠΟ 1 ΜΕΧΡΙ n' },
      { l: 'ΟΣΟ',      c: 'ΟΣΟ συνθήκη ΕΠΑΝΑΛΑΒΕ' },
      { l: 'ΑΡΧΗ_ΕΠ.', c: 'ΑΡΧΗ_ΕΠΑΝΑΛΗΨΗΣ … ΜΕΧΡΙΣ_ΟΤΟΥ' },
    ]},
    { title: 'Τελεστές', items: [
      { l: 'Ακέρ. διαίρ.', c: '7 DIV 2 → 3' },
      { l: 'Υπόλοιπο',     c: '7 MOD 2 → 1' },
      { l: 'Σύνδεση',      c: "'α' & 'β' → 'αβ'" },
    ]},
  ]

  return (
    <div className="shrink-0 border-t" style={{ borderColor: border, background: 'var(--header)' }}>
      <button onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls="quickref-body"
        className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-medium transition-colors"
        style={{ color: text3 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden="true">
          {open ? <path d="M6 9l6 6 6-6"/> : <path d="M9 18l6-6-6-6"/>}
        </svg>
        <span style={{ color: text2 }}>Γρήγορη Αναφορά ΓΛΩΣΣΑ</span>
        <span className="ml-auto" style={{ color: text3 }}>ΑΕΠΠ</span>
      </button>

      {open && (
        <div id="quickref-body" className="px-4 pb-4 space-y-3 text-xs fade-in border-t" style={{ borderColor: border }}>
          <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sections.map(sec => (
              <div key={sec.title}>
                <div className="font-semibold uppercase tracking-wider text-xs mb-1.5" style={{ color: text3 }}>
                  {sec.title}
                </div>
                <div className="space-y-1">
                  {sec.items.map(it => (
                    <div key={it.l} className="flex flex-col gap-0.5">
                      <span className="text-xs" style={{ color: text3 }}>{it.l}</span>
                      <code className="text-xs font-mono" style={{ color: '#60a5fa' }}>{it.c}</code>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
