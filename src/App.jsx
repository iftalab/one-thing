import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

function formatDate() {
  const d = new Date()
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

const LINK_RE = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,:;!?)\]'"])|([\w.+-]+@[\w-]+\.[\w.-]+)/gi

function Linkify({ text }) {
  if (!text) return null
  const parts = []
  let last = 0
  let m
  LINK_RE.lastIndex = 0
  while ((m = LINK_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const [match, url, email] = m
    if (email) {
      parts.push(<a key={m.index} href={`mailto:${email}`}>{email}</a>)
    } else {
      const href = url.startsWith('http') ? url : `https://${url}`
      parts.push(<a key={m.index} href={href} target="_blank" rel="noopener noreferrer">{url}</a>)
    }
    last = m.index + match.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

export default function App() {
  const [tasks,   setTasks]   = useState([])
  const [ctx,     setCtx]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [fadeIn,  setFadeIn]  = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchAll()
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, fetchTasks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'context' }, fetchCtx)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === '?') { e.preventDefault(); setShowHelp(s => !s) }
      else if (e.key === 'Escape') setShowHelp(false)
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); manualRefresh() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function manualRefresh() {
    setRefreshing(true)
    await Promise.all([fetchTasks(), fetchCtx()])
    setTimeout(() => setRefreshing(false), 400)
  }

  async function fetchAll() {
    const [tasksRes, ctxRes] = await Promise.all([
      supabase.from('tasks').select('*').neq('status', 'done')
        .order('priority', { ascending: true })
        .order('updated_at', { ascending: false }),
      supabase.from('context').select('*').eq('id', 1).single(),
    ])
    if (tasksRes.error) setError(tasksRes.error.message)
    else {
      setTasks(tasksRes.data ?? [])
      setCtx(ctxRes.data)
    }
    setLoading(false)
    setTimeout(() => setFadeIn(true), 40)
  }

  async function fetchTasks() {
    const { data } = await supabase.from('tasks').select('*').neq('status', 'done')
      .order('priority', { ascending: true })
      .order('updated_at', { ascending: false })
    if (data) setTasks(data)
  }

  async function fetchCtx() {
    const { data } = await supabase.from('context').select('*').eq('id', 1).single()
    if (data) setCtx(data)
  }

  const focusTask    = tasks.find(t => t.status === 'focus')
  const activeTasks  = tasks.filter(t => t.status === 'active')
  const backlogTasks = tasks.filter(t => t.status === 'backlog')
  const frozenTasks  = tasks.filter(t => t.status === 'frozen')

  if (loading) return <Skeleton />


  if (error) return (
    <div className="splash">
      <div className="splash-logo"><span className="gradient-text">one thing</span></div>
      <p className="splash-error">{error}</p>
      <p className="splash-hint">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code></p>
    </div>
  )

  return (
    <div className={`app ${fadeIn ? 'visible' : ''}`}>

      <header className="app-header">
        <div className="header-row">
          <div className="wordmark-group">
            <div className="logo-mark">1</div>
            <span className="wordmark">one thing</span>
          </div>
          <div className="header-right">
            {refreshing && <span className="refresh-dot" />}
            <span className="header-date">{formatDate()}</span>
          </div>
        </div>
        {ctx?.weekly_theme && <p className="weekly-theme">{ctx.weekly_theme}</p>}
      </header>

      <main>
        <section className="section section-focus">
          <div className="section-label">
            <span className="label-dot" /> Focus now
          </div>
          {focusTask
            ? <FocusCard task={focusTask} />
            : <p className="focus-empty">Nothing in focus.</p>}
        </section>

        {activeTasks.length > 0 && (
          <Section label="Active" count={activeTasks.length}>
            {activeTasks.map(t => <TaskCard key={t.id} task={t} />)}
          </Section>
        )}

        {backlogTasks.length > 0 && (
          <Section label="Next up" count={backlogTasks.length}>
            {backlogTasks.map(t => <TaskCard key={t.id} task={t} />)}
          </Section>
        )}

        {frozenTasks.length > 0 && (
          <Section label="Someday" count={frozenTasks.length} muted>
            {frozenTasks.map(t => <TaskCard key={t.id} task={t} frozen />)}
          </Section>
        )}

        {tasks.length === 0 && (
          <div className="all-clear">
            <div className="all-clear-icon">✓</div>
            <p>All clear.</p>
          </div>
        )}

        <footer className="app-footer">
          <span>read-only view — Claude updates this via MCP</span>
          <span className="footer-sep">·</span>
          <button className="help-link" onClick={() => setShowHelp(true)}>
            keyboard shortcuts
          </button>
        </footer>
      </main>

      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="app visible">
      <header className="app-header">
        <div className="header-row">
          <div className="wordmark-group">
            <div className="logo-mark">1</div>
            <span className="wordmark">one thing</span>
          </div>
          <span className="header-date">{formatDate()}</span>
        </div>
      </header>
      <main>
        <section className="section section-focus">
          <div className="section-label"><span className="label-dot" /> Focus now</div>
          <div className="focus-card skeleton-focus">
            <div className="sk sk-meta" />
            <div className="sk sk-title" />
            <div className="sk sk-title short" />
          </div>
        </section>
        <section className="section">
          <div className="section-label">Active</div>
          <div className="task-list">
            {[0,1,2].map(i => (
              <div key={i} className="task-card skeleton-card">
                <div className="sk sk-line" />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function HelpOverlay({ onClose }) {
  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-panel" onClick={e => e.stopPropagation()}>
        <div className="help-title">Keyboard shortcuts</div>
        <div className="help-row"><kbd>?</kbd><span>Toggle this panel</span></div>
        <div className="help-row"><kbd>R</kbd><span>Refresh tasks</span></div>
        <div className="help-row"><kbd>Esc</kbd><span>Close</span></div>
        <div className="help-foot">Tasks update automatically via realtime.</div>
      </div>
    </div>
  )
}

function Section({ label, count, muted, children }) {
  return (
    <section className={`section${muted ? ' section-muted' : ''}`}>
      <div className="section-label">
        {label} <span className="section-count">{count}</span>
      </div>
      <div className="task-list">{children}</div>
    </section>
  )
}

function FocusCard({ task }) {
  return (
    <div className="focus-card">
      <div className="focus-meta">
        {task.area && <span className="tag tag-accent">{task.area}</span>}
        <PriorityBadge priority={task.priority} />
      </div>
      <h1 className="focus-title">{task.title}</h1>
      {task.notes && <div className="focus-notes"><Linkify text={task.notes} /></div>}
    </div>
  )
}

function TaskCard({ task, frozen }) {
  const [open, setOpen] = useState(false)
  const hasNotes = Boolean(task.notes)
  const bodyRef = useRef(null)

  return (
    <div
      className={`task-card${frozen ? ' frozen' : ''}${open ? ' open' : ''}${hasNotes ? ' has-notes' : ''}`}
      onClick={() => hasNotes && setOpen(o => !o)}
      role={hasNotes ? 'button' : undefined}
      tabIndex={hasNotes ? 0 : undefined}
      onKeyDown={e => {
        if (!hasNotes) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) }
      }}
      aria-expanded={hasNotes ? open : undefined}
    >
      <div className="task-row">
        <span className="task-title">{task.title}</span>
        <div className="task-right">
          {task.area && <span className="tag">{task.area}</span>}
          <PriorityBadge priority={task.priority} small />
          {hasNotes && <span className="task-chevron" aria-hidden="true">›</span>}
        </div>
      </div>
      {hasNotes && (
        <div
          ref={bodyRef}
          className="task-body"
          style={{ maxHeight: open ? `${bodyRef.current?.scrollHeight ?? 400}px` : 0 }}
        >
          <div className="task-notes"><Linkify text={task.notes} /></div>
        </div>
      )}
    </div>
  )
}

function PriorityBadge({ priority, small }) {
  const labels = { 1: 'P1', 2: 'P2', 3: 'P3' }
  return (
    <span className={`p-badge p${priority}${small ? ' small' : ''}`} title={`Priority ${priority}`}>
      {labels[priority] ?? `P${priority}`}
    </span>
  )
}
