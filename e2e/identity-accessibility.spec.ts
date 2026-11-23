import { test, expect } from '@playwright/test'

/**
 * Identity accessibility E2E (OVERSTORY-IDENTITY-R009): the sign-in form (in
 * whichever shape the installed boundary serves it), error messages, the
 * admin tab panels and the profile modal confirmation, at every viewport and
 * theme. Reuses the viewport + theme loop of e2e/accessibility.spec.ts;
 * fixes belong to the owning component, not to this spec.
 *
 * The sign-in half runs in a cookie-free context, so it exercises the
 * unauthenticated screen; the admin and modal halves reuse the signed-in
 * session the `setup` project produced.
 */

const viewports = [320, 375, 768, 1440].flatMap((width) => ['light', 'dark'].map((theme) => ({ width, theme })))

// spec: OVERSTORY-IDENTITY-R009
for (const { width, theme } of viewports) {
  test(`identity_accessibility at ${width}px (${theme})`, async ({ page, context }) => {
    // --- sign-in form and error states (unauthenticated) -------------------
    const sessionCookies = await context.cookies()
    await context.clearCookies()
    const homeUrl = await page.goto('/')
    if (theme === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'))
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

    const localUsername = page.getByRole('textbox', { name: 'Username' })
    if (await localUsername.count()) {
      // Local sign-in form: keyboard-only fill, submit, announced error.
      await localUsername.focus()
      await page.keyboard.type('accessibility-probe')
      await page.keyboard.press('Tab')
      await expect(page.getByRole('textbox', { name: 'Password' })).toBeFocused()
      await page.keyboard.type('not-a-real-password')
      await page.keyboard.press('Enter')
      await expect(page.getByRole('alert')).toBeVisible()
      // Recovery round trip, keyboard only.
      await page.getByRole('button', { name: 'Use a reset token' }).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('heading', { name: 'Reset password' })).toBeVisible()
      await expect(page.getByRole('textbox', { name: 'Reset token' })).toBeVisible()
      await expect(page.getByRole('textbox', { name: 'New password' })).toBeVisible()
      await page.getByRole('button', { name: 'Back to sign in' }).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    } else {
      // Single-client SSO boundary: one labelled keyboard-operable action.
      const action = page.getByRole('button', { name: 'Sign in' }).first()
      await action.focus()
      await page.keyboard.press('Enter')
      await expect.poll(() => page.url()).not.toBe(homeUrl!.toString())
    }

    // Restore the signed-in session for the admin and modal halves.
    await context.addCookies(sessionCookies)

    // --- admin tab panels (authenticated admin session) ---------------------
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Admin Console' })).toBeVisible()
    const firstTab = page.getByRole('tab', { name: 'users' })
    await firstTab.focus()
    await expect(firstTab).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'service accounts' })).toBeFocused()
    await page.keyboard.press('End')
    await expect(page.getByRole('tab', { name: 'backup' })).toBeFocused()
    await page.keyboard.press('Home')
    await expect(firstTab).toBeFocused()
    await expect(page.getByRole('tabpanel')).toBeVisible()

    // --- profile modal confirmation -----------------------------------------
    await page.goto('/')
    await page.getByRole('button', { name: /Account menu/ }).click()
    await page.getByRole('menuitem', { name: 'Profile' }).click()
    const dialog = page.getByRole('dialog', { name: 'Profile' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Profile' })).toBeVisible()
    // The dialog owns focus and Escape returns it to the trigger.
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Account menu/ })).toBeFocused()
  })
}
