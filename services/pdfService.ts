import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import { DocumentSegment } from '../types';

// Initialize PDF.js worker
// Use a specific version if the library doesn't export one reliably, matching importmap
const WORKER_VERSION = pdfjsLib.version || '5.4.449';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${WORKER_VERSION}/build/pdf.worker.min.mjs`;

/**
 * Converts all pages of a PDF file to Base64 PNG images and extracts text layer.
 * PNG is used for lossless quality to help OCR.
 * Text layer is extracted to provide ground truth to Gemini if available.
 */
export const convertPdfToImages = async (file: File): Promise<{ images: string[], texts: string[] }> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  const images: string[] = [];
  const texts: string[] = [];
  const totalPages = pdf.numPages;

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    
    // 1. Render Image
    // Scale 2.5 provides good balance of clarity vs performance
    const viewport = page.getViewport({ scale: 2.5 }); 
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) throw new Error("Could not create canvas context");

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport,
    } as any).promise;

    // Convert to PNG (Lossless, better for text sharpness than JPEG)
    const base64 = canvas.toDataURL('image/png');
    // Remove the data URL prefix for Gemini
    images.push(base64.split(',')[1]);

    // 2. Extract Text Layer
    // If the PDF has embedded text (OCR already done or digital origin), this is far superior to image analysis.
    try {
        const textContent = await page.getTextContent();
        // Concatenate text items. We lose some layout info, but Gemini is smart enough to infer.
        // We basically give it the "raw string" of the page.
        const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ');
        texts.push(pageText);
    } catch (e) {
        console.warn(`Could not extract text from page ${i}`, e);
        texts.push(""); // Fallback to empty string
    }
  }

  return { images, texts };
};

/**
 * Splits the original PDF based on identified segments.
 * Returns an array of objects containing the filename and the binary data.
 */
export const splitPdf = async (
  file: File, 
  segments: DocumentSegment[]
): Promise<{ filename: string; data: Uint8Array }[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(arrayBuffer);
  
  const results: { filename: string; data: Uint8Array }[] = [];
  const usedNames = new Set<string>();

  for (const segment of segments) {
    // Create a new PDF
    const subDoc = await PDFDocument.create();
    
    // Calculate page indices (0-based)
    // Ensure we don't go out of bounds
    const start = Math.max(0, segment.startPage - 1);
    const end = Math.min(srcDoc.getPageCount() - 1, segment.endPage - 1);
    
    const pageIndices = [];
    for (let i = start; i <= end; i++) {
      pageIndices.push(i);
    }

    if (pageIndices.length === 0) continue;

    // Copy pages
    const copiedPages = await subDoc.copyPages(srcDoc, pageIndices);
    copiedPages.forEach((page) => subDoc.addPage(page));

    // Generate clean filename
    const safeId = (segment.deliveryId || 'Unknown').replace(/[^a-z0-9]+/gi, '_');
    const safeCustomer = (segment.customerName || 'Customer').replace(/[^a-z0-9]+/gi, '_');
    const safeDate = (segment.deliveryDate || 'Date').replace(/[^a-z0-9]+/gi, '-');
    const safeCustId = segment.customerId ? segment.customerId.replace(/[^a-z0-9]+/gi, '') : '';
    
    // Filename format: ID_Date_CustomerName_CustomerID.pdf
    let filename = `${safeId}_${safeDate}_${safeCustomer}${safeCustId ? `_${safeCustId}` : ''}.pdf`;
    
    // Ensure uniqueness within this split batch to avoid overwriting
    let counter = 1;
    const baseName = filename.replace(/\.pdf$/i, '');
    while (usedNames.has(filename)) {
        filename = `${baseName}_(${counter}).pdf`;
        counter++;
    }
    usedNames.add(filename);

    const pdfBytes = await subDoc.save();

    results.push({
      filename,
      data: pdfBytes,
    });
  }

  return results;
};