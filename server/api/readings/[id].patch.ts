export default defineEventHandler(async (event) => {
  await requirePermission(event, 'manage_readings')
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const action = enumValue(body.action, ['read', 'absent', 'update', 'move'] as const, 'Acción')
  const sql = database()

  const existing = await sql<{ queue_id: string; position: number }[]>`
    SELECT queue_id, position FROM reading_entries WHERE id = ${id} LIMIT 1
  `
  if (!existing[0]) throw createError({ statusCode: 404, message: 'Autor no encontrado.' })

  if (action === 'read' || action === 'absent') await applyQueueAction(sql, id, action)

  if (action === 'update') {
    const author = requiredString(body.author, 'Autor', 120)
    const work = optionalString(body.work, 240)
    await sql`UPDATE reading_entries SET author_name = ${author}, work_title = ${work}, updated_at = NOW() WHERE id = ${id}`
  }

  if (action === 'move') {
    const direction = enumValue(body.direction, ['up', 'down'] as const, 'Dirección')
    const operator = direction === 'up' ? sql`<` : sql`>`
    const order = direction === 'up' ? sql`DESC` : sql`ASC`
    await sql.begin(async (transaction) => {
      const target = await transaction<{ id: string; position: number }[]>`
        SELECT id, position FROM reading_entries
        WHERE queue_id = ${existing[0].queue_id} AND position ${operator} ${existing[0].position}
        ORDER BY position ${order} LIMIT 1 FOR UPDATE
      `
      if (!target[0]) return
      await transaction`UPDATE reading_entries SET position = position + 1000000 WHERE id = ${id}`
      await transaction`UPDATE reading_entries SET position = ${existing[0].position} WHERE id = ${target[0].id}`
      await transaction`UPDATE reading_entries SET position = ${target[0].position}, updated_at = NOW() WHERE id = ${id}`
    })
  }

  return { ok: true }
})
