import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test('index.css includes global user-select: none and input user-select: text rules', () => {
  const cssPath = path.resolve(__dirname, '../src/index.css')
  const cssContent = fs.readFileSync(cssPath, 'utf8')

  // Check global user-select: none
  assert.ok(
    cssContent.includes('user-select: none'),
    'index.css should contain user-select: none rule for global text selection prevention'
  )
  assert.ok(
    cssContent.includes('-webkit-user-select: none'),
    'index.css should contain vendor-prefixed -webkit-user-select: none'
  )

  // Check input and editable areas user-select: text
  assert.ok(
    cssContent.includes('user-select: text'),
    'index.css should contain user-select: text rule for functional input areas'
  )
  assert.ok(
    cssContent.includes('-webkit-user-select: text'),
    'index.css should contain vendor-prefixed -webkit-user-select: text'
  )

  // Check selectors
  assert.ok(cssContent.includes('input'), 'index.css should include input selector')
  assert.ok(cssContent.includes('textarea'), 'index.css should include textarea selector')
  assert.ok(
    cssContent.includes('[contenteditable="true"]'),
    'index.css should include [contenteditable="true"] selector'
  )
  assert.ok(cssContent.includes('code'), 'index.css should include code selector')
  assert.ok(cssContent.includes('pre'), 'index.css should include pre selector')
})
