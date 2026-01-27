import { chromium } from 'playwright';

export interface PngExportOptions {
  width?: number;
  height?: number;
  fullPage?: boolean;
  deviceScaleFactor?: number;
}

export async function renderHtmlToPng(
  html: string,
  options: PngExportOptions = {}
): Promise<Buffer> {
  const {
    width = 1280,
    height = 720,
    fullPage = true,
    deviceScaleFactor = 2,
  } = options;

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor,
  });

  await page.setContent(html, { waitUntil: 'networkidle' });

  const buffer = await page.screenshot({
    fullPage,
    type: 'png',
  });

  await page.close();
  await browser.close();

  return buffer;
}
