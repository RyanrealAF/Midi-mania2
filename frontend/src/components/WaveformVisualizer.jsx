import React, { useEffect, useRef } from 'react';

const WaveformVisualizer = ({ url }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!url) return;
    const ctx = canvasRef.current.getContext('2d');
    const audioCtx = new AudioContext();
    fetch(url).then(r => r.arrayBuffer()).then(b => audioCtx.decodeAudioData(b)).then(buf => {
      const data = buf.getChannelData(0);
      const step = Math.ceil(data.length / canvasRef.current.width);
      const amp = canvasRef.current.height / 2;
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.strokeStyle = '#f0f0f0'; ctx.beginPath();
      for(let i=0; i<canvasRef.current.width; i++) {
        let min=1, max=-1;
        for(let j=0; j<step; j++) { const d = data[i*step+j]; if(d<min) min=d; if(d>max) max=d; }
        ctx.moveTo(i, (1+min)*amp); ctx.lineTo(i, (1+max)*amp);
      }
      ctx.stroke();
    });
  }, [url]);
  return <canvas ref={canvasRef} width={600} height={100} className="w-full h-full bg-black/20 rounded" />;
};
export default WaveformVisualizer;
