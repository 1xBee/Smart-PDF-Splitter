export type OutputMode = 'flatten' | 'by_original' | 'by_date';
export type ModelType = 'flash' | 'pro';

export interface AppSettings {
  outputMode: OutputMode;
  includeOriginal: boolean;
  manualReviewMode: boolean;
  minConfidence: number; // Threshold below which review is forced (0.0 - 1.0)
  modelType: ModelType;
}

export interface DocumentSegment {
  startPage: number; // 1-based index
  endPage: number;   // 1-based index
  deliveryId: string;
  customerName: string;
  customerId?: string; // Added customer ID specific field
  deliveryDate: string;
  confidence: number;
  needsReview?: boolean; // AI flag for uncertainty
  reviewReason?: string; // AI explanation for uncertainty
  finalFilename?: string; // The filename after any manual review or conflict resolution
}

export type ProcessingStatus = 'idle' | 'converting' | 'analyzing' | 'splitting' | 'waiting_review' | 'done' | 'error';

export interface ProcessedFile {
  id: string;
  file: File;
  status: ProcessingStatus;
  segments: DocumentSegment[];
  error?: string;
  originalName: string;
  timestamp: number;
  isDuplicate: boolean;
}

export interface HistoryItem {
  filename: string;
  processedAt: number;
  segments: DocumentSegment[];
}

export interface GeminiResponseSchema {
  segments: DocumentSegment[];
}

// Item awaiting review
export interface ReviewItem {
  id: string;
  originalFileId: string;
  originalFileName: string;
  data: Uint8Array; // The PDF binary
  filename: string; // The editable filename
  segment: DocumentSegment;
  timestamp: number; // Timestamp of the original file processing start
}