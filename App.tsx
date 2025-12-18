import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { 
  AppSettings, 
  ProcessedFile, 
  HistoryItem, 
  ProcessingStatus,
  ReviewItem
} from './types';
import { convertPdfToImages, splitPdf } from './services/pdfService';
import { analyzeDocumentImages } from './services/geminiService';
import ProcessingQueue from './components/ProcessingQueue';
import HistoryPanel from './components/HistoryPanel';
import SettingsModal from './components/SettingsModal';
import ReviewModal from './components/ReviewModal';
import { 
  Upload, 
  Settings, 
  History, 
  Zap, 
  Play, 
  FileCheck,
  AlertTriangle,
  Loader,
  Plus,
} from 'lucide-react';

const BATCH_LIMIT = 50;

const App: React.FC = () => {
  // --- State ---
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProcessingId, setCurrentProcessingId] = useState<string | null>(null);
  const [processedCount, setProcessedCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistoryMobile, setShowHistoryMobile] = useState(false);
  
  // Sticky Header State
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  // Ref attached to the Action Card specifically to trigger sticky header immediately when controls leave view
  const heroRef = useRef<HTMLDivElement>(null);
  
  // Manual Review State
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [reviewModalFilter, setReviewModalFilter] = useState<'all' | 'flagged'>('all');
  
  const [settings, setSettings] = useState<AppSettings>({
    outputMode: 'by_date', // Default: Group by Date
    includeOriginal: false,
    manualReviewMode: true, 
    minConfidence: 0.8, // 80% default threshold
    modelType: 'flash', // Default to fast model
  });

  // Derived Lists
  const pendingFiles = files.filter(f => ['idle', 'converting', 'analyzing', 'splitting'].includes(f.status));
  const waitingReviewFiles = files.filter(f => f.status === 'waiting_review');
  const completedFiles = files.filter(f => ['done', 'error'].includes(f.status));

  // Refs for logic
  const zipRef = useRef<JSZip>(new JSZip());
  const processedInCurrentBatchRef = useRef(0);
  // Tracks used filenames per folder to handle duplicates correctly. Map<FolderName, Set<Filenames>>
  const folderContentMapRef = useRef<Map<string, Set<string>>>(new Map()); 
  const originalFilesBufferRef = useRef<Map<string, ArrayBuffer>>(new Map());

  // --- Load History on Mount ---
  useEffect(() => {
    const savedHistory = localStorage.getItem('splitter_history');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  // --- Sticky Header Observer ---
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show sticky header when the Action Card is obscured by the main header.
        // rootMargin -64px accounts for the fixed header height.
        // We check top < 100 to ensure we only trigger when scrolling DOWN (element goes up), not when it's below viewport.
        setShowStickyHeader(!entry.isIntersecting && entry.boundingClientRect.top < 100);
      },
      {
        threshold: 0,
        // Trigger exactly when the element slides under the 64px header
        rootMargin: '-64px 0px 0px 0px' 
      }
    );

    if (heroRef.current) {
      observer.observe(heroRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // --- Save History ---
  const addToHistory = (item: HistoryItem) => {
    setHistory(prev => {
      const newHistory = [...prev, item];
      localStorage.setItem('splitter_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  // --- File Upload Handler ---
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles: ProcessedFile[] = Array.from(event.target.files).map((file: File) => {
        const isDuplicate = history.some(h => h.filename === file.name);
        return {
          id: Math.random().toString(36).substring(7),
          file,
          status: 'idle',
          segments: [],
          originalName: file.name,
          timestamp: Date.now(),
          isDuplicate
        };
      });
      setFiles(prev => [...prev, ...newFiles]);
    }
    event.target.value = '';
  };

  const handleRemoveFile = (id: string) => {
    const fileToRemove = files.find(f => f.id === id);
    if (!fileToRemove) return;

    // If removing from review queue, also clean up the segments
    if (fileToRemove.status === 'waiting_review') {
        setReviewQueue(prev => prev.filter(item => item.originalFileId !== id));
        originalFilesBufferRef.current.delete(id);
    }

    setFiles(prev => prev.filter(f => f.id !== id));
  };

  // --- Processing Logic ---
  const processQueue = async () => {
    if (isProcessing) return;

    setIsProcessing(true);

    const filesToProcess = files.filter(f => f.status === 'idle');
    if (filesToProcess.length === 0) {
      setIsProcessing(false);
      return;
    }

    // Initialize zip only if we are starting fresh and not in manual mode
    if (processedInCurrentBatchRef.current === 0 && !settings.manualReviewMode) {
       zipRef.current = new JSZip();
       folderContentMapRef.current.clear();
       originalFilesBufferRef.current.clear();
    }

    try {
      for (const fileData of filesToProcess) {
        // Double check file still exists (user might have removed it pending)
        if (!files.some(f => f.id === fileData.id)) continue;

        setCurrentProcessingId(fileData.id);
        updateFileStatus(fileData.id, 'converting');
        
        try {
          // Convert to images (PNG) AND extract text layer
          const pdfData = await convertPdfToImages(fileData.file);
          updateFileStatus(fileData.id, 'analyzing');

          const segmentsRaw = await analyzeDocumentImages(
             pdfData, 
             settings.minConfidence,
             settings.modelType
          );
          const segments = Array.isArray(segmentsRaw) ? segmentsRaw : [];

          // Handle empty segments (no delivery found) - PREVENT CRASH
          if (segments.length === 0) {
             setFiles(prev => prev.map(f => f.id === fileData.id ? { 
                 ...f, 
                 segments: [], 
                 status: 'done', 
                 error: 'No documents identified' 
             } : f));
             
             addToHistory({
                filename: fileData.originalName,
                processedAt: fileData.timestamp,
                segments: []
             });
          } else {
              // Documents found, proceed to split
              setFiles(prev => prev.map(f => f.id === fileData.id ? { ...f, segments } : f));

              updateFileStatus(fileData.id, 'splitting');
              const splitResults = await splitPdf(fileData.file, segments);

              // Handle case where segments exist but splitting fails (e.g. invalid pages resulting in no files)
              if (splitResults.length === 0) {
                  updateFileStatus(fileData.id, 'error', "Invalid page ranges or empty documents");
              } else {
                  // CHECK FOR REVIEW FLAGS
                  // If any segment has explicit needsReview OR confidence is below threshold
                  const needsForcedReview = segments.some(s => s.needsReview || s.confidence < settings.minConfidence);

                  // Decide logic: Manual Mode OR Forced Review
                  if (settings.manualReviewMode || needsForcedReview) {
                     const newReviewItems: ReviewItem[] = splitResults.map((res, idx) => ({
                         id: `${fileData.id}_${idx}`,
                         originalFileId: fileData.id,
                         originalFileName: fileData.originalName,
                         data: res.data,
                         filename: res.filename.replace(/\.pdf$/i, ''),
                         segment: segments[idx],
                         timestamp: fileData.timestamp
                     }));
                     
                     setReviewQueue(prev => [...prev, ...newReviewItems]);
                     
                     if (settings.includeOriginal || needsForcedReview) {
                        originalFilesBufferRef.current.set(fileData.id, await fileData.file.arrayBuffer());
                     }

                     updateFileStatus(fileData.id, 'waiting_review');

                     // If forcing review on automatic mode, trigger the modal and filter to flagged
                     if (!settings.manualReviewMode && needsForcedReview) {
                        setReviewModalFilter('flagged');
                        setShowReviewModal(true);
                        // We also pause the batch here effectively because the modal opens
                     } else {
                        // Standard manual mode
                        if (settings.manualReviewMode && !showReviewModal) {
                           // We don't necessarily open modal immediately per file in manual mode, 
                           // but we set filter to 'all' for when user opens it.
                           setReviewModalFilter('all');
                        }
                     }

                  } else {
                     // Automatic Mode AND High Confidence -> Process immediately
                     await addToZip(fileData, splitResults);
                     updateFileStatus(fileData.id, 'done');
                     
                     addToHistory({
                        filename: fileData.originalName,
                        processedAt: fileData.timestamp,
                        segments: segments
                     });
                  }
              }
          }

          setProcessedCount(prev => prev + 1);
          processedInCurrentBatchRef.current++;

          if (processedInCurrentBatchRef.current >= BATCH_LIMIT) {
             break;
          }

        } catch (error: any) {
          console.error("File processing error:", error);
          updateFileStatus(fileData.id, 'error', error.message || "Processing failed");
        }
      }
      
      // Automatic mode batch download
      // Only download automatically if we haven't been interrupted by a forced review
      const hasPendingReviews = files.some(f => f.status === 'waiting_review');
      if (!settings.manualReviewMode && !hasPendingReviews && processedInCurrentBatchRef.current > 0) {
          await downloadBatch();
      }

    } finally {
      setIsProcessing(false);
      setCurrentProcessingId(null);
    }
  };

  const updateFileStatus = (id: string, status: ProcessingStatus, error?: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, status, error } : f));
  };

  // --- Zip Helper Utilities ---
  
  /**
   * Generates a unique filename within a virtual folder (string path).
   * Checks against a Set of existing names in that folder.
   */
  const getUniqueName = (map: Map<string, Set<string>>, folder: string, filename: string): string => {
    if (!map.has(folder)) {
      map.set(folder, new Set());
    }
    const usedNames = map.get(folder)!;
    
    let uniqueName = filename;
    let counter = 1;
    const baseName = filename.replace(/\.pdf$/i, '');
    
    // While the name exists in this folder, increment counter
    while(usedNames.has(uniqueName)) {
      uniqueName = `${baseName}_(${counter}).pdf`;
      counter++;
    }
    
    usedNames.add(uniqueName);
    return uniqueName;
  };

  const addToZip = async (fileData: ProcessedFile, splitResults: { filename: string; data: Uint8Array }[]) => {
    const zip = zipRef.current;
    
    splitResults.forEach((res, idx) => {
      const segment = fileData.segments[idx];
      let targetFolder = "";

      if (settings.outputMode === 'by_original') {
        targetFolder = fileData.originalName.replace(/\.pdf$/i, '');
      } else if (settings.outputMode === 'by_date') {
        // Fallback to "Undated" if AI missed the date
        targetFolder = segment.deliveryDate || 'Undated';
      }
      // If flatten, targetFolder stays ""

      // Ensure filename is unique in this target folder
      const uniqueName = getUniqueName(folderContentMapRef.current, targetFolder, res.filename);

      if (targetFolder) {
        zip.folder(targetFolder)?.file(uniqueName, res.data);
      } else {
        zip.file(uniqueName, res.data);
      }
    });

    if (settings.includeOriginal) {
      const originalData = await fileData.file.arrayBuffer();
      // Logic for Original File location:
      // If Flatten or By Date: Put in Root (because original might span multiple dates)
      // If By Original: Put in the folder
      let targetFolder = "";
      let originalName = `original_${fileData.originalName}`;

      if (settings.outputMode === 'by_original') {
        targetFolder = fileData.originalName.replace(/\.pdf$/i, '');
        // We can keep the simple name inside its own folder
        originalName = `original_${fileData.originalName}`; 
      }

      const uniqueName = getUniqueName(folderContentMapRef.current, targetFolder, originalName);

      if (targetFolder) {
        zip.folder(targetFolder)?.file(uniqueName, originalData);
      } else {
        zip.file(uniqueName, originalData);
      }
    }
  };

  // --- Review Save ---
  const handleReviewSave = async (itemsToSave: ReviewItem[], initialSessionIds: Set<string>) => {
      // 1. Update History with manual filenames
      setHistory(prev => {
        const newHistory = [...prev];
        return newHistory;
      });

      // 2. Add to Zip (Use a fresh zip for this specific download)
      const exportZip = new JSZip(); 
      // Local map for this specific export session to handle duplicates
      const exportFolderMap = new Map<string, Set<string>>();

      for (const item of itemsToSave) {
          const finalName = `${item.filename}.pdf`;
          let targetFolder = "";

          if (settings.outputMode === 'by_original') {
             targetFolder = item.originalFileName.replace(/\.pdf$/i, '');
          } else if (settings.outputMode === 'by_date') {
             targetFolder = item.segment.deliveryDate || 'Undated';
          }

          const uniqueName = getUniqueName(exportFolderMap, targetFolder, finalName);

          if (targetFolder) {
            exportZip.folder(targetFolder)?.file(uniqueName, item.data);
          } else {
            exportZip.file(uniqueName, item.data);
          }
      }

      // Add Originals if requested
      if (settings.includeOriginal) {
          const originalIds = new Set(itemsToSave.map(i => i.originalFileId));
          for (const originalId of originalIds) {
              const buffer = originalFilesBufferRef.current.get(originalId);
              const originalItem = itemsToSave.find(i => i.originalFileId === originalId);
              const originalFileName = originalItem?.originalFileName || "unknown.pdf";
              
              if (buffer) {
                 let targetFolder = "";
                 let finalOriginalName = `original_${originalFileName}`;

                 if (settings.outputMode === 'by_original') {
                    targetFolder = originalFileName.replace(/\.pdf$/i, '');
                 }

                 const uniqueName = getUniqueName(exportFolderMap, targetFolder, finalOriginalName);
                 
                 if (targetFolder) {
                    exportZip.folder(targetFolder)?.file(uniqueName, buffer);
                 } else {
                    exportZip.file(uniqueName, buffer);
                 }
              }
          }
      }

      // 3. Download
      const content = await exportZip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smart_split_reviewed_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // 4. Update Status and History for Processed Files
      // We determine which original files are now "fully handled" based on the items in the SESSION.
      const processedOriginalIds = new Set<string>();
      
      // Look at the IDs that were initially presented in the modal (initialSessionIds)
      reviewQueue.forEach(item => {
          if (initialSessionIds.has(item.id)) {
              processedOriginalIds.add(item.originalFileId);
          }
      });
      
      setFiles(prev => prev.map(f => {
          if (processedOriginalIds.has(f.id) && f.status === 'waiting_review') {
              return { ...f, status: 'done' };
          }
          return f;
      }));

      // Add to history
      processedOriginalIds.forEach(id => {
          const file = files.find(f => f.id === id);
          const savedSegments = itemsToSave
            .filter(i => i.originalFileId === id)
            .map(i => ({...i.segment, finalFilename: i.filename + '.pdf'}));

          if (file) {
              addToHistory({
                  filename: file.originalName,
                  processedAt: file.timestamp,
                  segments: savedSegments
              });
          }
      });

      // 5. Cleanup
      setReviewQueue(prev => prev.filter(item => !initialSessionIds.has(item.id)));
      
      processedOriginalIds.forEach(id => {
           originalFilesBufferRef.current.delete(id);
      });

      setShowReviewModal(false);
  };

  const downloadBatch = async () => {
    const content = await zipRef.current.generateAsync({ type: 'blob' });
    const url = window.URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart_split_batch_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    zipRef.current = new JSZip();
    processedInCurrentBatchRef.current = 0;
    folderContentMapRef.current.clear();
    originalFilesBufferRef.current.clear();
  };

  const handleExportCSV = () => {
    let csv = "Original Filename,Processed Date,Generated Filename,Delivery ID,Customer Name,Customer ID,Date Found,Confidence,Review Flag,Review Reason,Pages\n";
    history.forEach(h => {
        const dateStr = new Date(h.processedAt).toISOString();
        if (h.segments && h.segments.length > 0) {
            h.segments.forEach(seg => {
                const safeId = (seg.deliveryId || '').replace(/,/g, ' ');
                const safeCust = (seg.customerName || '').replace(/,/g, ' ');
                const safeCustId = (seg.customerId || '').replace(/,/g, ' ');
                const safeDate = (seg.deliveryDate || '').replace(/,/g, ' ');
                const reviewFlag = seg.needsReview ? "Yes" : "No";
                const reviewReason = (seg.reviewReason || "").replace(/,/g, ' ');
                
                // Use the reviewed filename if available, otherwise reconstruct default
                const genName = seg.finalFilename || `${safeId}_${safeDate}_${safeCust}${safeCustId ? `_${safeCustId}` : ''}.pdf`;
                
                csv += `"${h.filename}","${dateStr}","${genName}","${safeId}","${safeCust}","${safeCustId}","${safeDate}","${seg.confidence}","${reviewFlag}","${reviewReason}","${seg.startPage}-${seg.endPage}"\n`;
            });
        } else {
            csv += `"${h.filename}","${dateStr}","(No segments)","","","","","","","",""\n`;
        }
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "master_log.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenReview = () => {
      setReviewModalFilter('all');
      setShowReviewModal(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row">
      
      {showHistoryMobile && (
        <div className="fixed inset-0 z-20 bg-black/20 md:hidden" onClick={() => setShowHistoryMobile(false)}></div>
      )}

      <div className={`flex-1 flex flex-col transition-all duration-300 ${showHistoryMobile ? 'opacity-50 md:opacity-100' : ''}`}>
        
        {/* Main Application Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 flex-shrink-0">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-2 cursor-pointer" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
              <div className="bg-brand-600 p-1.5 rounded-lg text-white">
                <Zap size={20} fill="currentColor" />
              </div>
              <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-600 to-brand-500">
                Smart PDF Splitter
              </h1>
            </div>

            <div className="flex items-center space-x-3">
               <button 
                onClick={() => setShowSettings(true)}
                className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors"
                title="Settings"
                disabled={isProcessing}
              >
                <Settings size={20} />
              </button>
              <button 
                onClick={() => setShowHistoryMobile(!showHistoryMobile)}
                className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors md:hidden"
              >
                <History size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* Squeezed / Sticky Action Bar */}
        <div className={`fixed top-16 left-0 right-0 md:right-80 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm z-20 transition-all duration-300 transform ${showStickyHeader ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}>
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            {/* Left: Mini Upload */}
            <div className="flex items-center space-x-4">
               <div className="relative group">
                  <input
                    type="file"
                    multiple
                    accept="application/pdf"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={isProcessing}
                  />
                  <button className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 pl-3 pr-4 py-1.5 rounded-full font-medium transition-colors border border-slate-200">
                      <div className="bg-white p-1 rounded-full shadow-sm text-brand-600">
                        <Plus size={14} />
                      </div>
                      <span className="text-sm">Add PDFs</span>
                  </button>
               </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center space-x-3">
               
               {/* Stats (Desktop only) */}
               <div className="hidden sm:flex flex-col items-end mr-3 px-3 border-r border-slate-200/60">
                 <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Processed</span>
                 <span className="text-sm font-bold text-slate-700">{processedCount}</span>
               </div>

               {reviewQueue.length > 0 && (
                   <button 
                     onClick={handleOpenReview}
                     className="flex items-center px-4 py-1.5 bg-amber-100 text-amber-700 hover:bg-amber-200 hover:text-amber-800 rounded-full font-semibold text-sm transition-colors"
                   >
                     <FileCheck size={16} className="mr-1.5" />
                     Review ({reviewQueue.length})
                   </button>
               )}

               <button 
                   onClick={processQueue}
                   disabled={isProcessing || pendingFiles.filter(f => f.status === 'idle').length === 0}
                   className={`flex items-center px-4 py-1.5 rounded-full font-bold text-sm transition-all shadow-md ${
                     isProcessing 
                       ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                       : pendingFiles.filter(f => f.status === 'idle').length === 0
                         ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                         : 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-500/20'
                   }`}
                 >
                   {isProcessing ? (
                     <>
                       <Loader size={16} className="animate-spin mr-1.5" /> Processing
                     </>
                   ) : (
                     <>
                       <Play size={16} fill="currentColor" className="mr-1.5" /> Start
                     </>
                   )}
                 </button>
            </div>
          </div>
        </div>

        <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 flex-1">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 col-span-2">
              <h2 className="text-xl font-semibold mb-2">Upload Scans</h2>
              <p className="text-slate-500 text-sm mb-6">
                Drag and drop your bulk PDF scans here. The AI will automatically split them by delivery ID.
              </p>
              
              <div className="relative group">
                <input
                  type="file"
                  multiple
                  accept="application/pdf"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  disabled={isProcessing}
                />
                <div className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all ${isProcessing ? 'bg-slate-50 border-slate-200 cursor-not-allowed' : 'bg-brand-50 border-brand-200 group-hover:border-brand-400'}`}>
                   <div className="bg-white p-3 rounded-full shadow-sm mb-3 text-brand-500">
                     <Upload size={24} />
                   </div>
                   <p className="font-medium text-brand-700">Click to upload or drag files</p>
                   <p className="text-xs text-brand-400 mt-1">PDF files only</p>
                </div>
              </div>
            </div>

            <div ref={heroRef} className="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-6 rounded-xl shadow-lg flex flex-col justify-between">
               <div>
                 <h3 className="text-slate-300 font-medium text-sm flex items-center">
                   <FileCheck size={16} className="mr-2" /> Session Processed
                 </h3>
                 <p className="text-4xl font-bold mt-2">{processedCount}</p>
                 {reviewQueue.length > 0 && (
                   <span className="inline-block mt-2 text-xs bg-amber-500/20 border border-amber-500/30 rounded px-2 py-0.5 text-amber-200">
                     {reviewQueue.length} docs awaiting review
                   </span>
                 )}
               </div>
               
               <div className="mt-6">
                 <button 
                     onClick={handleOpenReview}
                     disabled={reviewQueue.length === 0}
                     className="w-full mb-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 disabled:text-slate-400 text-white text-sm font-bold rounded flex items-center justify-center shadow-md transition-all active:scale-95"
                   >
                     <FileCheck size={16} className="mr-2" />
                     Review Pending
                 </button>
                 
                 <button 
                   onClick={processQueue}
                   disabled={isProcessing || pendingFiles.filter(f => f.status === 'idle').length === 0}
                   className={`w-full py-3 rounded-lg font-bold flex items-center justify-center transition-all ${
                     isProcessing 
                       ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                       : pendingFiles.filter(f => f.status === 'idle').length === 0
                         ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                         : 'bg-brand-500 hover:bg-brand-400 text-white shadow-lg shadow-brand-900/20'
                   }`}
                 >
                   {isProcessing ? (
                     <>
                       <Loader size={18} className="animate-spin mr-2" /> Processing...
                     </>
                   ) : (
                     <>
                       <Play size={18} fill="currentColor" className="mr-2" /> Start Process
                     </>
                   )}
                 </button>
               </div>
            </div>
          </div>

          {files.some(f => f.isDuplicate && f.status === 'idle') && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start">
              <AlertTriangle size={20} className="text-amber-500 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-semibold text-amber-800">Duplicates Detected</h4>
                <p className="text-sm text-amber-700 mt-1">
                  Some files in the queue have been processed before (highlighted in yellow). 
                  They will be processed again if you continue.
                </p>
              </div>
            </div>
          )}

          {/* Processing Queue (Pending) */}
          <ProcessingQueue 
              files={pendingFiles} 
              title="Processing Queue" 
              onRemove={handleRemoveFile} 
              variant="queue"
          />

          {/* Pending Review Queue - NEW */}
          {waitingReviewFiles.length > 0 && (
            <ProcessingQueue 
                files={waitingReviewFiles} 
                title="Files Pending Review" 
                onRemove={handleRemoveFile} 
                variant="pending"
                minConfidence={settings.minConfidence}
            />
          )}

          {/* Completed Queue (Done/Error) */}
          {completedFiles.length > 0 && (
            <ProcessingQueue 
                files={completedFiles} 
                title="Completed Files" 
                onRemove={handleRemoveFile} 
                variant="completed"
            />
          )}

          {files.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg border border-dashed border-slate-300">
               <p className="text-slate-500">No files in queue. Upload PDFs to start.</p>
            </div>
          )}

        </main>
      </div>

      <div className={`md:flex-none md:w-80 bg-white border-l border-slate-200 ${showHistoryMobile ? 'fixed inset-y-0 right-0 z-30 shadow-2xl block' : 'hidden md:block'}`}>
         <HistoryPanel 
            history={history} 
            onExportMasterCSV={handleExportCSV} 
            onCloseMobile={() => setShowHistoryMobile(false)}
         />
      </div>

      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSave={setSettings}
      />

      <ReviewModal 
        isOpen={showReviewModal}
        reviewItems={reviewQueue}
        defaultFilter={reviewModalFilter}
        minConfidence={settings.minConfidence}
        onSaveAndDownload={handleReviewSave}
        onCancel={() => setShowReviewModal(false)}
      />

    </div>
  );
};

export default App;