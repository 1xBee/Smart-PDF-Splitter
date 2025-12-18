import React, { useState } from 'react';
import { ProcessedFile } from '../types';
import { FileText, CheckCircle, AlertCircle, Loader2, X, Trash2, Hourglass, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

interface ProcessingQueueProps {
  files: ProcessedFile[];
  title: string;
  onRemove?: (id: string) => void;
  variant?: 'queue' | 'completed' | 'pending';
  minConfidence?: number;
}

const ProcessingQueue: React.FC<ProcessingQueueProps> = ({ files, title, onRemove, variant = 'queue', minConfidence }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (files.length === 0) {
    return null;
  }

  let headerColor = 'bg-white';
  let badgeColor = 'bg-brand-50 text-brand-700';

  if (variant === 'completed') {
    headerColor = 'bg-slate-50';
    badgeColor = 'bg-green-100 text-green-700';
  } else if (variant === 'pending') {
    headerColor = 'bg-amber-50/30';
    badgeColor = 'bg-amber-100 text-amber-700';
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div 
        className={`px-6 py-4 border-b border-slate-100 flex justify-between items-center ${headerColor} cursor-pointer select-none transition-colors hover:bg-slate-50/80`}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center">
            {isCollapsed ? (
                <ChevronDown size={20} className="mr-3 text-slate-400 transition-transform duration-200" />
            ) : (
                <ChevronUp size={20} className="mr-3 text-slate-400 transition-transform duration-200" />
            )}
            <h3 className="font-semibold text-slate-800 flex items-center">
            {title}
            </h3>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badgeColor}`}>
          {files.length} {files.length === 1 ? 'File' : 'Files'}
        </span>
      </div>
      
      {!isCollapsed && (
        <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto custom-scrollbar overscroll-contain">
            {files.map((file) => {
               // Calculate flags for this file
               const flaggedCount = file.segments?.filter(s => 
                   s.needsReview || (minConfidence !== undefined && s.confidence < minConfidence)
               ).length || 0;

               return (
                <div key={file.id} className={`px-6 py-4 flex items-center justify-between group transition-colors hover:bg-slate-50 ${file.isDuplicate ? 'bg-amber-50/50' : ''}`}>
                    <div className="flex items-center space-x-4 overflow-hidden">
                    <div className={`p-2.5 rounded-lg flex-shrink-0 ${
                        file.status === 'done' ? ((file.segments?.length || 0) === 0 ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-600') :
                        file.status === 'error' ? 'bg-red-100 text-red-600' :
                        file.status === 'waiting_review' ? 'bg-amber-100 text-amber-600' :
                        'bg-blue-50 text-brand-600'
                    }`}>
                        {file.status === 'converting' || file.status === 'analyzing' || file.status === 'splitting' ? (
                        <Loader2 size={20} className="animate-spin" />
                        ) : file.status === 'done' ? (
                        (file.segments?.length || 0) === 0 ? <AlertCircle size={20} /> : <CheckCircle size={20} />
                        ) : file.status === 'error' ? (
                        <AlertCircle size={20} />
                        ) : file.status === 'waiting_review' ? (
                        <Hourglass size={20} />
                        ) : (
                        <FileText size={20} />
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate block max-w-[180px] sm:max-w-[300px]" title={file.originalName}>
                        {file.originalName}
                        </p>
                        <div className="flex items-center space-x-2 mt-1">
                            <span className="text-xs text-slate-500">
                                {(file.file.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                            {file.isDuplicate && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                                    Duplicate
                                </span>
                            )}
                        </div>
                    </div>
                    </div>

                    <div className="flex items-center pl-4 space-x-4">
                    {/* Status Text */}
                    <div className="text-right hidden sm:block">
                        {file.status === 'idle' && (
                            <span className="text-xs text-slate-400 font-medium bg-slate-100 px-2 py-1 rounded">Waiting</span>
                        )}
                        {(file.status === 'converting' || file.status === 'analyzing' || file.status === 'splitting') && (
                            <div className="text-xs font-medium capitalize text-brand-600 bg-brand-50 px-2 py-1 rounded animate-pulse">
                                {file.status}...
                            </div>
                        )}
                        {file.status === 'done' && (
                            <div className="flex flex-col items-end">
                            <span className={`text-xs font-bold px-2 py-1 rounded ${(file.segments?.length || 0) === 0 ? 'text-slate-500 bg-slate-100' : 'text-green-700 bg-green-100'}`}>
                                {file.segments?.length || 0} Documents
                            </span>
                            </div>
                        )}
                        {file.status === 'waiting_review' && (
                            <div className="flex flex-col items-end">
                            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded">
                                Needs Review
                            </span>
                            {flaggedCount > 0 && (
                                <span className="text-[10px] font-semibold text-amber-600 mt-1 flex items-center">
                                    <AlertTriangle size={10} className="mr-1" />
                                    {flaggedCount} AI Flags
                                </span>
                            )}
                            </div>
                        )}
                        {file.status === 'error' && (
                            <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded truncate max-w-[100px]" title={file.error}>
                            Failed
                            </span>
                        )}
                    </div>

                    {/* Remove Button - Allowed if idle, completed, error, or WAITING REVIEW */}
                    {onRemove && (
                        <button 
                        onClick={(e) => {
                            e.stopPropagation(); // Prevent toggling collapse
                            onRemove(file.id);
                        }}
                        disabled={file.status === 'converting' || file.status === 'analyzing' || file.status === 'splitting'}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-0"
                        title="Remove file"
                        >
                        {variant === 'completed' || variant === 'pending' ? <Trash2 size={16} /> : <X size={16} />}
                        </button>
                    )}
                    </div>
                </div>
               );
            })}
        </div>
      )}
    </div>
  );
};

export default ProcessingQueue;