import React, {
  useRef,
  useEffect,
  useState,
  useMemo,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from 'react';
import {
  ChevronUp,
  ChevronDown,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Languages,
} from 'lucide-react';
import { Rnd } from 'react-rnd';
import { createPortal } from 'react-dom';
import type { SubtitleItem } from '@/types/subtitle';
import type { SpeakerUIProfile } from '@/types/speaker';
import { formatDuration } from '@/services/subtitle/time';
import { cn } from '@/lib/cn';
import { logger } from '@/services/utils/logger';
import { useTranslation } from 'react-i18next';
import ASS from 'assjs';
import { generateAssContent } from '@/services/subtitle/generator';

export interface VideoPlayerPreviewRef {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentTime: () => number;
}

interface VideoPlayerPreviewProps {
  videoSrc: string | null;
  subtitles: SubtitleItem[];
  speakerProfiles?: SpeakerUIProfile[];
  includeSpeaker?: boolean;
  useSpeakerColors?: boolean;
  showSourceText: boolean;
  onToggleSourceText?: () => void;
  isCollapsed: boolean;
  isTranscoding?: boolean;
  transcodeProgress?: number;
  transcodedDuration?: number;
  fullVideoDuration?: number; // Full duration from backend for accurate progress
  onTimeUpdate: (seconds: number) => void;
  onToggleCollapse: () => void;
  isGenerating?: boolean;
}

export const VideoPlayerPreview = forwardRef<VideoPlayerPreviewRef, VideoPlayerPreviewProps>(
  (
    {
      videoSrc,
      subtitles,
      speakerProfiles,
      includeSpeaker = false,
      useSpeakerColors = false,
      showSourceText,
      onToggleSourceText,
      isCollapsed,
      isTranscoding,
      transcodeProgress,
      transcodedDuration,
      fullVideoDuration,
      onTimeUpdate,
      onToggleCollapse,
      isGenerating = false,
    },
    ref
  ) => {
    const { t } = useTranslation(['workspace', 'editor']);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [ready, setReady] = useState(false);
    const [isFloating, setIsFloating] = useState(false);
    const [videoDimensions, setVideoDimensions] = useState<{
      width: number;
      height: number;
    } | null>(null);

    const [isResizing, setIsResizing] = useState(false);
    const [dockedHeight, setDockedHeight] = useState(320);
    const startYRef = useRef(0);
    const startHeightRef = useRef(0);
    const currentTimeRef = useRef(0); // Track currentTime in ref to preserve across re-renders
    const assContainerRef = useRef<HTMLDivElement>(null);
    const assRef = useRef<ASS | null>(null);

    const handleResizeStart = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
        startYRef.current = e.clientY;
        startHeightRef.current = dockedHeight;

        const handleMouseMove = (moveEvent: MouseEvent) => {
          const deltaY = moveEvent.clientY - startYRef.current;
          const newHeight = Math.max(200, Math.min(800, startHeightRef.current + deltaY));
          setDockedHeight(newHeight);
        };

        const handleMouseUp = () => {
          setIsResizing(false);
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      },
      [dockedHeight]
    );

    // ==========================================
    // Restore missing logic
    // ==========================================
    const [rndScale, setRndScale] = useState(1);

    // Calculate specific scale for Rnd to fix dragging sensitivity on high DPI
    useEffect(() => {
      const updateScale = () => {
        const dpr = window.devicePixelRatio || 1;
        if (dpr > 1) {
          setRndScale(1 / dpr);
        } else {
          setRndScale(1);
        }
      };

      updateScale();
      window.addEventListener('resize', updateScale);
      return () => window.removeEventListener('resize', updateScale);
    }, []);

    // Expose methods to parent component
    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        if (!videoRef.current) return;
        const targetTime =
          transcodedDuration !== undefined ? Math.min(seconds, transcodedDuration - 0.5) : seconds;
        videoRef.current.currentTime = Math.max(0, targetTime);
      },
      play: () => {
        videoRef.current?.play().catch(() => {});
        setPlaying(true);
      },
      pause: () => {
        videoRef.current?.pause();
        setPlaying(false);
      },
      getCurrentTime: () => currentTime,
    }));

    // Generate ASS content for preview (WYSIWYG)
    // Reuse existing generator logic to ensure preview matches export
    const assContent = useMemo(() => {
      // If generating, return empty string to pause updates and clear subtitles
      // This prevents performance issues and crashes during rapid updates
      if (isGenerating) {
        return '';
      }

      // Default Title: Video Preview
      // Bilingual: Always true for preview (or depend on settings? showing both lines matches current behavior)
      // Include Speaker: True (to match export)
      // Use Colors: True (to match export)
      return generateAssContent(
        subtitles,
        'Video Preview',
        showSourceText,
        includeSpeaker,
        useSpeakerColors,
        speakerProfiles
      );
    }, [
      subtitles,
      speakerProfiles,
      includeSpeaker,
      useSpeakerColors,
      showSourceText,
      isGenerating,
    ]);

    // Initialize ASS instance
    useEffect(() => {
      if (!assContainerRef.current || !videoRef.current) return;

      const video = videoRef.current;
      const wasPlaying = !video.paused && !video.ended && video.readyState > 2;

      // 1. Pause video to ensure stable initialization state
      if (wasPlaying) {
        video.pause();
      }

      // 2. Clean up previous instance and DOM
      if (assRef.current) {
        try {
          assRef.current.destroy();
        } catch {
          // ignore cleanup errors
        }
      }

      // Force clear container
      if (assContainerRef.current) {
        assContainerRef.current.innerHTML = '';
      }

      // 3. Initialize new instance
      // Note: ASS library handles resize automatically via video events
      try {
        assRef.current = new ASS(assContent, video, {
          container: assContainerRef.current,
          resampling: 'video_width',
        });
      } catch (error) {
        logger.error('Failed to initialize ASS renderer', error);
      }

      // 4. Resume playback if it was playing
      if (wasPlaying) {
        // Use a small timeout to allow the renderer to attach listeners properly
        setTimeout(() => {
          video.play().catch((e) => logger.warn('Failed to resume playback', e));
        }, 10);
      }

      return () => {
        if (assRef.current) {
          try {
            assRef.current.destroy();
          } catch {
            // ignore cleanup errors
          }
          assRef.current = null;
        }
      };
    }, [assContent, ready, isFloating, isCollapsed]);

    // Update time for external sync (not handled by ASS automatically?)
    // ASS handles sync automatically via video events! We just need to manage lifecycle.

    // Handle video time update
    const handleTimeUpdate = useCallback(() => {
      if (videoRef.current) {
        const time = videoRef.current.currentTime;
        setCurrentTime(time);
        currentTimeRef.current = time; // Sync ref for mode switch restoration
        onTimeUpdate(time);
      }
    }, [onTimeUpdate]);

    // Handle seek from progress bar
    const handleSeek = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const targetTime = Number(e.target.value);
        if (!videoRef.current) return;

        // Check if seeking beyond transcoded portion
        if (transcodedDuration !== undefined && targetTime > transcodedDuration - 0.5) {
          videoRef.current.currentTime = transcodedDuration - 0.5;
          return;
        }

        videoRef.current.currentTime = targetTime;
      },
      [transcodedDuration]
    );

    // Handle play/pause toggle
    const togglePlay = useCallback(() => {
      if (!videoRef.current) return;
      if (playing) {
        videoRef.current.pause();
        setPlaying(false);
      } else {
        videoRef.current.play().catch(() => {});
        setPlaying(true);
      }
    }, [playing]);

    // Handle volume toggle
    const toggleMute = useCallback(() => {
      if (videoRef.current) {
        videoRef.current.muted = !muted;
        setMuted(!muted);
      }
    }, [muted]);

    // Handle volume change
    const handleVolumeChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseFloat(e.target.value);
        if (videoRef.current) {
          videoRef.current.volume = newVolume;
          setVolume(newVolume);
          // Auto-unmute if adjusting volume from 0
          if (newVolume > 0 && muted) {
            videoRef.current.muted = false;
            setMuted(false);
          }
        }
      },
      [muted]
    );

    // Keyboard shortcuts
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (isCollapsed || !videoSrc || !videoRef.current) return;

        switch (e.code) {
          case 'Space':
            e.preventDefault();
            togglePlay();
            break;
          case 'ArrowLeft':
            e.preventDefault();
            videoRef.current.currentTime = Math.max(0, currentTime - 5);
            break;
          case 'ArrowRight':
            e.preventDefault();
            {
              const maxTime = transcodedDuration ?? duration;
              videoRef.current.currentTime = Math.min(maxTime - 0.5, currentTime + 5);
            }
            break;
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentTime, duration, isCollapsed, videoSrc, transcodedDuration, togglePlay]);

    // Calculate progress bar percentages
    // Use fullVideoDuration from backend if available, otherwise browser-reported duration
    const displayDuration =
      fullVideoDuration && fullVideoDuration > 0 ? fullVideoDuration : duration;
    const currentProgress = displayDuration > 0 ? (currentTime / displayDuration) * 100 : 0;
    const transcodedProgress =
      displayDuration > 0 && transcodedDuration !== undefined
        ? (transcodedDuration / displayDuration) * 100
        : 100;

    // Memoize player content to reduce Rnd re-renders
    const playerContent = useMemo(
      () => (
        <div
          className={cn(
            'flex flex-col relative group h-full w-full',
            isFloating
              ? 'bg-white/95 backdrop-blur-xl border border-white/60 rounded-xl overflow-hidden ring-1 ring-slate-900/5'
              : '',
            isFloating && !isResizing && 'shadow-2xl shadow-brand-purple/20'
          )}
        >
          {/* Floating Mode: Full size drag handle overlay */}
          {isFloating && <div className="drag-handle absolute inset-0 z-10 cursor-move" />}

          {/* Floating Mode Overlay Controls (Buttons) */}
          {isFloating && (
            <div className="absolute top-0 inset-x-0 h-8 bg-linear-to-b from-black/60 to-transparent z-20 flex justify-end gap-2 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {/* Buttons need pointer-events-auto because parent is pointer-events-none */}
              <button
                onClick={() => setIsFloating(false)}
                className="p-1 bg-black/60 hover:bg-black/80 text-white rounded cursor-pointer pointer-events-auto"
                title={t('videoPreview.dock')}
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Player Container */}
          <div className="relative bg-black overflow-hidden flex-1 flex items-center justify-center w-full h-full">
            {videoSrc ? (
              <div
                className="relative bg-black"
                style={{
                  aspectRatio: videoDimensions
                    ? `${videoDimensions.width} / ${videoDimensions.height}`
                    : '16 / 9',
                  maxWidth: '100%',
                  maxHeight: '100%',
                }}
              >
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className={cn(
                    'w-full h-full object-contain relative z-0',
                    isResizing && 'pointer-events-none' // Disable interaction during resize
                  )}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      setVideoDimensions({
                        width: videoRef.current.videoWidth,
                        height: videoRef.current.videoHeight,
                      });
                      setDuration(videoRef.current.duration);
                      setReady(true);
                      // Restore time if switching modes (use ref to get latest value)
                      if (currentTimeRef.current > 0) {
                        videoRef.current.currentTime = currentTimeRef.current;
                      }
                      // Restore playback state if it was playing
                      if (playing) {
                        videoRef.current
                          .play()
                          .catch(() => logger.error('Failed to play video', 'Playback error'));
                      }
                      // Restore mute state
                      if (muted) {
                        videoRef.current.muted = true;
                      }
                    }
                  }}
                  onEnded={() => setPlaying(false)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                />

                {/* ASS Subtitle Container - Absolute positioned over video */}
                <div
                  ref={assContainerRef}
                  className="absolute inset-0 pointer-events-none z-10"
                  style={{
                    // Ensure it stays on top but lets events pass through to video
                    pointerEvents: 'none',
                  }}
                />

                {/* Loading overlay - Inside wrapper to show over video area */}
                {!ready && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
                    <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-2">
                {isTranscoding ? (
                  <>
                    <div className="w-6 h-6 border-2 border-slate-500/30 border-t-slate-500 rounded-full animate-spin" />
                    {t('videoPreview.loading')}
                  </>
                ) : (
                  t('videoPreview.noVideo')
                )}
              </div>
            )}
          </div>

          {/* Controls */}
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-2 bg-white/95 backdrop-blur-md w-full z-20 shadow-sm transition-colors',
              isFloating ? 'border-t border-slate-200' : 'rounded-b-lg' // Use border if floating, rounded-b if docked
            )}
          >
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              disabled={!videoSrc}
              className={cn(
                'p-1.5 rounded-lg transition-all',
                videoSrc
                  ? 'text-slate-700 hover:text-brand-purple hover:bg-brand-purple/5'
                  : 'text-slate-400 cursor-not-allowed'
              )}
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
            </button>

            {/* Time */}
            <span className="text-xs text-slate-500 font-mono font-medium min-w-17.5 text-center">
              {formatDuration(currentTime)} / {formatDuration(displayDuration)}
            </span>

            {/* Progress Bar */}
            <div className="flex-1 relative h-1.5 group mx-2 cursor-pointer">
              <div className="absolute inset-0 bg-slate-200 rounded-full transition-all group-hover:h-2 group-hover:-my-px" />
              {transcodedDuration !== undefined && (
                <div
                  className="absolute h-full bg-brand-purple/30 rounded-full transition-all group-hover:h-2 group-hover:-my-px"
                  style={{ width: `${transcodedProgress}%` }}
                />
              )}
              <div
                className="absolute h-full bg-brand-purple rounded-full transition-all group-hover:h-2 group-hover:-my-px shadow-sm"
                style={{ width: `${currentProgress}%` }}
              />
              <input
                type="range"
                min={0}
                max={displayDuration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                disabled={!videoSrc || isTranscoding}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                title={isTranscoding ? t('videoPreview.jumpAfterTranscode') : undefined}
              />
            </div>

            {/* Volume */}
            <div className="relative group/volume">
              <button
                onClick={toggleMute}
                className="p-1.5 text-slate-600 hover:text-brand-purple hover:bg-brand-purple/5 rounded-lg transition-all"
              >
                {muted || volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              {/* Vertical volume slider popup */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pb-2 hidden group-hover/volume:flex flex-col items-center">
                <div className="bg-white/95 rounded-lg px-2 py-3 shadow-lg border border-slate-200 backdrop-blur-md">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="h-20 w-1 bg-slate-200 rounded appearance-none cursor-pointer [writing-mode:vertical-lr] [direction:rtl] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-brand-purple [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white"
                  />
                </div>
              </div>
            </div>

            {/* Source Text Toggle */}
            {onToggleSourceText && (
              <button
                onClick={onToggleSourceText}
                className={cn(
                  'p-1.5 transition-all ml-1 rounded-lg',
                  showSourceText
                    ? 'text-brand-purple bg-brand-purple/10 font-medium'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                )}
                title={
                  showSourceText
                    ? t('batchHeader.hideSource', { ns: 'editor' })
                    : t('batchHeader.showSource', { ns: 'editor' })
                }
              >
                <Languages className="w-4 h-4" />
              </button>
            )}

            {/* Floating Toggle */}
            {!isFloating && (
              <button
                onClick={() => setIsFloating(true)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all ml-1"
                title={t('videoPreview.float')}
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ),
      [
        isFloating,
        isResizing,
        videoSrc,
        ready,
        playing,
        currentTime,
        displayDuration,
        showSourceText,
        transcodedDuration,
        transcodedProgress,
        currentProgress,
        volume,
        muted,
        handleTimeUpdate,
        handleSeek,
        handleVolumeChange,
        togglePlay,
        toggleMute,
        t,
        isTranscoding,
        onToggleSourceText,
        videoDimensions,
      ]
    ); // Removed dockedHeight dependency

    // Collapsed state - just show expand button
    if (isCollapsed) {
      return (
        <button
          onClick={onToggleCollapse}
          className="w-full p-2 bg-white border-b border-slate-200 flex items-center gap-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all font-medium"
        >
          <ChevronDown className="w-4 h-4 text-slate-400" />
          <span className="text-sm">{t('videoPreview.expand')}</span>
          {isTranscoding && (
            <span className="ml-auto text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              {t('videoPreview.transcoding')} {transcodeProgress}%
            </span>
          )}
        </button>
      );
    }

    return (
      <div className="bg-white border-b border-slate-200 select-none shadow-sm z-30 relative">
        {/* Header - Only show in docked mode */}
        {!isFloating && (
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50/50">
            <button
              onClick={onToggleCollapse}
              className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-medium"
            >
              <ChevronUp className="w-4 h-4 text-slate-400" />
              <span className="text-sm">{t('videoPreview.title')}</span>
            </button>
            <div className="flex items-center gap-2">
              {isTranscoding && (
                <span className="text-xs text-amber-600 animate-pulse font-medium">
                  {t('videoPreview.transcoding')} {transcodeProgress}%
                </span>
              )}
              {/* Helper Float Button in Header too */}
              <button
                onClick={() => setIsFloating(true)}
                className="p-1 hover:bg-white rounded text-slate-400 hover:text-brand-purple hover:shadow-sm border border-transparent hover:border-slate-200 transition-all"
                title={t('videoPreview.float')}
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Content Container */}
        {isFloating ? (
          <>
            <div className="h-10 bg-slate-100 flex items-center justify-center text-xs text-slate-500 gap-2">
              <span>{t('videoPreview.floatingMode')}</span>
              <button
                onClick={() => setIsFloating(false)}
                className="text-indigo-400 hover:underline flex items-center gap-1"
              >
                <Minimize2 className="w-3 h-3" />
                {t('videoPreview.restore')}
              </button>
            </div>
            {createPortal(
              <Rnd
                default={{
                  x: window.innerWidth - 360,
                  y: window.innerHeight - 280,
                  width: 320,
                  height: 220,
                }}
                minWidth={240}
                minHeight={135}
                bounds="window"
                dragHandleClassName="drag-handle"
                className="z-9999"
                lockAspectRatio={false}
                scale={rndScale}
                onResizeStart={() => setIsResizing(true)}
                onResizeStop={() => setIsResizing(false)}
              >
                {playerContent}
              </Rnd>,
              document.body
            )}
          </>
        ) : (
          /* Docked Mode - Centered with Resize Handle */
          <div className="relative w-full flex flex-col items-center">
            <div
              className="w-full transition-[height] duration-75 ease-out shadow-sm"
              style={{ height: dockedHeight }}
            >
              {playerContent}
            </div>

            {/* Resize Handle - Integrated look */}
            <div
              className="w-full h-3 flex items-center justify-center cursor-ns-resize hover:bg-slate-100/50 transition-colors group/handle z-50 border-b border-slate-100"
              onMouseDown={handleResizeStart}
              title={t('videoPreview.resize')}
            >
              <div className="w-12 h-1 bg-slate-300 rounded-full group-hover/handle:bg-brand-purple transition-colors shadow-sm" />
            </div>
          </div>
        )}
      </div>
    );
  }
);

VideoPlayerPreview.displayName = 'VideoPlayerPreview';
