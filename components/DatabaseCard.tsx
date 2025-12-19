import React, { useState, useRef } from 'react';
import { DbEntry } from '../types';
import { Database, Upload, Trash2, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface DatabaseCardProps {
  database: DbEntry[];
  onUpdate: (newDb: DbEntry[]) => void;
  onClear: () => void;
}

const DatabaseCard: React.FC<DatabaseCardProps> = ({ database, onUpdate, onClear }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const lastUpdated = database.length > 0 ? new Date().toLocaleString() : 'Never';
  
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        
        // Validate structure
        if (!Array.isArray(json)) {
          alert('Invalid JSON format. Expected an array of records.');
          return;
        }
        
        // Basic validation of required fields
        const isValid = json.every(record => 
          record.id && record.orderId && record.customers
        );
        
        if (!isValid) {
          alert('Invalid data structure. Each record must have: id, orderId, and customers fields.');
          return;
        }
        
        onUpdate(json);
        alert(`Successfully loaded ${json.length} records!`);
      } catch (error: any) {
        alert('Error parsing JSON file: ' + error.message);
      }
    };
    reader.readAsText(file);
    
    // Reset input
    event.target.value = '';
  };
  
  const handleClear = () => {
    if (window.confirm('Are you sure you want to clear the entire database? This cannot be undone.')) {
      onClear();
    }
  };
  
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div 
        className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 flex justify-between items-center cursor-pointer hover:from-emerald-100 hover:to-teal-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center">
          <div className="bg-emerald-600 p-2 rounded-lg text-white mr-3 shadow-sm">
            <Database size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 flex items-center">
              Verification Database
              {database.length > 0 && (
                <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                  Active
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {database.length > 0 
                ? `${database.length} records • Last updated ${lastUpdated}`
                : 'No database loaded - verification disabled'
              }
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {database.length > 0 ? (
            <CheckCircle size={20} className="text-emerald-600" />
          ) : (
            <AlertCircle size={20} className="text-amber-500" />
          )}
          {isExpanded ? (
            <ChevronUp size={20} className="text-slate-400" />
          ) : (
            <ChevronDown size={20} className="text-slate-400" />
          )}
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Statistics */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Database Statistics</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500 block">Total Records</span>
                <span className="text-2xl font-bold text-slate-800">{database.length}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Status</span>
                <span className={`text-sm font-bold ${database.length > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {database.length > 0 ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex space-x-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-all shadow-md shadow-emerald-600/20 active:scale-95"
            >
              <Upload size={16} className="mr-2" />
              {database.length > 0 ? 'Update Database' : 'Upload Database JSON'}
            </button>
            
            {database.length > 0 && (
              <button
                onClick={handleClear}
                className="px-4 py-2.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium transition-all active:scale-95 flex items-center"
                title="Clear database"
              >
                <Trash2 size={16} className="mr-2" />
                Clear
              </button>
            )}
          </div>
          
          {/* Format Info */}
          <div className="text-xs bg-blue-50 p-4 rounded-lg border border-blue-100">
            <p className="font-semibold text-blue-800 mb-2 flex items-center">
              📋 Expected JSON Format:
            </p>
            <pre className="bg-white p-3 rounded border border-blue-200 overflow-x-auto text-[10px] leading-relaxed">
{`[
  {
    "id": "DLV-001",
    "orderId": "8971",
    "customers": "John Doe",
    "dateCreated": "2024-01-15"
  },
  {
    "id": "INV-1234",
    "orderId": "#12345",
    "customers": "Acme Corp",
    "dateCreated": "2024-01-16"
  }
]`}
            </pre>
            <p className="text-blue-700 mt-2">
              <strong>Required fields:</strong> id, orderId, customers
              <br />
              <strong>Optional:</strong> dateCreated
            </p>
          </div>
          
          {/* Sample Preview */}
          {database.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Sample Records (First 3)</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                {database.slice(0, 3).map((record, idx) => (
                  <div key={idx} className="bg-slate-50 p-2 rounded text-xs border border-slate-200">
                    <div className="flex justify-between">
                      <span className="font-mono text-slate-600">{record.id}</span>
                      <span className="text-slate-400">Order: {record.orderId}</span>
                    </div>
                    <div className="text-slate-700 font-medium mt-1">{record.customers}</div>
                  </div>
                ))}
              </div>
              {database.length > 3 && (
                <p className="text-xs text-slate-400 text-center mt-2">
                  + {database.length - 3} more records
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DatabaseCard;