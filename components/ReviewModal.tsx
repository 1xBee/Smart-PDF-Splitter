import React, { useState, useEffect, useRef } from 'react';
import { ReviewItem } from '../types';
import { 
  X, AlertTriangle, FileText, Download, Trash2, Loader2, Eye, Info, 
  CheckCircle, XCircle, AlertCircle, Shield 
} from 'lucide-react';

interface ReviewModalProps {
  isOpen: boolean;
  reviewItems: ReviewItem[];
  defaultFilter?: 'all' | 'flagged';
  onSaveAndDownload: (items: ReviewItem[], initialIds: Set<string>) => Promise<void>;
  onCancel: () => void;
  minConfidence: number;
}

const ReviewModal: React.FC<ReviewModalProps> = ({ 
    isOpen, 
    reviewItems, 
    onSaveAndDownload, 
    onCancel,
    defaultFilter = 'all',
    minConfidence
}) => {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'flagged'>('all');
  
  const initialIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setItems(reviewItems.map(item => ({ ...item })));
      initialIdsRef.current = new Set(reviewItems.map(item => item.id));
      setFilterMode(defaultFilter);
    } else {
      setIsSaving(false);
    }
  }, [isOpen, defaultFilter]); 

  if (!isOpen) return null;

  const isFlagged = (item: ReviewItem) => {
    return (
      item.segment.needsReview === true || 
      item.segment.confidence < minConfidence ||
      item.segment.verificationStatus === 'mismatch' ||
      item.segment.verificationStatus === 'not_found'
    );
  };

  const filteredItems = items.filter(item => {
    if (filterMode === 'flagged') {
        return isFlagged(item);
    }
    return true;
  });

  const handleNameChange = (id: string, value: string) => {
    const sanitized = value.replace(/[\\/:*?"<>|]/g, '_');
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, filename: sanitized } : item
    ));
  };

  const handleDeleteItem = (id: string) => {
    if (window.confirm("Are you sure you want to remove this delivery? It will not be included in the final download.")) {
      setItems(prev => prev.filter(item => item.id !== id));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setTimeout(async () => {
      await onSaveAndDownload(items, initialIdsRef.current);
      setIsSaving(false);
    }, 10);
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600 bg-green-50';
    if (score >= 0.7) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };
  
  const getVerificationBadge = (status: string | undefined) => {
    switch(status) {
      case 'verified':
        return (
          <div className="flex items-center text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
            <CheckCircle size={12} className="mr-1" />
            Verified
          </div>
        );
      case 'mismatch':
        return (
          <div className="flex items-center text-xs font-bold text-red-700 bg-red-100 px-2 py-1 rounded-full">
            <XCircle size={12} className="mr-1" />
            ID Mismatch
          </div>
        );
      case 'not_found':
        return (
          <div className="flex items-center text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
            <AlertCircle size={12} className="mr-1" />
            Not in DB
          </div>
        );
      default:
        return (
          <div className="flex items-center text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
            <Shield size={12} className="mr-1" />
            No DB
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center">
              <FileText className="mr-2 text-brand-600" />
              Review Documents
            </h2>
            <p className="text-sm text-slate-500">
              Review extracted documents, verify against database, edit filenames, or remove invalid deliveries.
            </p>
          </div>

          <div className="flex items-center space-x-4">
             {/* Filter Toggle */}
             <div className="bg-white border border-slate-300 rounded-lg p-1 flex">
                <button
                    onClick={() => setFilterMode('all')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center ${
                      filterMode === 'all' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    <Eye size={14} className="mr-1.5" /> Show All
                </button>
                <button
                    onClick={() => setFilterMode('flagged')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center ml-1 ${
                      filterMode === 'flagged' 
                        ? 'bg-amber-100 text-amber-700 shadow ring-1 ring-amber-200' 
                        : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                   <AlertTriangle size={14} className="mr-1.5" /> 
                   Needs Review 
                   {items.filter(i => isFlagged(i)).length > 0 && (
                       <span className="ml-1.5 bg-amber-600 text-white text-[10px] px-1.5 rounded-full">
                           {items.filter(i => isFlagged(i)).length}
                       </span>
                   )}
                </button>
             </div>

             <button 
                onClick={onCancel} 
                disabled={isSaving}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500 disabled:opacity-50"
             >
                <X size={20} />
             </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-0 relative bg-white">
          {filteredItems.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-slate-400">
                {filterMode === 'flagged' ? (
                    <>
                        <FileText size={48} className="mb-4 opacity-20" />
                        <p>No issues flagged.</p>
                        <button onClick={() => setFilterMode('all')} className="mt-2 text-brand-600 text-sm hover:underline">
                          Show all documents
                        </button>
                    </>
                ) : (
                    <>
                        <Trash2 size={48} className="mb-4 opacity-20" />
                        <p>No documents to review.</p>
                    </>
                )}
             </div>
          ) : (
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-100 text-slate-600 font-medium sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-3 border-b border-slate-200">Verification</th>
                <th className="px-6 py-3 border-b border-slate-200">Confidence</th>
                <th className="px-6 py-3 border-b border-slate-200">Source File</th>
                <th className="px-6 py-3 border-b border-slate-200">Pages</th>
                <th className="px-6 py-3 border-b border-slate-200 w-1/4">Filename (Editable)</th>
                <th className="px-6 py-3 border-b border-slate-200">Extracted Data</th>
                <th className="px-6 py-3 border-b border-slate-200 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map((item) => {
                 const flagged = isFlagged(item);
                 const isDbCorrected = item.segment.verificationStatus === 'verified' && item.segment.dbMatch;
                 
                 return (
                    <tr key={item.id} className={`transition-colors group ${
                      flagged ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-slate-50'
                    }`}>
                    
                    {/* Verification Status */}
                    <td className="px-6 py-3 align-top">
                      {getVerificationBadge(item.segment.verificationStatus)}
                      
                      {/* Database Match Info */}
                      {item.segment.dbMatch && (
                        <div className="mt-2 text-[10px] bg-emerald-50 p-2 rounded border border-emerald-200">
                          <strong className="block text-emerald-800">DB Record:</strong>
                          <div className="text-emerald-700 mt-1 space-y-0.5">
                            <div>ID: {item.segment.dbMatch.id}</div>
                            <div>Order: {item.segment.dbMatch.orderId}</div>
                            <div className="font-semibold">{item.segment.dbMatch.customers}</div>
                          </div>
                        </div>
                      )}
                    </td>
                    
                    {/* Confidence Score */}
                    <td className="px-6 py-3 align-top">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${
                          getConfidenceColor(item.segment.confidence)
                        }`}>
                          {item.segment.confidence < minConfidence && <AlertTriangle size={12} className="mr-1" />}
                          {(item.segment.confidence * 100).toFixed(0)}%
                        </span>
                        
                        {/* Review Reason */}
                        {item.segment.reviewReason && (
                            <div className="mt-2 text-[10px] leading-tight text-amber-800 bg-amber-100 p-2 rounded border border-amber-200 max-w-[140px]">
                                <strong className="block mb-1 flex items-center">
                                  <Info size={10} className="mr-1"/> Flag:
                                </strong>
                                {item.segment.reviewReason}
                            </div>
                        )}
                    </td>
                    
                    {/* Source File */}
                    <td className="px-6 py-3 text-slate-500 max-w-[150px] truncate align-top pt-4" title={item.originalFileName}>
                        {item.originalFileName}
                    </td>
                    
                    {/* Pages */}
                    <td className="px-6 py-3 text-slate-700 font-mono align-top pt-4">
                        {item.segment.startPage}-{item.segment.endPage}
                    </td>
                    
                    {/* Editable Filename */}
                    <td className="px-6 py-3 align-top pt-3">
                        <div className="relative">
                            <input
                                type="text"
                                value={item.filename}
                                onChange={(e) => handleNameChange(item.id, e.target.value)}
                                disabled={isSaving}
                                className={`w-full px-3 py-1.5 border rounded focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all font-medium text-slate-800 disabled:opacity-60 ${
                                  flagged ? 'border-amber-300 bg-white' : 'border-slate-300'
                                }`}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                                .pdf
                            </span>
                        </div>
                        {isDbCorrected && (
                          <span className="text-[10px] text-emerald-600 flex items-center mt-1">
                            <CheckCircle size={10} className="mr-1" />
                            Name corrected by DB
                          </span>
                        )}
                    </td>
                    
                    {/* Extracted Data Comparison */}
                    <td className="px-6 py-3 align-top pt-3">
                        <div className="text-xs space-y-1">
                            <div className="flex items-start">
                                <span className="text-slate-400 w-16 flex-shrink-0">ID:</span>
                                <span className={`font-medium ${
                                  item.segment.verificationStatus === 'mismatch' || item.segment.verificationStatus === 'not_found'
                                    ? 'text-red-700 bg-red-100 px-1 rounded' 
                                    : 'text-slate-700'
                                }`}>
                                  {item.segment.deliveryId}
                                </span>
                            </div>
                            <div className="flex items-start">
                                <span className="text-slate-400 w-16 flex-shrink-0">Customer:</span>
                                <span className="text-slate-700">{item.segment.customerName}</span>
                            </div>
                            {item.segment.customerId && (
                                <div className="flex items-start">
                                    <span className="text-slate-400 w-16 flex-shrink-0">Cust ID:</span>
                                    <span className={`font-medium ${
                                      item.segment.verificationStatus === 'mismatch'
                                        ? 'text-red-700 bg-red-100 px-1 rounded'
                                        : 'text-slate-700'
                                    }`}>
                                      {item.segment.customerId}
                                    </span>
                                </div>
                            )}
                            <div className="flex items-start">
                                <span className="text-slate-400 w-16 flex-shrink-0">Date:</span>
                                <span className="text-slate-700">{item.segment.deliveryDate}</span>
                            </div>
                        </div>
                    </td>
                    
                    {/* Actions */}
                    <td className="px-6 py-3 text-right align-top pt-3">
                        <button 
                            onClick={() => handleDeleteItem(item.id)}
                            disabled={isSaving}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30"
                            title="Delete this delivery"
                        >
                            <Trash2 size={16} />
                        </button>
                    </td>
                    </tr>
                );
              })}
            </tbody>
          </table>
          )}
          
          {isSaving && (
            <div className="absolute inset-0 bg-white/50 z-20 flex items-center justify-center backdrop-blur-[1px]">
               <div className="bg-white p-4 rounded-xl shadow-xl border border-slate-100 flex flex-col items-center">
                  <Loader2 size={32} className="text-brand-600 animate-spin mb-2" />
                  <p className="text-sm font-semibold text-slate-800">Generating ZIP...</p>
               </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center flex-shrink-0">
          <div className="text-sm text-slate-500">
             Valid Documents: <span className="font-bold text-slate-800">{items.length}</span>
             {items.filter(i => isFlagged(i)).length > 0 && (
                 <span className="ml-2 text-amber-600">
                   ({items.filter(i => isFlagged(i)).length} need review)
                 </span>
             )}
             {items.filter(i => i.segment.verificationStatus === 'verified').length > 0 && (
                 <span className="ml-2 text-emerald-600">
                   • {items.filter(i => i.segment.verificationStatus === 'verified').length} verified
                 </span>
             )}
          </div>
          <div className="flex space-x-3">
            <button 
                onClick={onCancel}
                disabled={isSaving}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
                Cancel
            </button>
            <button 
                onClick={handleSave}
                disabled={items.length === 0 || isSaving}
                className="px-6 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-400 text-white rounded-lg font-bold shadow-lg shadow-brand-500/30 flex items-center transition-all active:scale-95 disabled:active:scale-100"
            >
                {isSaving ? <Loader2 size={18} className="animate-spin mr-2" /> : <Download size={18} className="mr-2" />}
                {isSaving ? 'Processing...' : 'Download Valid Files'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReviewModal;