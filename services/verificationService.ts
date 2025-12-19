import { DocumentSegment, DbEntry } from '../types';

/**
 * Verifies a document segment against the master database.
 * Assumes data is already clean and formatted consistently.
 * 
 * Verification Process:
 * 1. Find matching record by delivery ID (direct comparison)
 * 2. If found, verify customer ID matches
 * 3. Return verification status and corrections
 * 
 * Verification Statuses:
 * - 'verified': Both IDs match, use DB name for filename
 * - 'mismatch': Delivery ID found but customer ID doesn't match (CRITICAL FLAG)
 * - 'not_found': Delivery ID not in database (CRITICAL FLAG)
 * 
 * @param segment - The AI-extracted document segment
 * @param database - The master database array
 * @returns Enhanced segment with verification data
 */
export const verifyDocument = (
  segment: DocumentSegment,
  database: DbEntry[]
): DocumentSegment => {
  // Step 1: Find matching record by delivery ID (direct comparison)
  const dbRecord = database.find(db => db.id == segment.deliveryId);
  
  // Case 1: Delivery ID not found in database
  if (!dbRecord) {
    return {
      ...segment,
      verificationStatus: 'not_found',
      needsReview: true,
      reviewReason: segment.reviewReason 
        ? `${segment.reviewReason} | Delivery ID "${segment.deliveryId}" not found in database`
        : `Delivery ID "${segment.deliveryId}" not found in database`
    };
  }
  
  // Step 2: Check if customer ID matches
  if (segment.customerId && dbRecord.orderId != segment.customerId.replace(/^#/, "")) {
    return {
      ...segment,
      verificationStatus: 'mismatch',
      dbMatch: dbRecord,
      needsReview: true,
      reviewReason: `CRITICAL: Customer ID mismatch! AI extracted "${segment.customerId}" but database shows "${dbRecord.orderId}" for this delivery. Please verify the document.`
    };
  }
  
  // Case 3: Verified - Both IDs match
  // Use the official customer name from the database
  return {
    ...segment,
    verificationStatus: 'verified',
    dbMatch: dbRecord,
    customerName: dbRecord.customers, // Override AI name with DB name
    needsReview: segment.needsReview || false, // Keep any existing AI flags
    reviewReason: segment.reviewReason // Preserve AI review reason if any
  };
};

/**
 * Batch verification for multiple segments.
 * Useful for verifying all segments of a document at once.
 * 
 * @param segments - Array of document segments to verify
 * @param database - The master database array
 * @returns Array of verified segments
 */
export const verifyDocuments = (
  segments: DocumentSegment[],
  database: DbEntry[]
): DocumentSegment[] => {
  return segments.map(segment => verifyDocument(segment, database));
};

/**
 * Generates statistics about verification results.
 * Useful for reporting and quality assurance.
 * 
 * @param segments - Array of verified segments
 * @returns Statistics object
 */
export const getVerificationStats = (segments: DocumentSegment[]) => {
  const total = segments.length;
  const verified = segments.filter(s => s.verificationStatus === 'verified').length;
  const mismatched = segments.filter(s => s.verificationStatus === 'mismatch').length;
  const notFound = segments.filter(s => s.verificationStatus === 'not_found').length;
  const needsReview = segments.filter(s => s.needsReview).length;
  
  return {
    total,
    verified,
    mismatched,
    notFound,
    needsReview,
    verificationRate: total > 0 ? (verified / total * 100).toFixed(1) : '0.0'
  };
};