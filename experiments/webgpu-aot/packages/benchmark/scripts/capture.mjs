export async function capturePresentation(page, outputPath) {
  await page.locator("canvas").first().screenshot({ path: outputPath, type: "png" });
}
