import { PDFDocument } from 'pdf-lib';

/** Builds a genuine PDF with the requested number of blank pages. */
export async function makePdf(pages = 1): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (let page = 0; page < pages; page += 1) document.addPage([595, 842]);
  return Buffer.from(await document.save());
}
