# One Thing — Claude Instructions

> This file is read automatically by Claude Code at the start of every session.
> Claude.ai users: read `claude/CONTEXT.md` then check the board.

## Your job every session

1. Read `claude/CONTEXT.md` for current life context and rules
2. Query `tasks` table — check what's `focus` and what's `active`
3. If anything seems stale or misaligned, say so before doing anything else
4. Update the board as work happens during this session

## How to connect to Supabase

Use the Supabase MCP (configured in your Claude Code settings).
Tables: `tasks`, `context`
Always update `context.last_claude_checkin = now()` at end of session.

## The one rule that matters most

**Only one task can have `status = 'focus'` at any time.**
Before setting a new focus, demote the current one to `active`.

## When the user says something is done

```sql
update tasks set status = 'done', updated_at = now() where id = '...';
-- Then promote the next logical task to focus
update tasks set status = 'focus', updated_at = now() where id = '...';
update context set current_focus_id = '...', last_claude_checkin = now() where id = 1;
```

## When something new comes up unplanned

1. Add it: `insert into tasks (title, area, status, priority, notes) values (...)`
2. Evaluate: does it bump anything currently `active` down?
3. Tell the user what you changed and why

## When the user seems overwhelmed

- Freeze low-priority backlog items aggressively
- Keep only 1 focus + max 3 active visible
- Update `context.weekly_theme` to reflect the constraint

## Supabase MCP setup (one time)

Add to your `claude_desktop_config.json` or Claude Code MCP settings:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--supabase-url", "YOUR_SUPABASE_URL",
        "--supabase-key", "YOUR_SERVICE_ROLE_KEY"
      ]
    }
  }
}
```

Use the **service role key** (not anon key) for MCP — Claude needs write access.
Find it: Supabase Dashboard → Project Settings → API → service_role key.

## Status definitions

| Status | Meaning |
|--------|---------|
| `focus` | The ONE thing right now. Only one at a time. |
| `active` | In progress or needs attention this week |
| `backlog` | Real task, not this week |
| `frozen` | Deliberately paused — do not surface unless asked |
| `done` | Complete — keep for record, never delete |

## Priority definitions

| Priority | Meaning |
|----------|---------|
| 1 | Must happen — has deadline or blocks other work |
| 2 | Important, move forward steadily |
| 3 | Nice to have, do when space opens up |

## Current life context (update as things change)

- **Recovery:** Post-surgery week of April 9 2026. Short sessions. Low capacity.
- **Work return:** Week of April 14 2026
- **Travel:** ~May 7 2026. All travel prep must be done before then.
- **IkraStudio:** Active studio/design business. Moodboard + logo brief are current blockers.
- **Sydney move:** Planning a move to Sydney Dec 2026. Frozen this month.
- **Location:** Dubai
