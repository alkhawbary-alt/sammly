import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Eye,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Box,
  Palette,
  Layers,
  Hand,
  MousePointer,
  RotateCcw,
  Ruler,
  Maximize,
  Minimize,
  SlidersHorizontal,
  ChevronDown,
  Sparkles,
  Camera,
  Grid,
  Crosshair,
} from 'lucide-react';
import { DesignDocument, TextStyle, Layer } from './utils/htmlGenerator';
import { findLayerById } from './utils/layerUtils';
import Rulers from './Rulers';
import CanvasSelectionOverlay from './CanvasSelectionOverlay';

interface CanvasPreviewProps {
  design: DesignDocument | null;
  fullHtml: string;
  zoomScale: number;
  setZoomScale: React.Dispatch<React.SetStateAction<number>>;
  showOutlines: boolean;
  setShowOutlines: (val: boolean | ((prev: boolean) => boolean)) => void;
  canvasBgMode: 'checkered' | 'white' | 'dark' | 'slate' | 'dots' | 'grid';
  setCanvasBgMode: (mode: any) => void;
  selectedLayerId?: string | null;
  onSelectTextLayer?: (id: string | null) => void;
  onUpdateText?: (id: string, text: string) => void;
  onUpdateStyle?: (id: string, styleUpdates: Partial<TextStyle>) => void;
  onUpdateBounds?: (id: string, bounds: { x?: number; y?: number; width?: number; height?: number }) => void;
  onResetLayer?: (id: string) => void;
  onQuickSnapshot?: () => void;
}

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export default function CanvasPreview({
  design,
  fullHtml,
  zoomScale,
  setZoomScale,
  showOutlines,
  setShowOutlines,
  canvasBgMode,
  setCanvasBgMode,
  selectedLayerId,
  onSelectTextLayer,
  onUpdateText,
  onUpdateStyle,
  onUpdateBounds,
  onResetLayer,
  onQuickSnapshot,
}: CanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Pan & Navigation state
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<'select' | 'hand'>('select');
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
  const [showRulers, setShowRulers] = useState<boolean>(true);
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 800, height: 600 });
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [showZoomMenu, setShowZoomMenu] = useState<boolean>(false);
  const [isInlineEditing, setIsInlineEditing] = useState<boolean>(false);

  // Find currently selected layer
  const selectedLayer: Layer | null = useMemo(() => {
    if (!design || !selectedLayerId) return null;
    return findLayerById(design.layers, selectedLayerId);
  }, [design, selectedLayerId]);

  // Measure container dimensions for rulers and positioning via ResizeObserver
  useEffect(() => {
    if (!viewportRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, []);

  // Listen to iframe layer selection & double click edit
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;
      if (event.data.type === 'SELECT_TEXT_LAYER' && onSelectTextLayer) {
        onSelectTextLayer(event.data.id);
        setIsInlineEditing(false);
      } else if (event.data.type === 'EDIT_TEXT_LAYER' && onSelectTextLayer) {
        onSelectTextLayer(event.data.id);
        setIsInlineEditing(true);
      } else if (event.data.type === 'DESELECT_LAYER' && onSelectTextLayer) {
        onSelectTextLayer(null);
        setIsInlineEditing(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSelectTextLayer]);

  // Sync selection to iframe
  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: 'SYNC_SELECTION', selectedId: selectedLayerId },
        '*'
      );
    }
  }, [selectedLayerId]);

  // Fit to screen helper - ensures 100% of file is visible without clipping or scrollbars
  const fitToScreen = useCallback(() => {
    if (!design || !viewportRef.current) return;
    const paddingX = showRulers ? 64 : 48;
    const paddingY = showRulers ? 80 : 64;
    const availableWidth = viewportRef.current.clientWidth - paddingX;
    const availableHeight = viewportRef.current.clientHeight - paddingY;
    if (availableWidth <= 0 || availableHeight <= 0 || design.width <= 0 || design.height <= 0) return;

    const scaleX = availableWidth / design.width;
    const scaleY = availableHeight / design.height;
    const bestScale = Math.min(scaleX, scaleY);
    // Clamp between 0.1 and 2.0 to handle huge or small documents cleanly
    const clampedScale = Math.max(0.1, Math.min(2.0, parseFloat(bestScale.toFixed(2))));
    setZoomScale(clampedScale);
    setPanOffset({ x: 0, y: 0 });
  }, [design?.width, design?.height, showRulers, setZoomScale]);

  // Auto-fit on initial design load or file change
  useEffect(() => {
    if (design) {
      const timer = setTimeout(() => {
        fitToScreen();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [design?.id, design?.width, design?.height, fitToScreen]);

  // Reset view to center & 100%
  const resetView = () => {
    setZoomScale(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  // Keyboard navigation, hotkeys & nudge
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setIsSpacePressed(true);
      } else if (e.key === 'v' || e.key === 'V') {
        setActiveTool('select');
      } else if (e.key === 'h' || e.key === 'H') {
        setActiveTool('hand');
      } else if (e.key === 'r' || e.key === 'R') {
        setShowRulers((prev) => !prev);
      } else if (e.key === 'g' || e.key === 'G') {
        setShowGuides((prev) => !prev);
      } else if (e.key === 'b' || e.key === 'B') {
        setShowOutlines((prev) => !prev);
      } else if (e.key === 'f' || e.key === 'F') {
        fitToScreen();
      } else if (e.key === '0' || e.key === '1') {
        resetView();
      } else if (e.key === 'Escape') {
        if (isInlineEditing) {
          setIsInlineEditing(false);
        } else if (selectedLayerId && onSelectTextLayer) {
          onSelectTextLayer(null);
        } else if (isFullscreen) {
          setIsFullscreen(false);
        }
      } else if (selectedLayer && onUpdateBounds && !isInlineEditing) {
        // Nudge with arrow keys
        const nudgeAmount = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onUpdateBounds(selectedLayer.id, { x: selectedLayer.x - nudgeAmount });
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          onUpdateBounds(selectedLayer.id, { x: selectedLayer.x + nudgeAmount });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          onUpdateBounds(selectedLayer.id, { y: selectedLayer.y - nudgeAmount });
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          onUpdateBounds(selectedLayer.id, { y: selectedLayer.y + nudgeAmount });
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [fitToScreen, isFullscreen, setShowOutlines, selectedLayer, onUpdateBounds, isInlineEditing, selectedLayerId, onSelectTextLayer]);

  // Wheel zoom and pan
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      setZoomScale((prev) => {
        const next = Math.min(3.0, Math.max(0.15, prev * zoomFactor));
        return parseFloat(next.toFixed(2));
      });
    } else if (e.shiftKey) {
      e.preventDefault();
      setPanOffset((prev) => ({ ...prev, x: prev.x - e.deltaY * 0.8 }));
    } else {
      e.preventDefault();
      setPanOffset((prev) => ({ ...prev, y: prev.y - e.deltaY * 0.8 }));
    }
  };

  // Mouse pan drag start
  const handleMouseDown = (e: React.MouseEvent) => {
    const isPanMode = activeTool === 'hand' || isSpacePressed || e.button === 1; // Middle click
    if (isPanMode) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    if (isDragging) {
      e.preventDefault();
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    if (isDragging) setIsDragging(false);
  };

  const isPanningActive = activeTool === 'hand' || isSpacePressed;

  return (
    <section
      className={`preview-container ${isFullscreen ? 'canvas-fullscreen' : ''}`}
      ref={containerRef}
    >
      {/* Pro Canvas Toolbar */}
      <div className="preview-toolbar pro-toolbar">
        {/* Left: Tool Selection & Artboard Details */}
        <div className="preview-info-left">
          {/* Tool switchers */}
          <div className="tool-toggle-box">
            <button
              className={`tool-switch-btn ${activeTool === 'select' && !isSpacePressed ? 'active' : ''}`}
              onClick={() => setActiveTool('select')}
              title="Select Tool (V) • Click or drag text layers"
            >
              <MousePointer size={14} />
            </button>
            <button
              className={`tool-switch-btn ${isPanningActive ? 'active' : ''}`}
              onClick={() => setActiveTool('hand')}
              title="Hand Tool (H / Space) • Drag to pan canvas"
            >
              <Hand size={14} />
            </button>
          </div>

          <div className="live-status-pill">
            <span className="live-dot" />
            <Eye size={14} />
            <span className="live-text-bold">Live Studio Preview</span>
          </div>

          {design && (
            <div className="artboard-meta-pill">
              <span className="dim-text">{design.width} × {design.height} px</span>
              {design.meta?.sourceFormat && (
                <span className="badge badge-source-mini">
                  {design.meta.sourceFormat.toUpperCase()}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Pro View Controls */}
        <div className="preview-controls-right">
          {/* Smart Guides Toggle */}
          <button
            className={`btn btn-outline btn-sm ${showGuides ? 'active' : ''}`}
            onClick={() => setShowGuides((prev) => !prev)}
            title="Toggle Smart Distance Guides (G)"
          >
            <Crosshair size={13} />
            <span>Guides</span>
          </button>

          {/* Rulers Toggle */}
          <button
            className={`btn btn-outline btn-sm ${showRulers ? 'active' : ''}`}
            onClick={() => setShowRulers((prev) => !prev)}
            title="Toggle Pixel Precision Rulers (R)"
          >
            <Ruler size={13} />
            <span>Rulers</span>
          </button>

          {/* Text Bounds Toggle */}
          <button
            className={`btn btn-outline btn-sm ${showOutlines ? 'active' : ''}`}
            onClick={() => setShowOutlines((prev) => !prev)}
            title="Highlight all text layer bounds (B)"
          >
            <Box size={13} />
            <span>Bounds</span>
          </button>

          {/* Backdrop Toggle */}
          <div className="bg-toggle-group">
            <button
              className={`bg-btn ${canvasBgMode === 'checkered' ? 'active' : ''}`}
              onClick={() => setCanvasBgMode('checkered')}
              title="Checkerboard Backdrop"
            >
              🏁
            </button>
            <button
              className={`bg-btn ${canvasBgMode === 'dots' ? 'active' : ''}`}
              onClick={() => setCanvasBgMode('dots')}
              title="Figma Dot Matrix Backdrop"
            >
              📐
            </button>
            <button
              className={`bg-btn ${canvasBgMode === 'grid' ? 'active' : ''}`}
              onClick={() => setCanvasBgMode('grid')}
              title="Graph Paper Grid Backdrop"
            >
              📏
            </button>
            <button
              className={`bg-btn ${canvasBgMode === 'dark' ? 'active' : ''}`}
              onClick={() => setCanvasBgMode('dark')}
              title="OLED Dark Studio Backdrop"
            >
              ⬛
            </button>
            <button
              className={`bg-btn ${canvasBgMode === 'slate' ? 'active' : ''}`}
              onClick={() => setCanvasBgMode('slate')}
              title="Neutral Studio Slate Backdrop"
            >
              🔘
            </button>
            <button
              className={`bg-btn ${canvasBgMode === 'white' ? 'active' : ''}`}
              onClick={() => setCanvasBgMode('white')}
              title="Paper Light Backdrop"
            >
              ⬜
            </button>
          </div>

          {/* Zoom controls & dropdown */}
          <div className="zoom-controls pro-zoom">
            <button
              className="btn btn-outline btn-sm icon-only"
              onClick={() => setZoomScale((z) => Math.max(0.15, parseFloat((z - 0.1).toFixed(2))))}
              title="Zoom Out (-10%)"
            >
              <ZoomOut size={13} />
            </button>

            <div className="zoom-dropdown-wrapper">
              <button
                className="zoom-display-btn"
                onClick={() => setShowZoomMenu((prev) => !prev)}
                title="Select zoom level"
              >
                <span>{Math.round(zoomScale * 100)}%</span>
                <ChevronDown size={11} />
              </button>

              {showZoomMenu && (
                <div className="zoom-menu-dropdown">
                  {ZOOM_PRESETS.map((p) => (
                    <button
                      key={p}
                      className={`zoom-menu-item ${zoomScale === p ? 'active' : ''}`}
                      onClick={() => {
                        setZoomScale(p);
                        setShowZoomMenu(false);
                      }}
                    >
                      {Math.round(p * 100)}%
                    </button>
                  ))}
                  <div className="zoom-menu-divider" />
                  <button
                    className="zoom-menu-item"
                    onClick={() => {
                      fitToScreen();
                      setShowZoomMenu(false);
                    }}
                  >
                    Fit to Screen (F)
                  </button>
                  <button
                    className="zoom-menu-item"
                    onClick={() => {
                      resetView();
                      setShowZoomMenu(false);
                    }}
                  >
                    100% Actual Size
                  </button>
                </div>
              )}
            </div>

            <button
              className="btn btn-outline btn-sm icon-only"
              onClick={() => setZoomScale((z) => Math.min(3.0, parseFloat((z + 0.1).toFixed(2))))}
              title="Zoom In (+10%)"
            >
              <ZoomIn size={13} />
            </button>

            <button
              className="btn btn-outline btn-sm"
              onClick={fitToScreen}
              title="Fit to Screen (F)"
            >
              <Maximize2 size={13} /> Fit
            </button>

            <button
              className="btn btn-outline btn-sm icon-only"
              onClick={resetView}
              title="Reset View (Center & 100%)"
            >
              <RotateCcw size={13} />
            </button>
          </div>

          {/* Quick Snapshot Button */}
          {onQuickSnapshot && (
            <button
              className="btn btn-outline btn-sm"
              onClick={onQuickSnapshot}
              title="Render & Export Instant PNG Snapshot"
            >
              <Camera size={13} />
              <span>Snapshot</span>
            </button>
          )}

          {/* Fullscreen Button */}
          <button
            className={`btn btn-outline btn-sm icon-only ${isFullscreen ? 'active' : ''}`}
            onClick={() => setIsFullscreen((prev) => !prev)}
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Expand Canvas Fullscreen'}
          >
            {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
          </button>
        </div>
      </div>

      {/* Main Viewport Stage with Pan & Zoom */}
      <div
        className={`preview-viewport bg-mode-${canvasBgMode} ${isPanningActive ? 'cursor-grab' : ''} ${isDragging ? 'cursor-grabbing' : ''}`}
        ref={viewportRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          handleMouseUp();
          setMousePos(null);
        }}
      >
        {/* Pixel Rulers Overlay */}
        {showRulers && design && (
          <Rulers
            width={design.width}
            height={design.height}
            zoomScale={zoomScale}
            panOffset={panOffset}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
            mousePos={mousePos}
          />
        )}

        {/* Centered Transform Stage */}
        {fullHtml && design ? (
          <div
            className="canvas-stage"
            style={{
              position: 'relative',
              width: `${design.width}px`,
              height: `${design.height}px`,
              transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0px) scale(${zoomScale})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.08s ease-out',
            }}
          >
            {/* Artboard Figma-style Tag */}
            <div
              className="artboard-frame-header"
              style={{
                position: 'absolute',
                top: '-28px',
                left: 0,
                pointerEvents: 'none',
              }}
            >
              <span className="artboard-title"># {design.name || 'Artboard 1'}</span>
              <span className="artboard-size-badge">
                {design.width} × {design.height}
              </span>
            </div>

            {/* Artboard Frame & Iframe */}
            <div
              className="preview-frame-wrapper pro-artboard-shadow"
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                backgroundColor: design.backgroundColor || '#ffffff',
                pointerEvents: isDragging ? 'none' : 'auto',
              }}
            >
              <iframe
                ref={iframeRef}
                title="Design Canvas Preview"
                srcDoc={fullHtml}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  display: 'block',
                  pointerEvents: isDragging ? 'none' : 'auto',
                }}
                sandbox="allow-scripts"
              />

              {/* Interactive Figma-grade Selection & Transformation Overlay */}
              <CanvasSelectionOverlay
                selectedLayer={selectedLayer}
                artboardWidth={design.width}
                artboardHeight={design.height}
                zoomScale={zoomScale}
                showGuides={showGuides}
                onUpdateBounds={onUpdateBounds}
                onUpdateText={onUpdateText}
                onUpdateStyle={onUpdateStyle}
                onResetLayer={onResetLayer}
                onDeselect={() => onSelectTextLayer?.(null)}
                isInlineEditing={isInlineEditing}
                setIsInlineEditing={setIsInlineEditing}
              />
            </div>
          </div>
        ) : (
          <div className="preview-placeholder">
            <Layers size={48} className="text-muted" />
            <h3>No Design Loaded</h3>
            <p>Upload a PSD, SVG, or image to generate the interactive canvas.</p>
          </div>
        )}

        {/* Pro Canvas HUD Status Bar (Bottom overlay) */}
        {design && (
          <div className="canvas-hud-overlay">
            <div className="hud-pill">
              <span className="hud-coord">
                X: {Math.round(panOffset.x)} Y: {Math.round(panOffset.y)}
              </span>
              <span className="hud-sep">•</span>
              <span className="hud-zoom">{Math.round(zoomScale * 100)}%</span>
              <span className="hud-sep">•</span>
              <span className="hud-hint">
                <kbd>Space</kbd> Pan • <kbd>Ctrl</kbd>+Scroll Zoom • <kbd>DblClick</kbd> Edit • <kbd>Arrows</kbd> Move • <kbd>G</kbd> Guides
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
