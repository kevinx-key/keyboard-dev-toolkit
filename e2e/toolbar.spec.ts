import { test, expect } from "@playwright/test";

const NAV_OPTS = { waitUntil: "networkidle" as const };

test.describe("FloatingToolbar buttons and actions", () => {
  test("Save and Download buttons are present", async ({ page }) => {
    await page.goto("/", NAV_OPTS);

    // Save button
    await expect(page.getByTestId("floating-save")).toBeVisible();
    await expect(page.getByTestId("floating-save")).toContainText("保存");

    // Download button
    await expect(page.getByTestId("floating-download")).toBeVisible();
    await expect(page.getByTestId("floating-download")).toContainText("下载");
  });

  test("Undo, Redo, Cut, Copy, Paste buttons are present", async ({ page }) => {
    await page.goto("/", NAV_OPTS);

    // These buttons are always rendered
    await expect(page.getByTestId("floating-undo")).toContainText("撤销");
    await expect(page.getByTestId("floating-redo")).toContainText("重做");
    await expect(page.getByTestId("floating-cut")).toBeVisible();
    await expect(page.getByTestId("floating-copy")).toBeVisible();
    await expect(page.getByTestId("floating-paste")).toBeVisible();
  });

  test("Add Key dropdown menu shows key count options", async ({ page }) => {
    await page.goto("/", NAV_OPTS);

    // The Add Key button has a split dropdown
    await expect(page.getByTestId("floating-add-key")).toBeVisible();
    await expect(page.getByTestId("floating-add-key")).toContainText("键");

    // Open the dropdown via the toggle
    await page.getByTestId("floating-add-key-toggle").click();

    // The dropdown should show key count options
    await expect(page.getByText("1 键", { exact: true })).toBeVisible();
    await expect(page.getByText("5 键", { exact: true })).toBeVisible();
    await expect(page.getByText("10 键", { exact: true })).toBeVisible();
    await expect(page.getByText("25 键", { exact: true })).toBeVisible();

    // Should also show special key types
    await expect(page.getByText("ISO Enter").first()).toBeVisible();
  });

  test("Delete Keys button is dimmed when nothing selected", async ({ page }) => {
    await page.goto("/", NAV_OPTS);

    // Add a key so there is something that could be selected
    await page.getByTestId("floating-add-key").click();

    // Delete button should be visible but dimmed (no selection)
    const deleteBtn = page.getByTestId("floating-delete");
    await expect(deleteBtn).toBeVisible();
    // Dimmed via opacity when nothing is selected
    await expect(deleteBtn).toHaveCSS("opacity", "0.3");
  });

  test("Download dropdown shows export options", async ({ page }) => {
    await page.goto("/", NAV_OPTS);

    // Click the Download button to open the dropdown
    await page.getByTestId("floating-download").click();

    // The dropdown should show various export formats
    await expect(page.getByText("SVG").first()).toBeVisible();
    await expect(page.getByText("PNG (1×)").first()).toBeVisible();
    await expect(page.getByText("JSON").first()).toBeVisible();
  });
});
