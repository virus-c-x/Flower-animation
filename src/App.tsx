/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Pointillism Flower - Generative Botanical Art.
 * Auto-resizing viewport canvas with minimal controls:
 * GitHub profile link, Slow Down, Pause/Resume, Speed Up.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { PlantSimulation, T_END } from './flower/simulation';

const GITHUB_PROFILE_URL = 'https://github.com/virus-c-x';

function getSimulationSize(): number {
  if (typeof window === 'undefined') return 640;
  // Fit viewport maintaining 1:1 aspect ratio, matching WIN_FRAC = 0.92
  const minDim = Math.min(window.innerWidth, window.innerHeight);
  const size = Math.floor(minDim * 0.92);
  return Math.max(360, Math.min(size, 1200));
}

export default function App() {
  const [size, setSize] = useState<number>(getSimulationSize);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(1.0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const plantRef = useRef<PlantSimulation | null>(null);
  const isPlayingRef = useRef<boolean>(true);
  const speedRef = useRef<number>(1.0);
  const clockRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const animFrameRef = useRef<number | null>(null);
  const sizeRef = useRef<number>(size);

  isPlayingRef.current = isPlaying;
  speedRef.current = speed;
  sizeRef.current = size;

  // Initialize or re-create plant simulation
  const setupSimulation = useCallback((simSize: number) => {
    plantRef.current = new PlantSimulation(simSize, simSize, 5, 'original');
    const plant = plantRef.current;
    const canvas = canvasRef.current;
    if (plant && canvas) {
      canvas.width = simSize;
      canvas.height = simSize;
      const pixels = plant.renderToBuffer(clockRef.current);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const imgData = new ImageData(
          new Uint8ClampedArray(pixels.buffer as ArrayBuffer),
          simSize,
          simSize
        );
        ctx.putImageData(imgData, 0, 0);
      }
    }
  }, []);

  // Window resize observer to adjust simulation size to fill viewport maintaining aspect ratio
  useEffect(() => {
    let resizeTimer: number;

    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const newSize = getSimulationSize();
        if (Math.abs(newSize - sizeRef.current) > 16) {
          setSize(newSize);
          setupSimulation(newSize);
        }
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
    };
  }, [setupSimulation]);

  // Initial simulation build
  useEffect(() => {
    setupSimulation(size);
  }, [setupSimulation, size]);

  // Animation render loop
  useEffect(() => {
    let active = true;

    const tick = (now: number) => {
      if (!active) return;
      const delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      if (isPlayingRef.current) {
        clockRef.current += delta * speedRef.current;
        if (clockRef.current > T_END) {
          clockRef.current = 0;
        }
      }

      const plant = plantRef.current;
      const canvas = canvasRef.current;
      if (plant && canvas) {
        const currentSize = sizeRef.current;
        const pixels = plant.renderToBuffer(clockRef.current);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const imgData = new ImageData(
            new Uint8ClampedArray(pixels.buffer as ArrayBuffer),
            currentSize,
            currentSize
          );
          ctx.putImageData(imgData, 0, 0);
        }
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    lastTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      active = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // Controls Handlers
  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleSlowDown = useCallback(() => {
    setSpeed((prev) => Math.max(0.25, parseFloat((prev - 0.25).toFixed(2))));
  }, []);

  const handleSpeedUp = useCallback(() => {
    setSpeed((prev) => Math.min(4.0, parseFloat((prev + 0.25).toFixed(2))));
  }, []);

  const handleRestart = useCallback(() => {
    clockRef.current = 0;
  }, []);

  const handleSaveFrame = useCallback(() => {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'flower_frame.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  }, []);

  // Keyboard Shortcuts (Space, R, S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleRestart();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleSaveFrame();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, handleRestart, handleSaveFrame]);

  return (
    <div className="relative w-screen h-screen bg-black flex items-center justify-center overflow-hidden m-0 p-0 select-none">
      {/* Simulation Canvas fitted to browser viewport */}
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="block bg-black aspect-square max-w-full max-h-full object-contain cursor-pointer"
        onClick={togglePlay}
      />

      {/* Minimal Floating Controls */}
      <div className="absolute bottom-5 inset-x-0 flex items-center justify-center pointer-events-none z-20">
        <div className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-950/80 backdrop-blur-md border border-stone-800/80 text-stone-300 shadow-2xl transition-opacity hover:opacity-100 opacity-75">
          
          {/* GitHub Profile Button */}
          <a
            href={GITHUB_PROFILE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-full hover:bg-stone-800 text-stone-400 hover:text-white transition-colors"
            title="GitHub Profile"
            aria-label="GitHub Profile"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>

          <div className="w-[1px] h-3.5 bg-stone-800 mx-0.5" />

          {/* Slow Down Button */}
          <button
            onClick={handleSlowDown}
            className="p-1.5 rounded-full hover:bg-stone-800 text-stone-400 hover:text-white transition-colors"
            title="Slow Down (-0.25x)"
            aria-label="Slow Down"
          >
            <svg className="w-3.5 h-3.5 stroke-current fill-none" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 19 2 12 11 5 11 19" />
              <polygon points="22 19 13 12 22 5 22 19" />
            </svg>
          </button>

          {/* Pause / Resume Button */}
          <button
            onClick={togglePlay}
            className="p-1.5 rounded-full hover:bg-stone-800 text-stone-200 hover:text-white transition-colors"
            title={isPlaying ? 'Pause' : 'Resume'}
            aria-label={isPlaying ? 'Pause' : 'Resume'}
          >
            {isPlaying ? (
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 fill-current translate-x-0.5" viewBox="0 0 24 24">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>

          {/* Speed Up Button */}
          <button
            onClick={handleSpeedUp}
            className="p-1.5 rounded-full hover:bg-stone-800 text-stone-400 hover:text-white transition-colors"
            title="Speed Up (+0.25x)"
            aria-label="Speed Up"
          >
            <svg className="w-3.5 h-3.5 stroke-current fill-none" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 19 22 12 13 5 13 19" />
              <polygon points="2 19 11 12 2 5 2 19" />
            </svg>
          </button>

          {/* Speed Indicator */}
          <span className="font-mono text-[10px] text-stone-500 min-w-8 text-center">
            {speed}x
          </span>

        </div>
      </div>
    </div>
  );
}
