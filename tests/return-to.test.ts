import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_RETURN_TO, safeReturnTo } from '../server/utils/return-to.ts'

test('accepts only the explicitly allowed internal paths', () => {
  assert.equal(safeReturnTo('/lecturas'), '/lecturas')
  assert.equal(safeReturnTo('/admin'), '/admin')
})

test('falls back to /admin for anything else', () => {
  const rejected: unknown[] = [
    undefined, null, '', 42, ['/lecturas'], { toString: () => '/lecturas' },
    'https://evil.example', '//evil.example', '/\\evil.example', '\\\\evil.example',
    'javascript:alert(1)', 'lecturas', '/lecturas/', '/lecturas?x=1', '/lecturas#x', '/lecturas/../admin',
    '/LECTURAS', ' /lecturas', '/lecturas\n', '/%2Flecturas', '/lecturas%00', '/otra-pagina',
  ]
  for (const value of rejected) assert.equal(safeReturnTo(value), DEFAULT_RETURN_TO, String(value))
})
