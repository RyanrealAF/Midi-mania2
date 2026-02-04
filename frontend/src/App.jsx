import React, { useState, Suspense, lazy } from 'react';
import { Upload, Activity, Download, Play, Sliders, ChevronDown, Music, Volume2, X } from 'lucide-react';
import { useAudioProcessor, ProcessingStatus } from './useAudioProcessor';
import WaveformVisualizer from './components/WaveformVisualizer';

const MidiPianoRoll = lazy(() => import('./components/MidiPianoRoll'));

const App = () => {
  const { status, progress, results, error, processFile, startMidi, reset } = useAudioProcessor();
  const [sensitivity, setSensitivity] = useState(0.5);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleUpload = (e) => { e.target.files[0] && processFile(e.target.files[0]); };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f0f0f0] font-mono selection:bg-[#2ecc71] selection:text-black p-4 md:p-8">
      {/* Concrete Gospel Header */}
      <header className="max-w-6xl mx-auto mb-12 border-b border-[#222] pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic">DrumExtract <span className="text-[#666] not-italic font-light">Studio</span></h1>
          <p className="text-[10px] text-[#2ecc71] tracking-[0.4em] uppercase mt-1">Build While Bleeding // v2.0</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-[10px] text-[#444] uppercase">System Status</p>
          <p className={`text-xs ${status === 'error' ? 'text-red-500' : 'text-[#2ecc71]'}`}>{status.toUpperCase()}</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Console */}
        <div className="lg:col-span-8 bg-[#111] border border-[#222] rounded-lg p-8 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#222] to-transparent"></div>

          {/* Phase 1: Upload */}
          {status === ProcessingStatus.IDLE && (
            <div className="h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-[#222] rounded-xl hover:border-[#2ecc71] transition-colors group">
              <label className="cursor-pointer flex flex-col items-center">
                <Upload size={48} className="text-[#333] group-hover:text-[#2ecc71] transition-colors mb-4" />
                <span className="text-sm text-[#666] group-hover:text-[#f0f0f0]">Drop Audio Stem (WAV/MP3)</span>
                <input type="file" className="hidden" onChange={handleUpload} />
              </label>
            </div>
          )}

          {/* Phase 2: Processing (Separation) */}
          {status === ProcessingStatus.PROCESSING && (
            <div className="h-[400px] flex flex-col items-center justify-center">
              <div className="relative w-48 h-48 mb-8">
                {/* Triangular Progress Visualizer */}
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <polygon points="50,10 90,80 10,80" fill="none" stroke="#222" strokeWidth="2" />
                  <polygon points="50,10 90,80 10,80" fill="none" stroke="#2ecc71" strokeWidth="2" strokeDasharray="260" strokeDashoffset={260 - (progress.percent * 2.6)} className="transition-all duration-500" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-black italic">{progress.percent}%</span>
                </div>
              </div>
              <p className="text-xs text-[#2ecc71] animate-pulse uppercase tracking-widest">{progress.message}</p>
            </div>
          )}

          {/* Phase 3: Preview & Tune */}
          {status === ProcessingStatus.AWAITING_MIDI && (
            <div className="space-y-8 animate-in fade-in duration-700">
              <div className="bg-black/40 p-6 rounded border border-[#222]">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] text-[#666] uppercase tracking-widest">Isolated Drum Stream</span>
                  <Play size={16} className="text-[#2ecc71] cursor-pointer" />
                </div>
                <div className="h-24"><WaveformVisualizer url={results.drumUrl} /></div>
              </div>

              <div className="bg-[#1a1a1a] p-8 rounded-xl border border-[#222]">
                <label className="flex items-center gap-2 text-[10px] text-[#666] uppercase tracking-[0.2em] mb-6">
                  <Sliders size={12} /> Extraction Sensitivity: {Math.round(sensitivity * 100)}%
                </label>
                <input type="range" min="0.1" max="0.9" step="0.05" value={sensitivity} onChange={(e) => setSensitivity(parseFloat(e.target.value))} className="w-full accent-[#2ecc71] bg-black h-1 appearance-none rounded" />
                <div className="flex justify-between text-[8px] text-[#333] mt-2 font-bold">
                  <span>CLEAN (STRICT)</span>
                  <span>BUSY (GHOST NOTES)</span>
                </div>
              </div>

              <button onClick={() => startMidi(sensitivity, sensitivity*0.6)} className="w-full py-4 bg-[#2ecc71] text-black font-black uppercase italic tracking-tighter hover:bg-[#27ae60] transition-all transform hover:scale-[1.01] active:scale-[0.99]">
                Initiate MIDI Extraction
              </button>
            </div>
          )}

          {/* Phase 5: Complete */}
          {status === ProcessingStatus.COMPLETE && (
            <div className="space-y-8 animate-in zoom-in-95 duration-500">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black italic uppercase">Extraction Ready</h3>
                <Activity size={24} className="text-[#2ecc71]" />
              </div>

              <div className="h-48 border border-[#222] bg-black/40 rounded-lg overflow-hidden">
                <Suspense fallback={<div className="h-full flex items-center justify-center text-[10px] text-[#333]">Rendering MIDI...</div>}>
                  <MidiPianoRoll url={results.midiUrl} />
                </Suspense>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <a href={results.midiUrl} download className="flex items-center justify-center gap-2 py-4 bg-[#f0f0f0] text-black font-black uppercase italic text-sm hover:bg-white transition-colors">
                  <Download size={18} /> Download MIDI
                </a>
                <a href={results.drumUrl} download className="flex items-center justify-center gap-2 py-4 border border-[#333] text-[#f0f0f0] font-black uppercase italic text-sm hover:bg-[#222] transition-colors">
                  <Music size={18} /> Export Audio
                </a>
              </div>

              <button onClick={reset} className="w-full py-2 text-[10px] text-[#444] hover:text-[#2ecc71] transition-colors uppercase tracking-widest">Start New Session</button>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-950/20 border border-red-900 p-6 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-red-500 font-black italic">EXCEPTION DETECTED</span>
                <X size={16} className="text-red-500 cursor-pointer" onClick={reset} />
              </div>
              <p className="text-xs text-red-400 font-mono">{error}</p>
              <button onClick={reset} className="mt-4 px-4 py-2 bg-red-500 text-black text-[10px] font-black uppercase">Initialize Recovery</button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#111] border border-[#222] rounded-lg p-6">
            <button onClick={() => setShowAdvanced(!showAdvanced)} className="w-full flex items-center justify-between group">
              <span className="text-[10px] text-[#666] group-hover:text-[#f0f0f0] transition-colors uppercase tracking-widest font-bold">Advanced Parameters</span>
              <ChevronDown className={`transition-transform duration-300 ${showAdvanced ? 'rotate-180' : ''}`} size={16} />
            </button>
            {showAdvanced && (
              <div className="mt-6 space-y-4 animate-in slide-in-from-top-2">
                <div className="p-4 bg-black/40 rounded border border-[#222]">
                  <p className="text-[8px] text-[#444] uppercase mb-2">Stem Isolation</p>
                  <div className="space-y-2">
                    {['Vocals', 'Bass', 'Other'].map(s => (
                      <div key={s} className="flex justify-between items-center">
                        <span className="text-[10px] text-[#666]">{s}</span>
                        <Download size={12} className="text-[#333] cursor-not-allowed" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-[#111] border border-[#222] rounded-lg p-6 h-[200px] overflow-y-auto">
            <p className="text-[10px] text-[#333] uppercase font-bold mb-4 flex items-center gap-2"><Volume2 size={12} /> Diagnostic Log</p>
            <div className="space-y-1">
              <p className="text-[8px] text-[#222] tracking-tighter">[00:00:01] System boot complete</p>
              <p className="text-[8px] text-[#222] tracking-tighter">[00:00:02] Engine: Spleeter v2.4 + Basic-Pitch v0.2.5</p>
              {status !== 'idle' && <p className="text-[8px] text-[#2ecc71] tracking-tighter">[{new Date().toLocaleTimeString()}] Task ID: {results.taskId?.slice(0,8)}</p>}
              {progress.message && <p className="text-[8px] text-[#2ecc71] tracking-tighter">[{new Date().toLocaleTimeString()}] {progress.message.toUpperCase()}</p>}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
