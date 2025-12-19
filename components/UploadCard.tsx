import React from 'react';
import { Upload } from 'lucide-react';

interface UploadCardProps {
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isProcessing: boolean;
}

const UploadCard: React.FC<UploadCardProps> = ({ onFileUpload, isProcessing }) => {
  return (
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
          onChange={onFileUpload}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          disabled={isProcessing}
        />
        <div 
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all ${
            isProcessing 
              ? 'bg-slate-50 border-slate-200 cursor-not-allowed' 
              : 'bg-brand-50 border-brand-200 group-hover:border-brand-400 group-hover:bg-brand-100/50'
          }`}
        >
          <div className="bg-white p-3 rounded-full shadow-sm mb-3 text-brand-500 group-hover:shadow-md transition-shadow">
            <Upload size={24} />
          </div>
          <p className="font-medium text-brand-700 group-hover:text-brand-800 transition-colors">
            Click to upload or drag files
          </p>
          <p className="text-xs text-brand-400 mt-1">PDF files only</p>
        </div>
      </div>
    </div>
  );
};

export default UploadCard;