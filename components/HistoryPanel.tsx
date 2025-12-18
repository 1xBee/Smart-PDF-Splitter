import React from 'react';
import { HistoryItem } from '../types';
import { Clock, Download, X, FileCheck } from 'lucide-react';

interface HistoryPanelProps {
  history: HistoryItem[];
  onExportMasterCSV: () => void;
  onCloseMobile: () => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ history, onExportMasterCSV, onCloseMobile }) => {
  return (
    <div className="h-full flex flex-col bg-white border-l border-slate-200 w-full md:w-80 fixed md:static right-0 top-0 bottom-0 shadow-xl md:shadow-none transform transition-transform duration-300 z-20 pt-16 md:pt-0">
      
      {/* Mobile Close Button */}
      <button 
        onClick={onCloseMobile}
        className="md:hidden absolute top-4 right-4 p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200"
      >
        <X size={20} />
      </button>

      <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between h-16 md:h-auto">
        <h3 className="font-semibold text-slate-800 flex items-center">
          <Clock size={18} className="mr-2 text-slate-500" />
          History
        </h3>
        <button
          onClick={onExportMasterCSV}
          className="text-xs flex items-center text-brand-600 hover:text-brand-700 font-medium transition-colors bg-brand-50 px-2 py-1 rounded border border-brand-100"
          disabled={history.length === 0}
        >
          <Download size={14} className="mr-1" />
          Master CSV
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
        {history.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Clock size={32} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm">No history yet.</p>
          </div>
        ) : (
          history.slice().reverse().map((item, idx) => (
            <div key={idx} className="p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-white hover:shadow-sm transition-all group">
              <div className="flex items-start justify-between mb-1">
                 <p className="text-sm font-medium text-slate-800 truncate w-48" title={item.filename}>
                    {item.filename}
                 </p>
              </div>
              
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs text-slate-400">
                  {new Date(item.processedAt).toLocaleDateString()}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wide bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center">
                  <FileCheck size={10} className="mr-1" />
                  {item.segments ? item.segments.length : 0} Docs
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default HistoryPanel;