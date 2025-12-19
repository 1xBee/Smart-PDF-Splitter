export type OutputMode = 'flatten' | 'by_original' | 'by_date';
export type ModelType = 'flash' | 'pro';
export type VerificationStatus = 'verified' | 'mismatch' | 'not_found' | 'unknown';

export interface AppSettings {
  outputMode: OutputMode;
  includeOriginal: boolean;
  manualReviewMode: boolean;
  minConfidence: number; // Threshold below which review is forced (0.0 - 1.0)
  modelType: ModelType;
}

/**
 * Database Entry Schema
 * Represents a single record in the master database JSON file.
 */
export interface DbEntry {
  id: string;           // Primary key - matches AI 'deliveryId' (e.g., "DLV-001", "INV-1234")
  orderId: string;      // Secondary key - matches AI 'customerId' (e.g., "8971", "#12345")
  customers: string;    // Official customer name - used for filename when verified
  dateCreated?: string; // Optional creation date for reference
}

/**
 * Document Segment with Verification
 * Extended to include database verification results
 */
export interface DocumentSegment {
  startPage: number;              // 1-based index
  endPage: number;                // 1-based index
  deliveryId: string;             // AI-extracted delivery/invoice ID
  customerName: string;           // AI-extracted or DB-corrected customer name
  customerId?: string;            // AI-extracted customer ID
  deliveryDate: string;           // AI-extracted date
  confidence: number;             // AI confidence score (0.0-1.0)
  needsReview?: boolean;          // AI or verification flag for uncertainty
  reviewReason?: string;          // Explanation for review flag
  
  // VERIFICATION FIELDS
  verificationStatus?: VerificationStatus; // Database verification result
  dbMatch?: DbEntry;              // Reference to matching DB record (if found)
  
  // FINAL OUTPUT
  finalFilename?: string;         // The filename after manual review or auto-generation
}

export type ProcessingStatus = 
  | 'idle' 
  | 'converting' 
  | 'analyzing' 
  | 'splitting' 
  | 'waiting_review' 
  | 'done' 
  | 'error';

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

/**
 * Review Item - Document awaiting manual review
 */
export interface ReviewItem {
  id: string;
  originalFileId: string;
  originalFileName: string;
  data: Uint8Array;               // The PDF binary
  filename: string;               // The editable filename (without .pdf extension)
  segment: DocumentSegment;       // Includes verification data
  timestamp: number;
}