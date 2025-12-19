import React, { forwardRef } from 'react';
import { FileCheck, Play, Loader } from 'lucide-react';

interface ActionCardProps {
  processedCount: number;
  reviewQueueLength: number;
  pendingFilesCount: number;
  isProcessing: boolean;
  onOpenReview: () => void;
  onProcessQueue: () => void;
}

const ActionCard = forwardRef<HTMLDivElement, ActionCardProps>(
  ({ processedCount, reviewQueueLength, pendingFilesCount, isProcessing, onOpenReview, onProcessQueue }, ref) => {
    return (
      <div 
        ref={ref}
        className="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-6 rounded-xl shadow-lg flex flex-col justify-between"
      >
        <div>
          <h3 className="text-slate-300 font-medium text-sm flex items-center">
            <FileCheck size={16} className="mr-2" /> 
            Session Processed
          </h3>
          <p className="text-4xl font-bold mt-2">{processedCount}</p>
          {reviewQueueLength > 0 && (
            <span className="inline-block mt-2 text-xs bg-amber-500/20 border border-amber-500/30 rounded px-2 py-0.5 text-amber-200">
              {reviewQueueLength} docs awaiting review
            </span>
          )}
        </div>
        
        <div className="mt-6 space-y-3">
          {/* Review Button */}
          <button 
            onClick={onOpenReview}
            disabled={reviewQueueLength === 0}
            className="w-full py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 disabled:text-slate-400 text-white text-sm font-bold rounded flex items-center justify-center shadow-md transition-all active:scale-95 disabled:active:scale-100"
          >
            <FileCheck size={16} className="mr-2" />
            Review Pending {reviewQueueLength > 0 && `(${reviewQueueLength})`}
          </button>
          
          {/* Start Process Button */}
          <button 
            onClick={onProcessQueue}
            disabled={isProcessing || pendingFilesCount === 0}
            className={`w-full py-3 rounded-lg font-bold flex items-center justify-center transition-all ${
              isProcessing 
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : pendingFilesCount === 0
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-brand-500 hover:bg-brand-400 text-white shadow-lg shadow-brand-900/20 active:scale-95'
            }`}
          >
            {isProcessing ? (
              <>
                <Loader size={18} className="animate-spin mr-2" /> 
                Processing...
              </>
            ) : (
              <>
                <Play size={18} fill="currentColor" className="mr-2" /> 
                Start Process
              </>
            )}
          </button>
        </div>
      </div>
    );
  }
);

ActionCard.displayName = 'ActionCard';

export default ActionCard;