import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { 
  AppSettings, 
  ProcessedFile, 
  HistoryItem, 
  ProcessingStatus,
  ReviewItem,
  DbEntry
} from './types';
import { convertPdfToImages, splitPdf } from './services/pdfService';
import { analyzeDocumentImages } from './services/geminiService';
import { verifyDocument } from './services/verificationService';
import ProcessingQueue from './components/ProcessingQueue';
import HistoryPanel from './components/HistoryPanel';
import SettingsModal from './components/SettingsModal';
import ReviewModal from './components/ReviewModal';
import DatabaseCard from './components/DatabaseCard';
import UploadCard from './components/UploadCard';
import ActionCard from './components/ActionCard';
import { 
  Settings, 
  History, 
  Zap,
} from 'lucide-react';

const BATCH_LIMIT = 50;

const App: React.FC = () => {
  // --- State ---
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [database, setDatabase] = useState<DbEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProcessingId, setCurrentProcessingId] = useState<string | null>(null);
  const [processedCount, setProcessedCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistoryMobile, setShowHistoryMobile] = useState(false);
  
  // Sticky Header State
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  
  // Manual Review State
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [reviewModalFilter, setReviewModalFilter] = useState<'all' | 'flagged'>('all');
  
  const [settings, setSettings] = useState<AppSettings>({
    outputMode: 'by_date',
    includeOriginal: false,
    manualReviewMode: true, 
    minConfidence: 0.8,
    modelType: 'flash',
  });

  // Derived Lists
  const pendingFiles = files.filter(f => ['idle', 'converting', 'analyzing', 'splitting'].includes(f.status));
  const waitingReviewFiles = files.filter(f => f.status === 'waiting_review');
  const completedFiles = files.filter(f => ['done', 'error'].includes(f.status));

  // Refs for logic
  const zipRef = useRef<JSZip>(new JSZip());
  const processedInCurrentBatchRef = useRef(0);
  const folderContentMapRef = useRef<Map<string, Set<string>>>(new Map()); 
  const originalFilesBufferRef = useRef<Map<string, ArrayBuffer>>(new Map());

  // --- Load History and Database on Mount ---
  useEffect(() => {
    const savedHistory = localStorage.getItem('splitter_history');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
    
    const savedDb = localStorage.getItem('splitter_database');
    if (savedDb) {
      setDatabase(JSON.parse(savedDb));
    }
  }, []);

  // --- Sticky Header Observer ---
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowStickyHeader(!entry.isIntersecting && entry.boundingClientRect.top < 100);
      },
      {
        threshold: 0,
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

  // --- Database Management ---
  const handleDatabaseUpdate = (newDb: DbEntry[]) => {
    setDatabase(newDb);
    localStorage.setItem('splitter_database', JSON.stringify(newDb));
  };

  const handleDatabaseClear = () => {
    setDatabase([]);
    localStorage.removeItem('splitter_database');
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

    if (processedInCurrentBatchRef.current === 0 && !settings.manualReviewMode) {
       zipRef.current = new JSZip();
       folderContentMapRef.current.clear();
       originalFilesBufferRef.current.clear();
    }

    try {
      for (const fileData of filesToProcess) {
        if (!files.some(f => f.id === fileData.id)) continue;

        setCurrentProcessingId(fileData.id);
        updateFileStatus(fileData.id, 'converting');
        
        try {
          const pdfData = await convertPdfToImages(fileData.file);
          updateFileStatus(fileData.id, 'analyzing');

          const segmentsRaw = await analyzeDocumentImages(
             pdfData, 
             settings.minConfidence,
             settings.modelType
          );
          const segments = Array.isArray(segmentsRaw) ? segmentsRaw : [];

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
              // VERIFY AGAINST DATABASE
              const verifiedSegments = segments.map(seg => verifyDocument(seg, database));
              
              setFiles(prev => prev.map(f => f.id === fileData.id ? { ...f, segments: verifiedSegments } : f));

              updateFileStatus(fileData.id, 'splitting');
              const splitResults = await splitPdf(fileData.file, verifiedSegments);

              if (splitResults.length === 0) {
                  updateFileStatus(fileData.id, 'error', "Invalid page ranges or empty documents");
              } else {
                  // Check for verification failures or low confidence
                  const needsForcedReview = verifiedSegments.some(s => 
                    s.needsReview || 
                    s.confidence < settings.minConfidence ||
                    s.verificationStatus === 'mismatch' ||
                    s.verificationStatus === 'not_found'
                  );

                  if (settings.manualReviewMode || needsForcedReview) {
                     const newReviewItems: ReviewItem[] = splitResults.map((res, idx) => ({
                         id: `${fileData.id}_${idx}`,
                         originalFileId: fileData.id,
                         originalFileName: fileData.originalName,
                         data: res.data,
                         filename: res.filename.replace(/\.pdf$/i, ''),
                         segment: verifiedSegments[idx],
                         timestamp: fileData.timestamp
                     }));
                     
                     setReviewQueue(prev => [...prev, ...newReviewItems]);
                     
                     if (settings.includeOriginal || needsForcedReview) {
                        originalFilesBufferRef.current.set(fileData.id, await fileData.file.arrayBuffer());
                     }

                     updateFileStatus(fileData.id, 'waiting_review');

                     if (!settings.manualReviewMode && needsForcedReview) {
                        setReviewModalFilter('flagged');
                        setShowReviewModal(true);
                     } else {
                        if (settings.manualReviewMode && !showReviewModal) {
                           setReviewModalFilter('all');
                        }
                     }

                  } else {
                     await addToZip(fileData, splitResults);
                     updateFileStatus(fileData.id, 'done');
                     
                     addToHistory({
                        filename: fileData.originalName,
                        processedAt: fileData.timestamp,
                        segments: verifiedSegments
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

  const getUniqueName = (map: Map<string, Set<string>>, folder: string, filename: string): string => {
    if (!map.has(folder)) {
      map.set(folder, new Set());
    }
    const usedNames = map.get(folder)!;
    
    let uniqueName = filename;
    let counter = 1;
    const baseName = filename.replace(/\.pdf$/i, '');
    
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
        targetFolder = segment.deliveryDate || 'Undated';
      }

      const uniqueName = getUniqueName(folderContentMapRef.current, targetFolder, res.filename);

      if (targetFolder) {
        zip.folder(targetFolder)?.file(uniqueName, res.data);
      } else {
        zip.file(uniqueName, res.data);
      }
    });

    if (settings.includeOriginal) {
      const originalData = await fileData.file.arrayBuffer();
      let targetFolder = "";
      let originalName = `original_${fileData.originalName}`;

      if (settings.outputMode === 'by_original') {
        targetFolder = fileData.originalName.replace(/\.pdf$/i, '');
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

  const handleReviewSave = async (itemsToSave: ReviewItem[], initialSessionIds: Set<string>) => {
      const exportZip = new JSZip(); 
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

      const content = await exportZip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smart_split_reviewed_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      const processedOriginalIds = new Set<string>();
      
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
    let csv = "Original Filename,Processed Date,Generated Filename,Delivery ID,Customer Name,Customer ID,Date Found,Confidence,Verification Status,DB Name,Review Flag,Review Reason,Pages\n";
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
                const verificationStatus = seg.verificationStatus || 'unknown';
                const dbName = seg.dbMatch?.customers || '';
                
                const genName = seg.finalFilename || `${safeId}_${safeDate}_${safeCust}${safeCustId ? `_${safeCustId}` : ''}.pdf`;
                
                csv += `"${h.filename}","${dateStr}","${genName}","${safeId}","${safeCust}","${safeCustId}","${safeDate}","${seg.confidence}","${verificationStatus}","${dbName}","${reviewFlag}","${reviewReason}","${seg.startPage}-${seg.endPage}"\n`;
            });
        } else {
            csv += `"${h.filename}","${dateStr}","(No segments)","","","","","","","","","",""\n`;
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

        <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 flex-1">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <UploadCard 
              onFileUpload={handleFileUpload}
              isProcessing={isProcessing}
            />

            <ActionCard 
              ref={heroRef}
              processedCount={processedCount}
              reviewQueueLength={reviewQueue.length}
              pendingFilesCount={pendingFiles.filter(f => f.status === 'idle').length}
              isProcessing={isProcessing}
              onOpenReview={handleOpenReview}
              onProcessQueue={processQueue}
            />
          </div>

          <DatabaseCard 
            database={database}
            onUpdate={handleDatabaseUpdate}
            onClear={handleDatabaseClear}
          />

          <ProcessingQueue 
              files={pendingFiles} 
              title="Processing Queue" 
              onRemove={handleRemoveFile} 
              variant="queue"
          />

          {waitingReviewFiles.length > 0 && (
            <ProcessingQueue 
                files={waitingReviewFiles} 
                title="Files Pending Review" 
                onRemove={handleRemoveFile} 
                variant="pending"
                minConfidence={settings.minConfidence}
            />
          )}

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