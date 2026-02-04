import React, { useState } from 'react';
import {
  Activity,
  Power,
  Download,
  Music,
  Mic2,
  Upload,
  Settings,
  Waves,
  AudioLines,
  Volume2,
  X,
  PlayCircle
} from 'lucide-react';
import { useAudioProcessor, ProcessingStage, ProcessingStatus } from './hooks/useAudioProcessor';

// --- SUB-COMPONENTS ---
const Screw = ({ className }) => (
  <div className={`screw ${className}`} />
);

const VuMeter = ({ value, isPlaying }) => {
  const displayValue = isPlaying ? Math.min(100, Math.max(0, value + (Math.random() * 20 - 10))) : 0;
  const segments = [
    ...Array(3).fill('red'),
    ...Array(5).fill('yellow'),
    ...Array(12).fill('green')
  ];
  
  return (
    <div className="vu-meter-container w-4 bg-[var(--color-primary)] border border-[var(--color-buttonbg)]">
      {segments.map((color, i) => {
        const threshold = (i / 20) * 100;
        const isActive = displayValue > threshold;
        return (
          <div
            key={i}
            className={`vu-segment vu-segment-${color} ${isActive ? 'active' : ''}`}
          />
        );
      }).reverse()}
    </div>
  );
};

const ProcessingIndicator = ({ progress, status }) => {
  const getStageLabel = (stage) => {
    switch(stage) {
      case ProcessingStage.SEPARATION: return 'ISOLATING DRUMS';
      case ProcessingStage.MIDI_CONVERSION: return 'EXTRACTING MIDI';
      case ProcessingStage.VALIDATION: return 'VALIDATING';
      case ProcessingStage.COMPLETE: return 'COMPLETE';
      default: return 'PROCESSING';
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-32 h-32">
        <svg className="transform -rotate-90" width="128" height="128">
          <circle
            cx="64"
            cy="64"
            r="56"
            stroke="var(--color-buttonbg)"
            strokeWidth="8"
            fill="none"
          />
          <circle
            cx="64"
            cy="64"
            r="56"
            stroke="var(--color-accent)"
            strokeWidth="8"
            fill="none"
            strokeDasharray={`${2 * Math.PI * 56}`}
            strokeDashoffset={`${2 * Math.PI * 56 * (1 - progress.percent / 100)}`}
            className="transition-all duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-[var(--color-textlight)]">
            {Math.round(progress.percent)}%
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="font-mono text-xs text-[var(--color-accent)] tracking-widest uppercase">
          {progress.stage ? getStageLabel(progress.stage) : 'INITIALIZING'}
        </p>
        <p className="font-mono text-[10px] text-[var(--color-textdark)] mt-1">
          {progress.message}
        </p>
      </div>
    </div>
  );
};

const ConsoleFader = ({ label, value, icon: Icon, isPlaying }) => {
  const sliderValue = (value + 60) * (100 / 72);
  
  return (
    <div className="flex flex-col items-center gap-4 bg-[var(--color-secondary)] p-4 rounded border border-[var(--color-buttonbg)] relative">
      <Screw className="top-2 left-2" />
      <Screw className="top-2 right-2" />
      <Screw className="bottom-2 left-2" />
      <Screw className="bottom-2 right-2" />
      
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-[var(--color-textdark)]" />
        <span className="font-mono text-[9px] text-[var(--color-textlight)] uppercase tracking-widest">{label}</span>
      </div>
      
      <div className="flex gap-4 h-64">
        <VuMeter value={isPlaying ? Math.random() * sliderValue : 0} isPlaying={isPlaying} />
        <div className="relative w-12 flex items-center justify-center bg-[#111] rounded-md border border-[#333]">
          <input
            type="range"
            className="studio-fader absolute w-56 -rotate-90"
            min="0"
            max="100"
            defaultValue={sliderValue}
          />
        </div>
      </div>
      
      <div className="font-mono text-[10px] text-[var(--color-textdark)] mt-2">
        {value > 0 ? `+${value}` : value} dB
      </div>
    </div>
  );
};

const ConcreteGospelPattern = () => (
  <svg width="0" height="0" className="absolute">
    <defs>
      <pattern id="concrete-gospel-pattern" x="0" y="0" width="600" height="800" patternUnits="userSpaceOnUse">
        <rect width="600" height="800" fill="transparent"/>
        <g className="stencil-group opacity-[0.03]">
          <style>
            {`.stencil-text { font-family: 'Impact', sans-serif; font-weight: 900; font-size: 32px; text-anchor: middle; fill: #dcdcdc; letter-spacing: 4px; text-transform: uppercase; }`}
          </style>
          {[
            "Concrete Gospel", "Voice of the Voiceless", "Survival as Strategy",
            "Embrace the Suck", "Grit & Grace", "Digital Nomad Vibes",
            "Flip Da Script", "Build While Bleeding", "Poetic Survival",
            "Purpose Over Pretend", "Urban Mythmaker", "Concrete Lament",
            "Raw Redemption", "Faith in the Filth", "Messy But Sacred"
          ].map((text, i) => (
            <text key={i} x="300" y={50 + (i * 50)} className="stencil-text">{text}</text>
          ))}
        </g>
      </pattern>
    </defs>
  </svg>
);

// --- MAIN APP ---
const App = () => {
  const {
    status,
    progress,
    results,
    error,
    processFile,
    cancelProcessing,
    reset,
    isProcessing,
    isComplete
  } = useAudioProcessor();

  const [fileName, setFileName] = useState(null);

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFileName(file.name);
      processFile(file);
    }
  };

  const handleReset = () => {
    setFileName(null);
    reset();
  };

  const isActive = isProcessing || isComplete;

  return (
    <div className="min-h-screen bg-[var(--color-primary)] text-[var(--color-textlight)] font-sans relative overflow-x-hidden flex flex-col">
      <ConcreteGospelPattern />
      
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <svg width="100%" height="100%">
          <rect width="100%" height="100%" fill="url(#concrete-gospel-pattern)" />
        </svg>
      </div>

      {/* Header */}
      <header className="w-full border-b border-[#333] bg-[var(--color-secondary)] relative z-20 shadow-lg">
        <div className="max-w-[1600px] mx-auto p-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[var(--color-accent)] rounded flex items-center justify-center shadow-lg">
              <Volume2 size={20} className="text-[#000]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--color-textlight)] flex items-center gap-2">
                BUILDWHILEBLEEDING <span className="text-[var(--color-textdark)] font-light italic">STUDIO</span>
              </h1>
              <p className="font-mono text-[10px] text-[var(--color-accent)] tracking-widest uppercase">
                Drum Separator // MIDI Edition
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden lg:flex gap-8 font-mono text-[10px] text-[var(--color-textdark)]">
              <span>STATUS: {status.toUpperCase()}</span>
              {isActive && <span className="text-[var(--color-accent)] animate-pulse">PROCESSING</span>}
            </div>
            
            {isProcessing && (
              <button
                onClick={cancelProcessing}
                className="px-6 py-2 rounded font-mono text-xs font-bold tracking-widest transition-all border border-[var(--color-error)] bg-[var(--color-error)] text-white hover:bg-opacity-80"
              >
                CANCEL
              </button>
            )}
            
            {isComplete && (
              <button
                onClick={handleReset}
                className="px-6 py-2 rounded font-mono text-xs font-bold tracking-widest transition-all border border-[#000] bg-[var(--color-buttonbg)] text-[var(--color-textlight)] hover:bg-[var(--color-buttonhover)]"
              >
                NEW SESSION
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-8 relative z-10 grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* Processing Console */}
        <section className="xl:col-span-8 texture-brushed-metal rounded-lg p-1 relative shadow-2xl flex flex-col">
          <div className="absolute top-0 bottom-0 -left-4 w-4 texture-wood-panel rounded-l-md border-r border-[#000]" />
          <div className="absolute top-0 bottom-0 -right-4 w-4 texture-wood-panel rounded-r-md border-l border-[#000] z-20" />
          
          <div className="h-full w-full border border-[#444] rounded p-8 relative flex items-center justify-center bg-gradient-to-b from-transparent to-[#000]/30 min-h-[500px]">
            <Screw className="top-4 left-4" />
            <Screw className="top-4 right-4" />
            <Screw className="bottom-4 left-4" />
            <Screw className="bottom-4 right-4" />
            
            {/* Upload State */}
            {status === ProcessingStatus.IDLE && (
              <div className="relative z-30">
                <div className="w-64 h-64 rounded-full border-4 border-[#333] bg-[#1a1a1a] flex items-center justify-center shadow-[0_0_50px_rgba(0,0,0,0.8)] hover:border-[var(--color-accent)] transition-all">
                  <label className="cursor-pointer flex flex-col items-center group">
                    <Upload size={48} className="text-[var(--color-textdark)] group-hover:text-[var(--color-accent)] transition-colors mb-4" />
                    <span className="font-mono text-sm text-[var(--color-textdark)] uppercase text-center group-hover:text-[var(--color-accent)] transition-colors">
                      Drop Audio File<br/>
                      <span className="text-xs">WAV • MP3 • M4A • FLAC</span>
                    </span>
                    <input type="file" accept=".wav,.mp3,.m4a,.flac" className="hidden" onChange={handleUpload} />
                  </label>
                </div>
              </div>
            )}
            
            {/* Processing State */}
            {isProcessing && (
              <div className="relative z-30">
                <ProcessingIndicator progress={progress} status={status} />
              </div>
            )}
            
            {/* Complete State */}
            {isComplete && (
              <div className="relative z-30 flex flex-col items-center gap-6">
                <div className="w-48 h-48 rounded-full border-4 border-[var(--color-success)] bg-[#1a1a1a] flex items-center justify-center shadow-[0_0_50px_rgba(46,204,113,0.3)]">
                  <Activity size={64} className="text-[var(--color-success)]" />
                </div>
                
                <div className="flex flex-col gap-4 w-full max-w-md">
                  <a
                    href={results.midiUrl}
                    download
                    className="flex items-center justify-between px-6 py-4 bg-[var(--color-accent)] text-[#000] rounded font-mono text-sm font-bold tracking-widest hover:bg-opacity-90 transition-all"
                  >
                    <span>DOWNLOAD MIDI</span>
                    <Download size={20} />
                  </a>
                  
                  <a
                    href={results.drumUrl}
                    download
                    className="flex items-center justify-between px-6 py-4 bg-[var(--color-buttonbg)] text-[var(--color-textlight)] rounded font-mono text-sm font-bold tracking-widest hover:bg-[var(--color-buttonhover)] transition-all border border-[#333]"
                  >
                    <span>PREVIEW DRUM STEM</span>
                    <PlayCircle size={20} />
                  </a>
                </div>
              </div>
            )}
            
            {/* Error State */}
            {error && (
              <div className="absolute top-8 left-8 right-8 bg-[var(--color-error)] bg-opacity-10 border border-[var(--color-error)] rounded p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono text-sm text-[var(--color-error)] font-bold">ERROR</p>
                    <p className="font-mono text-xs text-[var(--color-textlight)] mt-1">{error}</p>
                  </div>
                  <button onClick={handleReset}>
                    <X size={16} className="text-[var(--color-error)]" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Mixing Desk */}
        <section className="xl:col-span-4 flex flex-col gap-6">
          <div className="texture-brushed-metal rounded-lg p-6 relative shadow-2xl flex-1 border border-[#000]">
            <div className="flex items-center justify-between mb-6 border-b border-[#333] pb-2">
              <h3 className="font-mono text-[11px] text-[var(--color-textlight)] tracking-[0.2em] uppercase flex items-center gap-2">
                <Waves size={14} className="text-[var(--color-accent)]" /> Output Monitor
              </h3>
              <div className="flex gap-1">
                <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-[var(--color-success)] animate-pulse' : 'bg-[var(--color-buttonbg)]'}`} />
              </div>
            </div>
            
            <div className="grid grid-cols-4 gap-2 h-full pb-4">
              <ConsoleFader label="VOX" value={-1.5} icon={Mic2} isPlaying={isProcessing} />
              <ConsoleFader label="BASS" value={0.0} icon={Waves} isPlaying={isProcessing} />
              <ConsoleFader label="DRUM" value={-0.5} icon={Music} isPlaying={isProcessing} />
              <ConsoleFader label="MAIN" value={-0.5} icon={AudioLines} isPlaying={isProcessing} />
            </div>
          </div>

          {/* System Log */}
          <div className="bg-[#000] border border-[#333] rounded p-4 h-40 font-mono text-[10px] overflow-y-auto">
            <div className="flex flex-col gap-1">
              <span className="text-[var(--color-textdark)]">:: SYSTEM READY</span>
              <span className="text-[var(--color-textdark)]">:: ENGINE: Spleeter 4-Stem + Basic-Pitch</span>
              {fileName && <span className="text-[var(--color-success)]">:: LOADED: {fileName.toUpperCase()}</span>}
              {isProcessing && progress.message && (
                <span className="text-[var(--color-accent)]">:: {progress.message.toUpperCase()}</span>
              )}
              {isComplete && <span className="text-[var(--color-success)]">:: EXTRACTION COMPLETE</span>}
              {error && <span className="text-[var(--color-error)]">:: ERROR: {error.toUpperCase()}</span>}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-[#333] bg-[var(--color-secondary)] p-6 relative z-20">
        <div className="max-w-[1600px] mx-auto flex justify-between items-center opacity-50">
          <div className="flex gap-8">
            <span className="font-mono text-[9px] text-[var(--color-textdark)] cursor-pointer hover:text-[var(--color-textlight)] flex items-center gap-2">
              <Settings size={12} /> SETTINGS
            </span>
            <a href="https://github.com/buildwhilebleeding" className="font-mono text-[9px] text-[var(--color-textdark)] cursor-pointer hover:text-[var(--color-textlight)] flex items-center gap-2">
              GITHUB
            </a>
          </div>
          <div className="font-mono text-[9px] text-[var(--color-textdark)] tracking-[0.5em] uppercase">
            BuildWhileBleeding // 2026
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
