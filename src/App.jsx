import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

function formatDate() {
  const d = new Date()
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

// ─── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [tasks,   setTasks]   = useState([])
  const [ctx,     setCtx]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [fadeIn,  setFadeIn]  = useState(false)

  useEffect(() => {
    fetchAll()
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, fetchTasks)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function fetchAll() {
    const [tasksRes, ctxRes] = await Promise.all([
      supabase.from('tasks').select('*').neq('status', 'done')
        .order('priority', { ascending: true })
        .order('updated_at',  { ascending: false }),
      supabase.from('context').select('*').eq('id', 1).single(),
    ])
    if (tasksRes.error) {
      setError(tasksRes.error.message)
    } else {
      setTasks(tasksRes.data ?? [])
      setCtx(ctxRes.data)
    }
    setLoading(false)
    setTimeout(() => setFadeIn(true), 40)
  }

  async function fetchTasks() {
    const { data, error } = await supabase
      .from('tasks').select('*').neq('status', 'done')
      .order('priority', { ascending: true })
      .order('updated_at', { ascending: false })
    if (!error) setTasks(data ?? [])
  }

  async function addTask(data) {
    setSaving(true)
    await supabase.from('tasks').insert({
      title:    data.title.trim(),
      area:     data.area.trim()  || null,
      status:   data.status,
      priority: Number(data.priority),
      notes:    data.notes.trim() || null,
    })
    await fetchTasks()
    setSaving(false)
  }

  const focusTask    = tasks.find(t => t.status === 'focus')
  const activeTasks  = tasks.filter(t => t.status === 'active')
  const backlogTasks = tasks.filter(t => t.status === 'backlog')
  const frozenTasks  = tasks.filter(t => t.status === 'frozen')

  if (loading) return (
    <div className="splash"><span className="wordmark">one thing</span></div>
  )

  if (error) return (
    <div className="splash">
      <span className="wordmark">one thing</span>
      <p className="splash-error">{error}</p>
      <p className="splash-hint">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code></p>
    </div>
  )

  return (
    <div className={`app ${fadeIn ? 'visible' : ''}`}>

      <header className="app-header">
        <div className="header-row">
          <div className="wordmark-group">
            <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect width="20" height="20" rx="4.5" fill="#C96442"/>
              <text x="10" y="14" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="11" font-weight="500" fill="white">1</text>
            </svg>
            <span className="wordmark">one thing</span>
          </div>
          <span className="header-date">{formatDate()}</span>
        </div>
        {ctx?.weekly_theme && <p className="weekly-theme">{ctx.weekly_theme}</p>}
        {saving && <span className="saving-dot" />}
      </header>

      <main>

        <section className="section section-focus">
          <div className="section-label">Now</div>
          {focusTask
            ? <FocusCard task={focusTask} />
            : <p className="focus-empty">Nothing in focus.</p>}
        </section>

        {activeTasks.length > 0 && (
          <section className="section">
            <div className="section-label">Active</div>
            <div className="task-list">
              {activeTasks.map(t => <TaskCard key={t.id} task={t} />)}
            </div>
          </section>
        )}

        {backlogTasks.length > 0 && (
          <section className="section">
            <div className="section-label">Next</div>
            <div className="task-list">
              {backlogTasks.map(t => <TaskCard key={t.id} task={t} />)}
            </div>
          </section>
        )}

        {frozenTasks.length > 0 && (
          <section className="section">
            <div className="section-label">Someday</div>
            <div className="task-list">
              {frozenTasks.map(t => <TaskCard key={t.id} task={t} frozen />)}
            </div>
          </section>
        )}

        {tasks.length === 0 && <p className="all-clear">All clear.</p>}

        <div className="bottom-spacer" />
      </main>

      <button className="fab" onClick={() => setShowAdd(true)} aria-label="Add task">+</button>

      {showAdd && (
        <AddPanel
          onClose={() => setShowAdd(false)}
          onAdd={async data => { await addTask(data); setShowAdd(false) }}
        />
      )}
    </div>
  )
}

// ─── Focus card (display only) ─────────────────────────────────────────────────

function FocusCard({ task }) {
  return (
    <div className="focus-card">
      <div className="focus-meta">
        {task.area && <span className="tag">{task.area}</span>}
        <span className={`p-dot p${task.priority}`} title={`Priority ${task.priority}`} />
      </div>
      <h1 className="focus-title">{task.title}</h1>
      {task.notes && <p className="focus-notes">{task.notes}</p>}
    </div>
  )
}

// ─── Task card (display only) ──────────────────────────────────────────────────

function TaskCard({ task, frozen }) {
  return (
    <div className={`task-card${frozen ? ' frozen' : ''}`}>
      <span className="task-title">{task.title}</span>
      <div className="task-right">
        {task.area && <span className="tag">{task.area}</span>}
        <span className={`p-dot p${task.priority}`} title={`Priority ${task.priority}`} />
      </div>
    </div>
  )
}

// ─── Add panel ─────────────────────────────────────────────────────────────────

function AddPanel({ onClose, onAdd }) {
  const [form, setForm] = useState({ title: '', area: '', priority: 2, notes: '', status: 'active' })
  const ref  = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => {
      const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
      document.addEventListener('mousedown', h)
      return () => document.removeEventListener('mousedown', h)
    }, 100)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="add-overlay">
      <form ref={ref} className="add-panel" onSubmit={e => { e.preventDefault(); if (form.title.trim()) onAdd(form) }}>
        <input
          className="add-title-input"
          placeholder="What needs to happen?"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          autoFocus required
        />
        <div className="add-row">
          <input
            placeholder="Area"
            value={form.area}
            onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
          />
          <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
            <option value={1}>P1 — Must do</option>
            <option value={2}>P2 — Important</option>
            <option value={3}>P3 — Someday</option>
          </select>
          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            <option value="active">Active</option>
            <option value="backlog">Next</option>
            <option value="focus">Focus now</option>
          </select>
        </div>
        <textarea
          placeholder="Notes (optional)"
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={2}
        />
        <div className="add-footer">
          <button type="submit"  className="add-submit">Add</button>
          <button type="button"  className="add-cancel" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
