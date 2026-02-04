import { useState, useCallback, useRef, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.buildwhilebleeding.com';
const WS_BASE = API_BASE.replace('https://', 'wss://').replace('http://', 'ws://');

export const ProcessingStatus = { IDLE: 'idle', UPLOADING: 'uploading', CONNECTING: 'connecting', PROCESSING: 'processing', AWAITING_MIDI: 'awaiting_midi', COMPLETE: 'complete', ERROR: 'error' };

export const useAudioProcessor = () => {
  const [status, setStatus] = useState(ProcessingStatus.IDLE);
  const [progress, setProgress] = useState({ stage: 'idle', percent: 0, message: '' });
  const [results, setResults] = useState({ midiUrl: null, drumUrl: null, taskId: null });
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const taskIdRef = useRef(null);

  const connect = useCallback((taskId) => {
    if (wsRef.current) wsRef.current.close();

    const ws = new WebSocket(`${WS_BASE}/ws/process/${taskId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.error) { setStatus(ProcessingStatus.ERROR); setError(data.error); return; }

      setStatus(data.status);
      if (data.progress) setProgress(data.progress);
      if (data.drum_url) setResults(prev => ({ ...prev, drumUrl: `${API_BASE}${data.drum_url}` }));
      if (data.midi_url) setResults(prev => ({ ...prev, midiUrl: `${API_BASE}${data.midi_url}` }));
    };

    ws.onclose = () => {
      // Auto-reconnect if still active
      if (status !== ProcessingStatus.COMPLETE && status !== ProcessingStatus.ERROR && status !== ProcessingStatus.IDLE) {
        setTimeout(() => connect(taskId), 2000);
      }
    };
  }, [status]);

  const processFile = useCallback(async (file) => {
    setStatus(ProcessingStatus.UPLOADING);
    const formData = new FormData(); formData.append('file', file);
    try {
      const resp = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
      const data = await resp.json();
      taskIdRef.current = data.task_id;
      setResults(prev => ({ ...prev, taskId: data.task_id }));
      connect(data.task_id);
    } catch (err) { setStatus(ProcessingStatus.ERROR); setError(err.message); }
  }, [connect]);

  const startMidi = useCallback((onset, frame) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command: 'start_midi', onset, frame }));
    }
  }, []);

  const reset = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    setStatus(ProcessingStatus.IDLE); setProgress({ stage: 'idle', percent: 0, message: '' });
    setResults({ midiUrl: null, drumUrl: null, taskId: null }); setError(null);
  }, []);

  return { status, progress, results, error, processFile, startMidi, reset };
};
