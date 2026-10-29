import { createError } from 'h3'
import type { Sql, TransactionSql } from 'postgres'

export const MAX_STRIKES = 3

export interface QueueEntry {
  id: string
  position: number
  strikeCount: number
  paused: boolean
}

export type QueueAction = 'read' | 'absent'

export interface QueuePlan {
  /** Entry ids in their new order; index + 1 is the new position. */
  order: string[]
  strikeCount: number
  paused: boolean
}

/**
 * Pure planning step: "Leído" sends the author to the back of the queue and
 * clears strikes and pause. "Ausente" only adds a strike, keeping the author's
 * place, and pauses them on reaching MAX_STRIKES. An author already at
 * MAX_STRIKES is left untouched so a stale click cannot change a paused author.
 */
export function planQueueAction(entries: QueueEntry[], id: string, action: QueueAction): QueuePlan | null {
  const sorted = [...entries].sort((a, b) => a.position - b.position)
  const target = sorted.find(entry => entry.id === id)
  if (!target) return null

  const currentOrder = sorted.map(entry => entry.id)

  if (action === 'read') {
    return {
      order: [...currentOrder.filter(entryId => entryId !== id), id],
      strikeCount: 0,
      paused: false,
    }
  }

  const strikeCount = Math.min(MAX_STRIKES, target.strikeCount + 1)
  return { order: currentOrder, strikeCount, paused: strikeCount >= MAX_STRIKES }
}

interface QueueRow {
  id: string
  position: number
  strike_count: number
  paused: boolean
}

/**
 * Applies a read/absent action atomically. The queue rows are locked and, when
 * the order changes (read), the whole queue is renumbered 1..n in two phases
 * (shift everything out of range, then assign final positions) because
 * UNIQUE (queue_id, position) is checked row by row.
 */
export async function applyQueueAction(sql: Sql, id: string, action: QueueAction) {
  await sql.begin(async (transaction: TransactionSql) => {
    const found = await transaction<{ queue_id: string }[]>`
      SELECT queue_id FROM reading_entries WHERE id = ${id} LIMIT 1
    `
    if (!found[0]) throw createError({ statusCode: 404, message: 'Autor no encontrado.' })
    const queueId = found[0].queue_id

    const rows = await transaction<QueueRow[]>`
      SELECT id, position, strike_count, paused FROM reading_entries
      WHERE queue_id = ${queueId} ORDER BY position FOR UPDATE
    `
    const plan = planQueueAction(
      rows.map(row => ({ id: row.id, position: row.position, strikeCount: row.strike_count, paused: row.paused })),
      id,
      action,
    )
    if (!plan) throw createError({ statusCode: 404, message: 'Autor no encontrado.' })

    if (action === 'read') {
      await transaction`
        UPDATE reading_entries
        SET position = position + (SELECT MAX(position) FROM reading_entries WHERE queue_id = ${queueId})
        WHERE queue_id = ${queueId}
      `
      await transaction`
        UPDATE reading_entries AS entry SET position = ordered.position
        FROM unnest(${transaction.array(plan.order)}::uuid[]) WITH ORDINALITY AS ordered(id, position)
        WHERE entry.id = ordered.id
      `
    }
    await transaction`
      UPDATE reading_entries
      SET strike_count = ${plan.strikeCount}, paused = ${plan.paused}, updated_at = NOW()
      WHERE id = ${id}
    `
  })
}
