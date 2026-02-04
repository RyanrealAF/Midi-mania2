import asyncio
import subprocess
import os
import re
import shutil
from pathlib import Path
from typing import AsyncGenerator, Dict, Optional
from enum import Enum
import numpy as np

class ProcessingStage(str, Enum):
    SEPARATION = "separation"
    PREVIEW = "preview"
    MIDI_CONVERSION = "midi_conversion"
    VALIDATION = "validation"
    COMPLETE = "complete"

class DrumPipeline:
    def __init__(self, output_dir: Path):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    async def separate(self, task_id: str, audio_path: str) -> AsyncGenerator[Dict, None]:
        audio_path = Path(audio_path)
        yield {"stage": ProcessingStage.SEPARATION, "percent": 0, "message": "Starting stem separation..."}

        temp_output = self.output_dir / f"{task_id}_stems"
        temp_output.mkdir(exist_ok=True)

        # We use spleeter CLI for reliable progress parsing from stderr (tqdm)
        cmd = ["spleeter", "separate", "-p", "spleeter:4stems", "-o", str(temp_output), str(audio_path)]
        process = await asyncio.create_subprocess_exec(*cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        while True:
            line = await process.stderr.readline()
            if not line: break
            line_str = line.decode().strip()
            # Parse tqdm progress: e.g. " 25%|██▌       | 1/4"
            match = re.search(r"(\d+)%", line_str)
            if match:
                percent = int(match.group(1))
                yield {"stage": ProcessingStage.SEPARATION, "percent": percent, "message": "Isolating drum stem..."}

        await process.wait()
        if process.returncode != 0:
            raise RuntimeError(f"Spleeter failed with return code {process.returncode}")

        # Move drums.wav to final location, and other stems to a subfolder
        stem_folder = list(temp_output.glob("*"))[0] if list(temp_output.glob("*")) else None
        if not stem_folder: raise FileNotFoundError("No stems generated")

        drum_source = stem_folder / "drums.wav"
        if not drum_source.exists(): raise FileNotFoundError("Drums stem not found")

        drum_final = self.output_dir / f"{task_id}_drums.wav"
        shutil.move(str(drum_source), str(drum_final))

        # Keep other stems for "Advanced Options"
        advanced_dir = self.output_dir / f"{task_id}_stems"
        advanced_dir.mkdir(exist_ok=True)
        for stem in ["vocals.wav", "bass.wav", "other.wav"]:
            source = stem_folder / stem
            if source.exists(): shutil.move(str(source), str(advanced_dir / stem))

        shutil.rmtree(temp_output)
        yield {"stage": ProcessingStage.SEPARATION, "percent": 100, "message": "Separation complete."}

    async def convert_to_midi(self, task_id: str, drum_path: Path, onset_threshold: float, frame_threshold: float) -> AsyncGenerator[Dict, None]:
        yield {"stage": ProcessingStage.MIDI_CONVERSION, "percent": 0, "message": "Initializing MIDI extraction..."}

        # Manual windowing to report progress
        from basic_pitch.inference import Model, get_audio_input, unwrap_output, ICASSP_2022_MODEL_PATH
        from basic_pitch.constants import AUDIO_N_SAMPLES, FFT_HOP, DEFAULT_OVERLAPPING_FRAMES, AUDIO_SAMPLE_RATE
        import basic_pitch.note_creation as infer

        model = Model(ICASSP_2022_MODEL_PATH)
        n_olap_frames = DEFAULT_OVERLAPPING_FRAMES
        olap_len = n_olap_frames * FFT_HOP
        hop_size = AUDIO_N_SAMPLES - olap_len

        output = {"note": [], "onset": [], "contour": []}
        windows = list(get_audio_input(drum_path, olap_len, hop_size))
        total = len(windows)

        for i, (win, _, orig_len) in enumerate(windows):
            preds = model.predict(win)
            for k, v in preds.items(): output[k].append(v)
            if (i+1) % 5 == 0 or (i+1) == total:
                percent = int((i+1)/total * 90)
                yield {"stage": ProcessingStage.MIDI_CONVERSION, "percent": percent, "message": f"Extracting MIDI... ({i+1}/{total})"}
            await asyncio.sleep(0) # Yield control

        unwrapped = {k: unwrap_output(np.concatenate(output[k]), orig_len, n_olap_frames, hop_size) for k in output}
        min_note_len = int(np.round(127.7 / 1000 * (AUDIO_SAMPLE_RATE / FFT_HOP)))
        midi_data, _ = infer.model_output_to_notes(unwrapped, onset_thresh=onset_threshold, frame_thresh=frame_threshold, min_note_len=min_note_len)

        midi_path = self.output_dir / f"{task_id}_drums.mid"
        midi_data.write(str(midi_path))

        yield {"stage": ProcessingStage.COMPLETE, "percent": 100, "message": "MIDI extraction successful!"}
