import { test, expect } from "@playwright/test";

test.describe("Theme switching", () => {
  test("Theme switcher is visible in navbar", async ({ page }) => {
    await page.goto("/");

    // Theme dropdown shows the current theme (default: "Classic")
    const themeLabel = page.getByText("Classic").first();
    await expect(themeLabel).toBeVisible();
  });

  test("Can switch from Classic to Dark theme", async ({ page }) => {
    await page.goto("/");

    // Click the theme dropdown (shows "Classic" by default)
    const themeBtn = page.getByText("Classic").first();
    await themeBtn.click();

    // The theme dropdown should show all three themes
    await expect(page.getByText("Dark")).toBeVisible();
    await expect(page.getByText("Material")).toBeVisible();

    // Switch to Dark
    await page.getByText("Dark").click();

    // After selecting Dark, the label should now show "Dark"
    await expect(page.getByText("Dark").first()).toBeVisible();

    // The html element should have the dark theme class
    const hasDarkClass = await page.evaluate(() =>
      document.documentElement.classList.contains("theme-dark")
    );
    expect(hasDarkClass).toBeTruthy();
  });

  test("Can switch from Classic to Material theme", async ({ page }) => {
    await page.goto("/");

    // Click theme dropdown
    const themeBtn = page.getByText("Classic").first();
    await themeBtn.click();

    // Switch to Material
    await page.getByText("Material").click();

    // Verify the label updates
    await expect(page.getByText("Material").first()).toBeVisible();

    // The html element should have the material theme class
    const hasMaterialClass = await page.evaluate(() =>
      document.documentElement.classList.contains("theme-material")
    );
    expect(hasMaterialClass).toBeTruthy();
  });

  test("Can cycle back to Classic theme", async ({ page }) => {
    // Start from Classic
    await page.goto("/");

    // Classic -> Dark
    await page.getByText("Classic").first().click();
    await page.getByText("Dark").click();
    let hasClass = await page.evaluate(() =>
      document.documentElement.classList.contains("theme-dark")
    );
    expect(hasClass).toBeTruthy();

    // Dark -> Material
    await page.getByText("Dark").first().click();
    await page.getByText("Material").click();
    hasClass = await page.evaluate(() =>
      document.documentElement.classList.contains("theme-material")
    );
    expect(hasClass).toBeTruthy();

    // Material -> Classic
    await page.getByText("Material").first().click();
    await page.getByText("Classic").click();
    hasClass = await page.evaluate(() =>
      document.documentElement.classList.contains("theme-classic")
    );
    expect(hasClass).toBeTruthy();
  });
});
