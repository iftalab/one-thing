import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

const STATUS_ORDER = ['focus', 'active', 'backlog', 'frozen']

const STATUS_LABELS = {
  focus: 'Focus',
  active: 'Active',
  backlog: 'Backlog',
  frozen: 'Frozen',
}

export default function App() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [view, setView] = useState('focus') // 'focus' | 'board'
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', area: '', priority: 2, notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchTasks()

    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchTasks())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  async function fetchTasks() {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .neq('status', 'done')
      .order('priority', { ascending: true })
      .order('updated_at', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setTasks(data ?? [])
    }
    setLoading(false)
  }

  async function setFocus(task) {
    setSaving(true)
    const currentFocus = tasks.find(t => t.status === 'focus')

    if (currentFocus && currentFocus.id !== task.id) {
      await supabase
        .from('tasks')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', currentFocus.id)
    }

    await supabase
      .from('tasks')
      .update({ status: 'focus', updated_at: new Date().toISOString() })
      .eq('id', task.id)

    await supabase
      .from('context')
      .update({ current_focus_id: task.id, last_claude_checkin: new Date().toISOString() })
      .eq('id', 1)

    await fetchTasks()
    setSaving(false)
  }

  async function updateStatus(task, status) {
    if (status === 'focus') {
      await setFocus(task)
      return
    }
    setSaving(true)
    await supabase
      .from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', task.id)
    await fetchTasks()
    setSaving(false)
  }

  async function markDone(task) {
    setSaving(true)
    await supabase
      .from('tasks')
      .update({ status: 'done', updated_at: new Date().toISOString() })
      .eq('id', task.id)

    if (task.status === 'focus') {
      await supabase
        .from('context')
        .update({ current_focus_id: null })
        .eq('id', 1)
    }

    await fetchTasks()
    setSaving(false)
  }

  async function handleAddTask(e) {
    e.preventDefault()
    if (!newTask.title.trim()) return
    setSaving(true)

    await supabase.from('tasks').insert({
      title: newTask.title.trim(),
      area: newTask.area.trim() || null,
      status: 'active',
      priority: Number(newTask.priority),
      notes: newTask.notes.trim() || null,
    })

    setNewTask({ title: '', area: '', priority: 2, notes: '' })
    setShowAddForm(false)
    await fetchTasks()
    setSaving(false)
  }

  const focusTask = tasks.find(t => t.status === 'focus')
  const activeTasks = tasks.filter(t => t.status === 'active')

  if (loading) {
    return (
      <div id="splash">
        <span className="app-wordmark">one thing</span>
        <div className="spinner" />
      </div>
    )
  }

  if (error) {
    return (
      <div id="splash">
        <span className="app-wordmark">one thing</span>
        <div className="error-box">
          <strong>Connection error</strong>
          <p>{error}</p>
          <p className="hint">Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code></p>
        </div>
      </div>
    )
  }

  return (
    <div id="app">
      <header>
        <span className="app-wordmark">one thing</span>
        <nav>
          <button
            className={view === 'focus' ? 'active' : ''}
            onClick={() => setView('focus')}
          >
            Focus
          </button>
          <button
            className={view === 'board' ? 'active' : ''}
            onClick={() => setView('board')}
          >
            Board
          </button>
        </nav>
        <div className="header-right">
          {saving && <span className="saving-dot" title="Saving..." />}
          <button
            className="btn-add"
            onClick={() => setShowAddForm(v => !v)}
            aria-label="Add task"
          >
            +
          </button>
        </div>
      </header>

      {showAddForm && (
        <form className="add-form" onSubmit={handleAddTask}>
          <input
            className="add-title"
            placeholder="What needs to happen?"
            value={newTask.title}
            onChange={e => setNewTask(t => ({ ...t, title: e.target.value }))}
            autoFocus
            required
          />
          <div className="add-row">
            <input
              placeholder="Area (work, studio…)"
              value={newTask.area}
              onChange={e => setNewTask(t => ({ ...t, area: e.target.value }))}
            />
            <select
              value={newTask.priority}
              onChange={e => setNewTask(t => ({ ...t, priority: e.target.value }))}
            >
              <option value={1}>P1 — Must do</option>
              <option value={2}>P2 — Important</option>
              <option value={3}>P3 — Nice to have</option>
            </select>
          </div>
          <textarea
            placeholder="Notes (optional)"
            value={newTask.notes}
            onChange={e => setNewTask(t => ({ ...t, notes: e.target.value }))}
            rows={2}
          />
          <div className="add-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              Add task
            </button>
            <button type="button" className="btn-ghost" onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {view === 'focus' ? (
        <main id="focus-view">
          <section id="focus-section">
            <div className="section-header">
              <span className="section-label">
                <span className="focus-pulse" />
                THE ONE THING
              </span>
            </div>

            {focusTask ? (
              <FocusCard
                task={focusTask}
                onDone={() => markDone(focusTask)}
                onDemote={() => updateStatus(focusTask, 'active')}
              />
            ) : (
              <div className="focus-empty">
                <p>No focus set.</p>
                <p>Pick something from your active tasks, or add a new one.</p>
              </div>
            )}
          </section>

          {activeTasks.length > 0 && (
            <section id="active-section">
              <div className="section-header">
                <span className="section-label">Active</span>
                <span className="count">{activeTasks.length}</span>
              </div>
              <div className="task-list">
                {activeTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onFocus={() => setFocus(task)}
                    onDone={() => markDone(task)}
                    onStatus={s => updateStatus(task, s)}
                  />
                ))}
              </div>
            </section>
          )}

          {activeTasks.length === 0 && !focusTask && (
            <div className="all-clear">
              All clear. Add something to get started.
            </div>
          )}
        </main>
      ) : (
        <main id="board-view">
          {STATUS_ORDER.map(status => {
            const col = tasks.filter(t => t.status === status)
            return (
              <section key={status} className={`board-col col-${status}`}>
                <div className="section-header">
                  <span className="section-label">{STATUS_LABELS[status]}</span>
                  <span className="count">{col.length}</span>
                </div>
                <div className="task-list">
                  {col.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onFocus={() => setFocus(task)}
                      onDone={() => markDone(task)}
                      onStatus={s => updateStatus(task, s)}
                    />
                  ))}
                  {col.length === 0 && (
                    <div className="col-empty">—</div>
                  )}
                </div>
              </section>
            )
          })}
        </main>
      )}
    </div>
  )
}

