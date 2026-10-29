import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planQueueAction, type QueueEntry } from '../server/utils/reading-queue.ts'

const queue = (...specs: Array<[string, number, boolean?]>): QueueEntry[] =>
  specs.map(([id, strikeCount, paused = false], index) => ({ id, position: index + 1, strikeCount, paused }))

test('absent adds a strike and keeps the author in place', () => {
  const plan = planQueueAction(queue(['a', 0], ['b', 0], ['c', 0]), 'a', 'absent')
  assert.deepEqual(plan, { order: ['a', 'b', 'c'], strikeCount: 1, paused: false })
})

test('third strike pauses the author without moving them', () => {
  const plan = planQueueAction(queue(['a', 0], ['b', 2], ['c', 0]), 'b', 'absent')
  assert.deepEqual(plan, { order: ['a', 'b', 'c'], strikeCount: 3, paused: true })
})

test('absent on an author already at 3 strikes changes nothing', () => {
  const plan = planQueueAction(queue(['a', 0], ['b', 3, true], ['c', 0]), 'b', 'absent')
  assert.deepEqual(plan, { order: ['a', 'b', 'c'], strikeCount: 3, paused: true })
})

test('read moves the author to the end, clears strikes and the pause', () => {
  const plan = planQueueAction(queue(['a', 0], ['b', 3, true], ['c', 1]), 'b', 'read')
  assert.deepEqual(plan, { order: ['a', 'c', 'b'], strikeCount: 0, paused: false })
})

test('the last author stays last and ordering ignores position gaps', () => {
  const entries: QueueEntry[] = [
    { id: 'c', position: 9, strikeCount: 0, paused: false },
    { id: 'a', position: 2, strikeCount: 0, paused: false },
    { id: 'b', position: 5, strikeCount: 0, paused: false },
  ]
  assert.deepEqual(planQueueAction(entries, 'c', 'read')?.order, ['a', 'b', 'c'])
  assert.deepEqual(planQueueAction(entries, 'a', 'absent')?.order, ['a', 'b', 'c'])
})

test('unknown entries yield no plan', () => {
  assert.equal(planQueueAction(queue(['a', 0]), 'zzz', 'read'), null)
})
