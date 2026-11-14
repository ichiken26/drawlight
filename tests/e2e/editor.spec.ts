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
