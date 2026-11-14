import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('two-click shapes, two-click connection, undo/redo, import/export, autosave', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const nodes = page.locator('.diagram-node')
  const edges = page.locator('.edge')
  await expect(nodes).toHaveCount(4)
  await expect(edges).toHaveCount(3)
  // CI compiles Rust/Wasm before launching this browser. Confirm it actually loads.
  await expect(page.getByText('Rust / Wasm geometry')).toBeVisible()

  // Click 1 selects a shape, click 2 places it directly on the canvas.
  await page.getByRole('button', { name: 'Add process' }).click()
  const svg = page.locator('.diagram-canvas')
  const bounds = await svg.boundingBox()
  expect(bounds).toBeTruthy()
  await svg.click({ position: { x: Math.floor(bounds!.width * 0.1), y: Math.floor(bounds!.height * 0.85) } })
  await expect(nodes).toHaveCount(5)

  // Connecting needs only the source + port, then the destination click.
  await nodes.first().locator('.node-port').click()
  await nodes.last().click()
  await expect(edges).toHaveCount(4)

  await page.keyboard.press('Control+z')
  await expect(edges).toHaveCount(3)
  await page.keyboard.press('Control+Shift+z')
  await expect(edges).toHaveCount(4)

  // Save editable JSON and inspect its actual contents.
  await page.getByRole('button', { name: /Export/ }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Drawlight JSON/ }).click()
  ])
  const file = JSON.parse(await readFile(await download.path()!, 'utf8'))
  expect(file.nodes).toHaveLength(5)
  expect(file.edges).toHaveLength(4)

  // Reload keeps the local document without any server.
  await page.reload()
  await expect(nodes).toHaveCount(5)
  await expect(edges).toHaveCount(4)

  // Mermaid action is available for source control and Markdown docs.
  await page.getByRole('button', { name: /Export/ }).click()
  await expect(page.getByRole('button', { name: /Download Mermaid/ })).toBeVisible()
  expect(errors).toEqual([])
  await page.screenshot({ path: 'test-results/editor.png' })
})

test('templates load in two clicks and switching can be undone', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const nodes = page.locator('.diagram-node')
  const edges = page.locator('.edge')
  await expect(nodes).toHaveCount(4)
  await page.getByRole('button', { name: 'Templates', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Start with a template' })).toBeVisible()
  await expect(page.locator('.template-card')).toHaveCount(9)

  await page.getByRole('button', { name: 'Use CI / CD pipeline template' }).click()
  await expect(nodes).toHaveCount(6)
  await expect(edges).toHaveCount(5)
  await expect(page.getByRole('dialog', { name: 'Start with a template' })).toHaveCount(0)

  await page.keyboard.press('Control+z')
  await expect(nodes).toHaveCount(4)
  await expect(edges).toHaveCount(3)

  await page.getByRole('button', { name: 'Browse templates' }).click()
  await page.getByRole('button', { name: 'Use Blank canvas template' }).click()
  await expect(nodes).toHaveCount(0)
  await expect(page.getByText('A blank canvas, endless possibilities.')).toBeVisible()
  await page.keyboard.press('Control+z')
  await expect(nodes).toHaveCount(4)
})

test('dragging commits a move and persists it after a reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const first = page.locator('.diagram-node').first()
  const before = await first.getAttribute('transform')
  const box = await first.boundingBox()
  expect(box).toBeTruthy()
  const x = box!.x + box!.width / 2
  const y = box!.y + box!.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 112, y + 72, { steps: 8 })
  await page.mouse.up()

  await expect(first).not.toHaveAttribute('transform', before!)
  const moved = await first.getAttribute('transform')
  expect(moved).toBeTruthy()
  await page.reload()
  await expect(page.locator('.diagram-node').first()).toHaveAttribute('transform', moved!)
})

test('ER template is editable and exports PK/FK and cardinality', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Templates', exact: true }).click()
  await page.getByRole('button', { name: 'Use ER · SaaS schema template' }).click()
  await expect(page.locator('.diagram-node')).toHaveCount(4)
  await expect(page.locator('.diagram-node').first().getByText('PK id', { exact: true })).toBeVisible()
  await page.locator('.diagram-node').first().click()
  await expect(page.locator('#entity-fields')).toHaveValue(/id: uuid PK/)
  await page.locator('#entity-fields').fill('id: uuid PK\nemail: varchar\nstatus: varchar')
  await page.locator('#entity-fields').blur()

  await page.getByRole('button', { name: /Export/ }).click()
  const [exported] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Download Mermaid/ }).click()
  ])
  const mermaid = await readFile(await exported.path()!, 'utf8')
  expect(mermaid).toContain('erDiagram')
  expect(mermaid).toContain('varchar status')
  expect(mermaid).toContain('||--o{')
  await page.reload()
  await page.locator('.diagram-node').first().click()
  await expect(page.locator('#entity-fields')).toHaveValue(/status: varchar/)
})

test('sequence template renders lifelines and ordered messages, exports sequenceDiagram', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Templates', exact: true }).click()
  await page.getByRole('button', { name: 'Use Sequence · API authentication template' }).click()
  await expect(page.locator('.sequence-lifelines line')).toHaveCount(4)
  await expect(page.locator('.edge')).toHaveCount(6)
  await page.getByRole('button', { name: /Export/ }).click()
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Download Mermaid/ }).click()
  ])
  const mermaid = await readFile(await file.path()!, 'utf8')
  expect(mermaid).toContain('sequenceDiagram')
  expect(mermaid).toContain('participant p1 as Browser')
  expect(mermaid).toContain('-->>')
})
