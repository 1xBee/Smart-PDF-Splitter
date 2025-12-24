import React, { useRef } from 'react';
import { AppSettings, OutputMode, ModelType, DbEntry } from '../types';
import { X, Calendar, Folder, Files, ShieldAlert, Brain, Zap, Sparkles, Database, Upload, Trash2, CheckCircle, AlertCircle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  database: DbEntry[];
  onDatabaseUpdate: (newDb: DbEntry[]) => void;
  onDatabaseClear: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave, database, onDatabaseUpdate, onDatabaseClear }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  if (!isOpen) return null;

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        
        if (!Array.isArray(json)) {
          alert('Invalid JSON format. Expected an array of records.');
          return;
        }
        
        const isValid = json.every(record => 
          record.id && record.orderId && record.customers
        );
        
        if (!isValid) {
          alert('Invalid data structure. Each record must have: id, orderId, and customers fields.');
          return;
        }
        
        onDatabaseUpdate(json);
        alert(`Successfully loaded ${json.length} records!`);
      } catch (error: any) {
        alert('Error parsing JSON file: ' + error.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleClearDatabase = () => {
    if (window.confirm('Are you sure you want to clear the entire database? This cannot be undone.')) {
      onDatabaseClear();
    }
  };

  const handleModeChange = (mode: OutputMode) => {
    let newSettings = { ...settings, outputMode: mode };
    onSave(newSettings);
  };

  const handleModelChange = (model: ModelType) => {
    let newSettings = { ...settings, modelType: model };
    onSave(newSettings);
  };

  const handleToggle = (key: keyof AppSettings) => {
    if (key === 'outputMode' || key === 'minConfidence' || key === 'modelType') return;
    const newSettings = { ...settings, [key]: !settings[key as keyof AppSettings] };
    onSave(newSettings);
  };

  const handleConfidenceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onSave({ ...settings, minConfidence: val });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Configuration</h2>
            <p className="text-slate-500 text-sm mt-1">Customize how the splitter processes your files.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-8 space-y-8 h-[60vh] overflow-y-auto custom-scrollbar">
          
          {/* Section: Verification Database */}
          <section>
             <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center">
                <Database size={14} className="mr-1.5" /> Verification Database
             </h3>
             
             <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                   <div>
                      <div className="font-semibold text-slate-800 text-sm flex items-center">
                         {database.length > 0 ? (
                            <>
                               <CheckCircle size={16} className="mr-2 text-emerald-600" />
                               Database Active
                            </>
                         ) : (
                            <>
                               <AlertCircle size={16} className="mr-2 text-slate-400" />
                               No Database Loaded
                            </>
                         )}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                         {database.length > 0 
                            ? `${database.length} records loaded`
                            : 'Upload JSON to enable verification'
                         }
                      </div>
                   </div>
                   
                   {database.length > 0 && (
                      <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                         Active
                      </span>
                   )}
                </div>
                
                <div className="flex space-x-2 mt-3">
                   <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="hidden"
                   />
                   <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg font-medium transition-all active:scale-95"
                   >
                      <Upload size={14} className="mr-2" />
                      {database.length > 0 ? 'Update' : 'Upload JSON'}
                   </button>
                   
                   {database.length > 0 && (
                      <button
                         onClick={handleClearDatabase}
                         className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium transition-all active:scale-95 flex items-center text-sm"
                         title="Clear database"
                      >
                         <Trash2 size={14} />
                      </button>
                   )}
                </div>
             </div>
          </section>

          {/* Section: AI Model */}
          <section>
             <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center">
                <Brain size={14} className="mr-1.5" /> AI Engine
             </h3>
             <div className="grid grid-cols-2 gap-3">
                <div 
                   onClick={() => handleModelChange('flash')}
                   className={`cursor-pointer p-3 rounded-xl border transition-all ${settings.modelType === 'flash' ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                >
                    <div className="flex items-center space-x-2 mb-2">
                        <div className={`p-1.5 rounded-full ${settings.modelType === 'flash' ? 'bg-brand-200 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
                            <Zap size={16} fill="currentColor" />
                        </div>
                        <span className={`font-semibold text-sm ${settings.modelType === 'flash' ? 'text-brand-900' : 'text-slate-700'}`}>Fast</span>
                    </div>
                    <p className="text-xs text-slate-500">Gemini 2.5 Flash. Optimized for speed. Good for printed text.</p>
                </div>

                <div 
                   onClick={() => handleModelChange('pro')}
                   className={`cursor-pointer p-3 rounded-xl border transition-all ${settings.modelType === 'pro' ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                >
                    <div className="flex items-center space-x-2 mb-2">
                        <div className={`p-1.5 rounded-full ${settings.modelType === 'pro' ? 'bg-purple-200 text-purple-700' : 'bg-slate-100 text-slate-500'}`}>
                            <Sparkles size={16} fill="currentColor" />
                        </div>
                        <span className={`font-semibold text-sm ${settings.modelType === 'pro' ? 'text-purple-900' : 'text-slate-700'}`}>Pro</span>
                    </div>
                    <p className="text-xs text-slate-500">Gemini 3 Pro. Slower, but highest accuracy for OCR.</p>
                </div>
             </div>
          </section>

          {/* Section: Output Organization */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Output Organization</h3>
            
            <div className="space-y-3">
              {/* Group by Date */}
              <label className={`flex items-start p-3 rounded-lg border cursor-pointer transition-all ${settings.outputMode === 'by_date' ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                <div className="flex items-center h-5">
                  <input 
                    type="radio" 
                    name="outputMode" 
                    checked={settings.outputMode === 'by_date'}
                    onChange={() => handleModeChange('by_date')}
                    className="h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300"
                  />
                </div>
                <div className="ml-3">
                  <div className="flex items-center text-sm font-medium text-slate-900">
                    <Calendar size={16} className="mr-2 text-slate-500" />
                    Group by Delivery Date
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Creates folders like <span className="font-mono bg-slate-100 px-1 rounded">2023-10-25</span>. Best for organizing daily piles.</p>
                </div>
              </label>

              {/* Group by Original File */}
              <label className={`flex items-start p-3 rounded-lg border cursor-pointer transition-all ${settings.outputMode === 'by_original' ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                <div className="flex items-center h-5">
                  <input 
                    type="radio" 
                    name="outputMode" 
                    checked={settings.outputMode === 'by_original'}
                    onChange={() => handleModeChange('by_original')}
                    className="h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300"
                  />
                </div>
                <div className="ml-3">
                  <div className="flex items-center text-sm font-medium text-slate-900">
                    <Folder size={16} className="mr-2 text-slate-500" />
                    Group by Original File
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Creates a folder for each uploaded PDF file containing its split parts.</p>
                </div>
              </label>

              {/* Flatten */}
              <label className={`flex items-start p-3 rounded-lg border cursor-pointer transition-all ${settings.outputMode === 'flatten' ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                <div className="flex items-center h-5">
                  <input 
                    type="radio" 
                    name="outputMode" 
                    checked={settings.outputMode === 'flatten'}
                    onChange={() => handleModeChange('flatten')}
                    className="h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300"
                  />
                </div>
                <div className="ml-3">
                  <div className="flex items-center text-sm font-medium text-slate-900">
                    <Files size={16} className="mr-2 text-slate-500" />
                    Flatten Output
                  </div>
                  <p className="text-xs text-slate-500 mt-1">All split files are saved in the root folder. Useful for bulk importing.</p>
                </div>
              </label>
            </div>
          </section>

          {/* Section: AI Safety */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">AI Sensitivity</h3>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center text-sm font-semibold text-slate-800">
                         <ShieldAlert size={18} className="mr-2 text-brand-600" />
                         Auto-Review Threshold
                    </div>
                    <span className="text-sm font-bold text-brand-700 bg-brand-100 px-2 py-0.5 rounded">
                        {(settings.minConfidence * 100).toFixed(0)}%
                    </span>
                </div>
                
                <input 
                    type="range" 
                    min="0.5" 
                    max="1.0" 
                    step="0.05"
                    value={settings.minConfidence}
                    onChange={handleConfidenceChange}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
                />
                
                <div className="flex justify-between text-xs text-slate-400 mt-2">
                    <span>Lenient (50%)</span>
                    <span>Strict (100%)</span>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                    If the AI's confidence is lower than this value, the app will <strong>force a manual review</strong>, even if manual mode is off. 
                    Set higher to catch more potential errors.
                </p>
            </div>
          </section>

          {/* Section: Files */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">File Options</h3>

             <div className="flex items-start justify-between">
                <div>
                    <div className="font-semibold text-slate-800 text-base">Include Original Scan</div>
                    <div className="text-sm text-slate-500 mt-1 max-w-[280px]">
                        Save a copy of the original PDF in the output. 
                        {settings.outputMode !== 'by_original' && (
                          <span className="block text-slate-400 italic mt-1">
                            (Saved in root folder for '{settings.outputMode === 'by_date' ? 'Group by Date' : 'Flatten'}')
                          </span>
                        )}
                    </div>
                </div>
                <button 
                    onClick={() => handleToggle('includeOriginal')}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${settings.includeOriginal ? 'bg-brand-600' : 'bg-slate-200'}`}
                >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${settings.includeOriginal ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>
          </section>

          {/* Section: Workflow */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Workflow</h3>
             <div className="flex items-start justify-between">
                <div>
                    <div className="font-semibold text-slate-800 text-base flex items-center">
                        Manual Review Mode
                        <span className="ml-2 text-[10px] uppercase bg-brand-100 text-brand-700 font-bold px-2 py-0.5 rounded">Recommended</span>
                    </div>
                    <div className="text-sm text-slate-500 mt-1 max-w-[280px]">
                        Always pause after processing to review extracted data.
                        <br/><span className="text-brand-600 text-xs font-medium">Note: Review will always trigger if AI is unsure.</span>
                    </div>
                </div>
                <button 
                    onClick={() => handleToggle('manualReviewMode')}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${settings.manualReviewMode ? 'bg-brand-600' : 'bg-slate-200'}`}
                >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${settings.manualReviewMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>
          </section>

        </div>

        <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium transition-all shadow-lg shadow-slate-900/10 active:scale-95"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;