"""
DrumExtract Processing Pipeline
Handles Spleeter stem separation and Basic-Pitch MIDI conversion
with async progress reporting.
"""

import asyncio
import subprocess
import os
from pathlib import Path
from typing import AsyncGenerator, Dict
from enum import Enum

class ProcessingStage(str, Enum):
    SEPARATION = "separation"
    MIDI_CONVERSION = "midi_conversion"
    VALIDATION = "validation"
    COMPLETE = "complete"

class DrumPipeline:
    """
    Orchestrates audio processing pipeline:
    1. Spleeter separation (4-stems)
    2. Basic-Pitch MIDI conversion
    """
    
    def __init__(self, output_dir: Path):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    async def process(self, task_id: str, audio_path: str) -> AsyncGenerator[Dict, None]:
        """
        Main processing pipeline with progress streaming.
        
        Yields progress dictionaries:
        {
            "stage": ProcessingStage,
            "percent": float (0-100),
            "message": str
        }
        """
        audio_path = Path(audio_path)
        
        # Stage 1: Stem Separation
        yield {
            "stage": ProcessingStage.SEPARATION,
            "percent": 0,
            "message": "Initializing Spleeter engine..."
        }
        
        drum_path = await self._separate_drums(task_id, audio_path)
        
        yield {
            "stage": ProcessingStage.SEPARATION,
            "percent": 100,
            "message": "Drum stem isolated successfully"
        }
        
        # Stage 2: MIDI Conversion
        yield {
            "stage": ProcessingStage.MIDI_CONVERSION,
            "percent": 0,
            "message": "Analyzing drum transients..."
        }
        
        midi_path = await self._convert_to_midi(task_id, drum_path)
        
        yield {
            "stage": ProcessingStage.MIDI_CONVERSION,
            "percent": 100,
            "message": "MIDI extraction complete"
        }
        
        # Stage 3: Validation
        yield {
            "stage": ProcessingStage.VALIDATION,
            "percent": 0,
            "message": "Validating output files..."
        }
        
        self._validate_outputs(drum_path, midi_path)
        
        yield {
            "stage": ProcessingStage.VALIDATION,
            "percent": 100,
            "message": "All outputs validated"
        }
        
        # Complete
        yield {
            "stage": ProcessingStage.COMPLETE,
            "percent": 100,
            "message": "Processing complete - ready for download"
        }
    
    async def _separate_drums(self, task_id: str, audio_path: Path) -> Path:
        """
        Run Spleeter to isolate drum stem.
        Returns path to drums.wav
        """
        from spleeter.separator import Separator
        from spleeter.audio.adapter import AudioAdapter
        
        # Create separator instance
        separator = Separator('spleeter:4stems')
        
        # Output goes to temporary directory
        temp_output = self.output_dir / f"{task_id}_stems"
        temp_output.mkdir(exist_ok=True)
        
        # Run separation in thread pool (Spleeter is CPU-bound)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            separator.separate_to_file,
            str(audio_path),
            str(temp_output)
        )
        
        # Spleeter creates subfolder with audio filename
        stem_folder = temp_output / audio_path.stem
        drum_source = stem_folder / "drums.wav"
        
        if not drum_source.exists():
            raise FileNotFoundError(f"Spleeter did not generate drums.wav at {drum_source}")
        
        # Move to final location
        drum_final = self.output_dir / f"{task_id}_drums.wav"
        drum_source.rename(drum_final)
        
        # Cleanup temporary directory
        import shutil
        shutil.rmtree(temp_output)
        
        return drum_final
    
    async def _convert_to_midi(self, task_id: str, drum_path: Path) -> Path:
        """
        Run Basic-Pitch to convert drum audio to MIDI.
        Returns path to .mid file
        """
        from basic_pitch.inference import predict_and_save
        from basic_pitch import ICASSP_2022_MODEL_PATH
        
        # Output MIDI path
        midi_output = self.output_dir / f"{task_id}_drums.mid"
        
        # Run Basic-Pitch in thread pool
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            self._run_basic_pitch,
            str(drum_path),
            str(self.output_dir),
            task_id
        )
        
        # Basic-Pitch creates file with specific naming
        generated_midi = self.output_dir / f"{drum_path.stem}_basic_pitch.mid"
        
        if not generated_midi.exists():
            raise FileNotFoundError(f"Basic-Pitch did not generate MIDI at {generated_midi}")
        
        # Rename to expected output
        generated_midi.rename(midi_output)
        
        return midi_output
    
    def _run_basic_pitch(self, audio_path: str, output_dir: str, task_id: str):
        """
        Wrapper to run Basic-Pitch with proper parameters.
        Must run in thread pool due to TensorFlow blocking.
        """
        from basic_pitch.inference import predict_and_save
        
        predict_and_save(
            audio_path_list=[audio_path],
            output_directory=output_dir,
            save_midi=True,
            sonify_midi=False,
            save_model_outputs=False,
            save_notes=False
        )
    
    def _validate_outputs(self, drum_path: Path, midi_path: Path):
        """
        Validate that output files exist and contain valid data.
        """
        # Check drum audio exists and has content
        if not drum_path.exists():
            raise FileNotFoundError(f"Drum audio not found: {drum_path}")
        
        if drum_path.stat().st_size < 1000:  # Less than 1KB is suspicious
            raise ValueError(f"Drum audio file too small: {drum_path}")
        
        # Check MIDI exists and has content
        if not midi_path.exists():
            raise FileNotFoundError(f"MIDI file not found: {midi_path}")
        
        if midi_path.stat().st_size < 100:  # MIDI header alone is ~14 bytes
            raise ValueError(f"MIDI file too small: {midi_path}")
        
        # Validate MIDI file header (MThd magic number)
        with open(midi_path, 'rb') as f:
            header = f.read(4)
            if header != b'MThd':
                raise ValueError(f"Invalid MIDI file format: {midi_path}")