function FocusCard({ task, onDone, onDemote }) {
  return (
    <div className="focus-card">
      <div className="focus-meta">
        {task.area && <span className="area-tag">{task.area}</span>}
        <span className={`p-badge p${task.priority}`}>P{task.priority}</span>
      </div>
      <h1 className="focus-title">{task.title}</h1>
      {task.notes && <p className="focus-notes">{task.notes}</p>}
      <div className="focus-actions">
        <button className="btn-done" onClick={onDone}>
          Mark done
        </button>
        <button className="btn-ghost" onClick={onDemote}>
          Move to active
        </button>
      </div>
    </div>
  )
}

function TaskCard({ task, onFocus, onDone, onStatus }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const otherStatuses = STATUS_ORDER.filter(s => s !== task.status && s !== 'focus')

  return (
    <div ref={ref} className={`task-card status-${task.status}`}>
      <div className="task-card-body" onClick={() => setOpen(v => !v)}>
        <div className="task-card-top">
          {task.area && <span className="area-tag">{task.area}</span>}
          <span className={`p-badge p${task.priority}`}>P{task.priority}</span>
        </div>
        <div className="task-title">{task.title}</div>
        {task.notes && <div className="task-notes">{task.notes}</div>}
      </div>

      {open && (
        <div className="task-menu">
          {task.status !== 'focus' && (
            <button onClick={() => { onFocus(); setOpen(false) }}>
              Set as focus
            </button>
          )}
          {otherStatuses.map(s => (
            <button key={s} onClick={() => { onStatus(s); setOpen(false) }}>
              Move to {STATUS_LABELS[s].toLowerCase()}
            </button>
          ))}
          <button className="menu-done" onClick={() => { onDone(); setOpen(false) }}>
            Mark done
          </button>
        </div>
      )}
    </div>
  )
}
