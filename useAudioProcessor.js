/**
 * useAudioProcessor Hook
 * Manages audio upload, WebSocket processing, and result retrieval
 * with automatic reconnection and comprehensive state management.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || 'https://api.buildwhilebleeding.com';
const WS_BASE = API_BASE.replace('https://', 'wss://').replace('http://', 'ws://');

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000;

export const ProcessingStatus = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  CONNECTING: 'connecting',
  PROCESSING: 'processing',
  COMPLETE: 'complete',
  ERROR: 'error',
  CANCELLED: 'cancelled'
};

export const ProcessingStage = {
  SEPARATION: 'separation',
  MIDI_CONVERSION: 'midi_conversion',
  VALIDATION: 'validation',
  COMPLETE: 'complete'
};

export const useAudioProcessor = () => {
  const [status, setStatus] = useState(ProcessingStatus.IDLE);
  const [progress, setProgress] = useState({
    stage: null,
    percent: 0,
    message: ''
  });
  const [results, setResults] = useState({
    midiUrl: null,
    drumUrl: null,
    taskId: null
  });
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const taskIdRef = useRef(null);

  /**
   * Upload audio file to server
   */
  const uploadFile = useCallback(async (file) => {
    // Validate file
    const allowedTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/x-m4a', 'audio/flac'];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(wav|mp3|m4a|flac)$/i)) {
      throw new Error('Invalid file type. Supported: WAV, MP3, M4A, FLAC');
    }

    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      throw new Error('File too large. Maximum size: 100MB');
    }

    setStatus(ProcessingStatus.UPLOADING);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Upload failed');
    }

    const data = await response.json();
    taskIdRef.current = data.task_id;
    
    return data.task_id;
  }, []);

  /**
   * Establish WebSocket connection for processing
   */
  const connectWebSocket = useCallback((taskId) => {
    return new Promise((resolve, reject) => {
      setStatus(ProcessingStatus.CONNECTING);
      
      const ws = new WebSocket(`${WS_BASE}/ws/process/${taskId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        setStatus(ProcessingStatus.PROCESSING);
        reconnectAttemptsRef.current = 0;
        resolve();
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        // Handle completion
        if (data.complete) {
          setStatus(ProcessingStatus.COMPLETE);
          setResults({
            midiUrl: `${API_BASE}${data.midi_url}`,
            drumUrl: `${API_BASE}${data.drum_url}`,
            taskId: data.task_id
          });
          setProgress({
            stage: ProcessingStage.COMPLETE,
            percent: 100,
            message: 'Processing complete!'
          });
          ws.close();
          return;
        }

        // Handle error
        if (data.error) {
          setStatus(ProcessingStatus.ERROR);
          setError(data.details || data.error);
          ws.close();
          reject(new Error(data.details || data.error));
          return;
        }

        // Handle progress update
        if (data.stage && data.percent !== undefined) {
          setProgress({
            stage: data.stage,
            percent: data.percent,
            message: data.message || ''
          });
        }
      };

      ws.onerror = (err) => {
        console.error('[WebSocket] Error:', err);
        setError('Connection error occurred');
        reject(err);
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] Closed:', event.code, event.reason);
        
        // Only attempt reconnect if not deliberately closed and still processing
        if (event.code !== 1000 && status === ProcessingStatus.PROCESSING) {
          handleReconnect(taskId);
        }
      };
    });
  }, [status]);

  /**
   * Handle WebSocket reconnection with exponential backoff
   */
  const handleReconnect = useCallback((taskId) => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setStatus(ProcessingStatus.ERROR);
      setError('Connection lost. Maximum reconnection attempts reached.');
      return;
    }

    const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current);
    reconnectAttemptsRef.current++;

    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      connectWebSocket(taskId).catch((err) => {
        console.error('[WebSocket] Reconnection failed:', err);
      });
    }, delay);
  }, [connectWebSocket]);

  /**
   * Start processing flow: upload + connect
   */
  const processFile = useCallback(async (file) => {
    try {
      setError(null);
      setProgress({ stage: null, percent: 0, message: '' });
      setResults({ midiUrl: null, drumUrl: null, taskId: null });

      // Upload file
      const taskId = await uploadFile(file);

      // Connect WebSocket
      await connectWebSocket(taskId);

    } catch (err) {
      setStatus(ProcessingStatus.ERROR);
      setError(err.message || 'Processing failed');
      console.error('[Processing] Error:', err);
    }
  }, [uploadFile, connectWebSocket]);

  /**
   * Cancel active processing
   */
  const cancelProcessing = useCallback(async () => {
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close(1000, 'User cancelled');
      wsRef.current = null;
    }

    // Clear reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Delete task on server
    if (taskIdRef.current) {
      try {
        await fetch(`${API_BASE}/task/${taskIdRef.current}`, {
          method: 'DELETE'
        });
      } catch (err) {
        console.error('[Cancel] Failed to delete task:', err);
      }
    }

    // Reset state
    setStatus(ProcessingStatus.CANCELLED);
    setProgress({ stage: null, percent: 0, message: '' });
    reconnectAttemptsRef.current = 0;
    taskIdRef.current = null;
  }, []);

  /**
   * Check task status (useful for page refresh recovery)
   */
  const checkStatus = useCallback(async (taskId) => {
    const response = await fetch(`${API_BASE}/status/${taskId}`);
    
    if (!response.ok) {
      throw new Error('Failed to check status');
    }

    const data = await response.json();
    
    if (data.status === 'complete') {
      setStatus(ProcessingStatus.COMPLETE);
      setResults({
        midiUrl: `${API_BASE}${data.midi_url}`,
        drumUrl: `${API_BASE}${data.drum_url}`,
        taskId: data.task_id
      });
    } else if (data.status === 'failed') {
      setStatus(ProcessingStatus.ERROR);
      setError(data.error || 'Processing failed');
    } else if (data.status === 'processing' && data.progress) {
      setStatus(ProcessingStatus.PROCESSING);
      setProgress(data.progress);
    }

    return data;
  }, []);

  /**
   * Reset to idle state
   */
  const reset = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setStatus(ProcessingStatus.IDLE);
    setProgress({ stage: null, percent: 0, message: '' });
    setResults({ midiUrl: null, drumUrl: null, taskId: null });
    setError(null);
    reconnectAttemptsRef.current = 0;
    taskIdRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return {
    // State
    status,
    progress,
    results,
    error,
    
    // Actions
    processFile,
    cancelProcessing,
    checkStatus,
    reset,
    
    // Utilities
    isProcessing: status === ProcessingStatus.PROCESSING || status === ProcessingStatus.UPLOADING,
    isComplete: status === ProcessingStatus.COMPLETE,
    hasError: status === ProcessingStatus.ERROR
  };
};
