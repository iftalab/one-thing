import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate() {
  const d = new Date()
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' })
  const rest    = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  return `${weekday} · ${rest}`
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

  // ── Supabase mutations (untouched logic) ──────────────────────────────────

  async function setFocus(task) {
    setSaving(true)
    const currentFocus = tasks.find(t => t.status === 'focus')
    if (currentFocus && currentFocus.id !== task.id) {
      await supabase.from('tasks')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', currentFocus.id)
    }
    await supabase.from('tasks')
      .update({ status: 'focus', updated_at: new Date().toISOString() })
      .eq('id', task.id)
    await supabase.from('context')
      .update({ current_focus_id: task.id, last_claude_checkin: new Date().toISOString() })
      .eq('id', 1)
    await fetchTasks()
    setSaving(false)
  }

  async function updateStatus(task, status) {
    if (status === 'focus') { await setFocus(task); return }
    setSaving(true)
    await supabase.from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', task.id)
    await fetchTasks()
    setSaving(false)
  }

  async function markDone(task) {
    setSaving(true)
    await supabase.from('tasks')
      .update({ status: 'done', updated_at: new Date().toISOString() })
      .eq('id', task.id)
    if (task.status === 'focus') {
      await supabase.from('context').update({ current_focus_id: null }).eq('id', 1)
    }
    await fetchTasks()
    setSaving(false)
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

  // ── Derived ───────────────────────────────────────────────────────────────

  const focusTask   = tasks.find(t => t.status === 'focus')
  const activeTasks = tasks.filter(t => t.status === 'active')
  const backlogTasks= tasks.filter(t => t.status === 'backlog')
  const frozenTasks = tasks.filter(t => t.status === 'frozen')

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="splash">
      <span className="wordmark">one thing</span>
    </div>
  )

  if (error) return (
    <div className="splash">
      <span className="wordmark">one thing</span>
      <p className="splash-error">{error}</p>
      <p className="splash-hint">Check <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code></p>
    </div>
  )

  return (
    <div className={`app ${fadeIn ? 'visible' : ''}`}>

      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-row">
          <span className="wordmark">one thing</span>
          <span className="header-date">{formatDate()}</span>
        </div>
        {ctx?.weekly_theme && (
          <p className="weekly-theme">{ctx.weekly_theme}</p>
        )}
        {saving && <span className="saving-indicator" aria-label="Saving…" />}
      </header>

      <main>

        {/* ── Focus ── */}
        <section className="section section-focus">
          <div className="section-label">Now</div>
          {focusTask ? (
            <FocusCard
              task={focusTask}
              onDone={()   => markDone(focusTask)}
              onDemote={()  => updateStatus(focusTask, 'active')}
            />
          ) : (
            <div className="focus-empty">
              <p>Nothing in focus.</p>
              <p>Pick something from active, or tap + to add one.</p>
            </div>
          )}
        </section>

        {/* ── Active ── */}
        {activeTasks.length > 0 && (
          <section className="section">
            <div className="section-label">Active</div>
            <div className="task-list">
              {activeTasks.map(task => (
                <TaskCard key={task.id} task={task}
                  onDone={()  => markDone(task)}
                  onStatus={s => updateStatus(task, s)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Backlog ── */}
        {backlogTasks.length > 0 && (
          <section className="section">
            <div className="section-label">Next</div>
            <div className="task-list">
              {backlogTasks.map(task => (
                <TaskCard key={task.id} task={task}
                  onDone={()  => markDone(task)}
                  onStatus={s => updateStatus(task, s)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Frozen / Someday ── */}
        {frozenTasks.length > 0 && (
          <section className="section">
            <div className="section-label">Someday</div>
            <div className="task-list">
              {frozenTasks.map(task => (
                <TaskCard key={task.id} task={task} frozen
                  onDone={()  => markDone(task)}
                  onStatus={s => updateStatus(task, s)}
                />
              ))}
            </div>
          </section>
        )}

        {tasks.length === 0 && (
          <p className="all-clear">All clear. Tap + to add your first task.</p>
        )}

        <div className="bottom-spacer" />
      </main>

      {/* ── FAB ── */}
      <button className="fab" onClick={() => setShowAdd(true)} aria-label="Add task">+</button>

      {/* ── Add panel ── */}
      {showAdd && (
        <AddPanel
          onClose={() => setShowAdd(false)}
          onAdd={async data => { await addTask(data); setShowAdd(false) }}
        />
      )}
    </div>
  )
}

// ─── Focus Card ────────────────────────────────────────────────────────────────

function FocusCard({ task, onDone, onDemote }) {
  return (
    <div className="focus-card">
      {task.area && <span className="focus-area">{task.area}</span>}
      <h1 className="focus-title">{task.title}</h1>
      {task.notes && <p className="focus-notes">{task.notes}</p>}
      <div className="focus-actions">
        <button className="btn-done"  onClick={onDone}>Mark done</button>
        <button className="btn-ghost" onClick={onDemote}>Unset focus</button>
      </div>
    </div>
  )
}

// ─── Task Card ─────────────────────────────────────────────────────────────────

const STATUS_MOVE = {
  focus:   ['active', 'backlog', 'frozen'],
  active:  ['focus',  'backlog', 'frozen'],
  backlog: ['focus',  'active',  'frozen'],
  frozen:  ['focus',  'active',  'backlog'],
}
const STATUS_LABEL = { focus: 'Set as focus', active: 'Active', backlog: 'Next', frozen: 'Someday' }

function TaskCard({ task, frozen, onDone, onStatus }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className={`task-card${frozen ? ' task-frozen' : ''}${open ? ' task-open' : ''}`}>
      <div className="task-body" onClick={() => setOpen(v => !v)}>
        <div className="task-row">
          <span className="task-title">{task.title}</span>
          <div className="task-meta">
            {task.area && <span className="task-area">{task.area}</span>}
            <span className={`task-p p${task.priority}`}>P{task.priority}</span>
          </div>
        </div>
        {open && task.notes && <p className="task-notes">{task.notes}</p>}
      </div>

      {open && (
        <div className="task-actions">
          {STATUS_MOVE[task.status]?.map(s => (
            <button key={s} onClick={() => { onStatus(s); setOpen(false) }}>
              {STATUS_LABEL[s]}
            </button>
          ))}
          <button className="action-done" onClick={() => { onDone(); setOpen(false) }}>Done</button>
        </div>
      )}
    </div>
  )
}

// ─── Add Panel ─────────────────────────────────────────────────────────────────

function AddPanel({ onClose, onAdd }) {
  const [form, setForm] = useState({ title: '', area: '', priority: 2, notes: '', status: 'active' })
  const panelRef = useRef(null)

  useEffect(() => {
    // Dismiss on outside click with a small delay so the FAB click doesn't immediately close
    const t = setTimeout(() => {
      const handler = e => { if (panelRef.current && !panelRef.current.contains(e.target)) onClose() }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, 100)
    return () => clearTimeout(t)
  }, [onClose])

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    onAdd(form)
  }

  return (
    <div className="add-overlay">
      <form ref={panelRef} className="add-panel" onSubmit={handleSubmit}>
        <input
          className="add-title-input"
          placeholder="What needs to happen?"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          autoFocus
          required
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
            <option value={3}>P3 — Nice to have</option>
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
          <button type="submit"  className="add-submit">Add task</button>
          <button type="button"  className="add-cancel" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
