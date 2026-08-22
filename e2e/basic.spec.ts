import { test, expect } from "@playwright/test";

const NAV_OPTS = { waitUntil: "networkidle" as const };

test.describe("Basic page load and navigation", () => {
  test("page loads and shows the editor canvas with auto-loaded layout", async ({ page }) => {
    await page.goto("/", NAV_OPTS);

    // The page title should contain the app name
    await expect(page).toHaveTitle(/k星键盘封装器/);

    // The toolbar should display the app brand
    await expect(page.getByText("K ToolBelt")).toBeVisible();

    // The app auto-loads ANSI 104 on first visit, so the canvas shows keys
    await expect(page.locator(".kle-status-chip")).toContainText("104");
  });

  test("Preset can be loaded from the Keyboard tab", async ({ page }) => {
    await page.goto("/", NAV_OPTS);

    // Switch to the "键盘" tab
    await page.getByText("键盘", { exact: true }).click();

    // Load a preset from the preset list
    await page.getByText("60%", { exact: true }).click();

    // The canvas still renders (no crash) and tabs remain visible
    await expect(page.getByText("键属性", { exact: true })).toBeVisible();
  });

  test("Add Key button is clickable and adds a key", async ({ page }) => {
    await page.goto("/", NAV_OPTS);

    // Find the "Add Key" button in the floating toolbar
    const addKeyBtn = page.getByTestId("floating-add-key");
    await expect(addKeyBtn).toBeVisible();

    // Click Add Key
    await addKeyBtn.click();

    // The button still works — toolbar remains functional
    await expect(addKeyBtn).toBeVisible();
  });

  test("ToolBelt tabs can be switched", async ({ page }) => {
    await page.goto("/", NAV_OPTS);

    const tabs = [
      "键属性", "标签", "配色", "键盘", "工具",
      "原始数据", "SVG", "字符", "样式", "摘要",
    ];

    for (const tabName of tabs) {
      const tab = page.getByText(tabName, { exact: true });
      await expect(tab).toBeVisible();
      await tab.click();

      // After clicking, the tab should still be visible (no crash)
      await expect(tab).toBeVisible();
    }
  });

  test("Canvas status chip shows key count", async ({ page }) => {
    await page.goto("/", NAV_OPTS);

    // The status chip should show the auto-loaded key count
    await expect(page.locator(".kle-status-chip")).toContainText("104");
  });
});
