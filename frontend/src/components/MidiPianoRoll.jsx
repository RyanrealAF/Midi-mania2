import React, { useEffect, useRef } from 'react';
import { Midi } from '@tonejs/midi';

const MidiPianoRoll = ({ url }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!url) return;
    Midi.fromUrl(url).then(midi => {
      const ctx = canvasRef.current.getContext('2d');
      const w = canvasRef.current.width, h = canvasRef.current.height;
      ctx.clearRect(0, 0, w, h);
      let min=127, max=0, dur=0;
      midi.tracks.forEach(t => t.notes.forEach(n => { if(n.midi<min) min=n.midi; if(n.midi>max) max=n.midi; if(n.time+n.duration>dur) dur=n.time+n.duration; }));
      min-=2; max+=2; const range = max-min;
      ctx.fillStyle = '#2ecc71';
      midi.tracks.forEach(t => t.notes.forEach(n => {
        const x=(n.time/dur)*w, wd=(n.duration/dur)*w, y=h-((n.midi-min)/range)*h, ht=h/range;
        ctx.fillRect(x, y-ht, wd, ht-1);
      }));
    });
  }, [url]);
  return <canvas ref={canvasRef} width={600} height={200} className="w-full h-full bg-black/40 rounded" />;
};
export default MidiPianoRoll;
