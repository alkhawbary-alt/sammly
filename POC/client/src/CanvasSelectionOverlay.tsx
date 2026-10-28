import React, { useState, useEffect, useRef } from 'react';
import {
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RotateCcw,
  X,
  Edit3,
  Minus,
  Plus,
} from 'lucide-react';
import { Layer, TextStyle } from './utils/htmlGenerator';

interface CanvasSelectionOverlayProps {
  selectedLayer: Layer | null;
  artboardWidth: number;
  artboardHeight: number;
  zoomScale: number;
  showGuides: boolean;
  onUpdateBounds?: (id: string, bounds: { x?: number; y?: number; width?: number; height?: number }) => void;
  onUpdateText?: (id: string, text: string) => void;
  onUpdateStyle?: (id: string, styleUpdates: Partial<TextStyle>) => void;
  onResetLayer?: (id: string) => void;
  onDeselect: () => void;
  isInlineEditing: boolean;
  setIsInlineEditing: (val: boolean) => void;
}

const COMMON_FONTS = [
  'Inter',
  'Roboto',
  'Montserrat',
  'Open Sans',
  'Playfair Display',
  'Oswald',
  'JetBrains Mono',
];

const PRESET_COLORS = [
  '#ffffff',
  '#000000',
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
];

export default function CanvasSelectionOverlay({
  selectedLayer,
  artboardWidth,
  artboardHeight,
  zoomScale,
  showGuides,
  onUpdateBounds,
  onUpdateText,
  onUpdateStyle,
  onResetLayer,
  onDeselect,
  isInlineEditing,
  setIsInlineEditing,
}: CanvasSelectionOverlayProps) {
  const [isDraggingBox, setIsDraggingBox] = useState<boolean>(false);
  const [dragHandle, setDragHandle] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ mouseX: number; mouseY: number; boxX: number; boxY: number; boxW: number; boxH: number }>({
    mouseX: 0,
    mouseY: 0,
    boxX: 0,
    boxY: 0,
    boxW: 0,
    boxH: 0,
  });

  const inlineTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [inlineTextVal, setInlineTextVal] = useState<string>('');

  // Sync inline editor text when layer changes
  useEffect(() => {
    if (selectedLayer && selectedLayer.text !== undefined) {
      setInlineTextVal(selectedLayer.text);
    }
  }, [selectedLayer?.id, selectedLayer?.text]);

  // Focus and select all text when inline editing starts
  useEffect(() => {
    if (isInlineEditing && inlineTextareaRef.current) {
      inlineTextareaRef.current.focus();
      inlineTextareaRef.current.select();
    }
  }, [isInlineEditing]);

  const style = selectedLayer?.style || {};
  const fontSize = typeof style.fontSize === 'number' ? style.fontSize : 18;
  const isBold = style.fontWeight === 'bold' || Number(style.fontWeight) >= 700;
  const isItalic = style.fontStyle === 'italic';
  const textAlign = style.textAlign || 'left';
  const currentColor = style.color || '#ffffff';

  // Dragging bounding box to move
  const handleBoxMouseDown = (e: React.MouseEvent) => {
    if (!selectedLayer || isInlineEditing) return;
    if ((e.target as HTMLElement).closest('.floating-action-hud')) return;
    if ((e.target as HTMLElement).classList.contains('selection-handle')) return;

    e.preventDefault();
    e.stopPropagation();
    setIsDraggingBox(true);
    setDragStartPos({
      mouseX: e.clientX,
      mouseY: e.clientY,
      boxX: selectedLayer.x,
      boxY: selectedLayer.y,
      boxW: selectedLayer.width,
      boxH: selectedLayer.height,
    });
  };

  // Dragging handles to resize
  const handleResizeMouseDown = (handle: string, e: React.MouseEvent) => {
    if (!selectedLayer || isInlineEditing) return;
    e.preventDefault();
    e.stopPropagation();
    setDragHandle(handle);
    setDragStartPos({
      mouseX: e.clientX,
      mouseY: e.clientY,
      boxX: selectedLayer.x,
      boxY: selectedLayer.y,
      boxW: selectedLayer.width,
      boxH: selectedLayer.height,
    });
  };

  // Global mouse move & up for smooth manipulation
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!onUpdateBounds) return;

      const deltaX = (e.clientX - dragStartPos.mouseX) / zoomScale;
      const deltaY = (e.clientY - dragStartPos.mouseY) / zoomScale;

      if (isDraggingBox) {
        onUpdateBounds(selectedLayer.id, {
          x: Math.round(dragStartPos.boxX + deltaX),
          y: Math.round(dragStartPos.boxY + deltaY),
        });
      } else if (dragHandle) {
        let newX = dragStartPos.boxX;
        let newY = dragStartPos.boxY;
        let newW = dragStartPos.boxW;
        let newH = dragStartPos.boxH;

        if (dragHandle.includes('e')) newW = Math.max(20, dragStartPos.boxW + deltaX);
        if (dragHandle.includes('s')) newH = Math.max(16, dragStartPos.boxH + deltaY);
        if (dragHandle.includes('w')) {
          const proposedW = dragStartPos.boxW - deltaX;
          if (proposedW >= 20) {
            newX = dragStartPos.boxX + deltaX;
            newW = proposedW;
          }
        }
        if (dragHandle.includes('n')) {
          const proposedH = dragStartPos.boxH - deltaY;
          if (proposedH >= 16) {
            newY = dragStartPos.boxY + deltaY;
            newH = proposedH;
          }
        }

        onUpdateBounds(selectedLayer.id, {
          x: Math.round(newX),
          y: Math.round(newY),
          width: Math.round(newW),
          height: Math.round(newH),
        });
      }
    };

    const handleMouseUp = () => {
      if (isDraggingBox) setIsDraggingBox(false);
      if (dragHandle) setDragHandle(null);
    };

    if (isDraggingBox || dragHandle) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDraggingBox, dragHandle, dragStartPos, selectedLayer?.id, zoomScale, onUpdateBounds]);

  const handleFinishInlineEdit = () => {
    setIsInlineEditing(false);
    if (onUpdateText && selectedLayer) {
      onUpdateText(selectedLayer.id, inlineTextVal);
    }
  };

  if (!selectedLayer) return null;

  // Dimensions & guides calculations
  const leftDist = Math.max(0, Math.round(selectedLayer.x));
  const topDist = Math.max(0, Math.round(selectedLayer.y));
  const rightDist = Math.max(0, Math.round(artboardWidth - (selectedLayer.x + selectedLayer.width)));
  const bottomDist = Math.max(0, Math.round(artboardHeight - (selectedLayer.y + selectedLayer.height)));

  const isHudOnBottom = selectedLayer.y < 56;

  return (
    <div className="canvas-selection-overlay" style={{ pointerEvents: 'none' }}>
      {/* Smart Distance Guides (Figma Alt / Selection style) */}
      {showGuides && !isInlineEditing && (
        <div className="smart-guides-layer">
          {/* Top guide */}
          {topDist > 0 && (
            <div
              className="smart-guide guide-vertical"
              style={{
                left: `${selectedLayer.x + selectedLayer.width / 2}px`,
                top: 0,
                height: `${topDist}px`,
              }}
            >
              <span className="guide-pill">{topDist}px</span>
            </div>
          )}

          {/* Bottom guide */}
          {bottomDist > 0 && (
            <div
              className="smart-guide guide-vertical"
              style={{
                left: `${selectedLayer.x + selectedLayer.width / 2}px`,
                top: `${selectedLayer.y + selectedLayer.height}px`,
                height: `${bottomDist}px`,
              }}
            >
              <span className="guide-pill">{bottomDist}px</span>
            </div>
          )}

          {/* Left guide */}
          {leftDist > 0 && (
            <div
              className="smart-guide guide-horizontal"
              style={{
                top: `${selectedLayer.y + selectedLayer.height / 2}px`,
                left: 0,
                width: `${leftDist}px`,
              }}
            >
              <span className="guide-pill">{leftDist}px</span>
            </div>
          )}

          {/* Right guide */}
          {rightDist > 0 && (
            <div
              className="smart-guide guide-horizontal"
              style={{
                top: `${selectedLayer.y + selectedLayer.height / 2}px`,
                left: `${selectedLayer.x + selectedLayer.width}px`,
                width: `${rightDist}px`,
              }}
            >
              <span className="guide-pill">{rightDist}px</span>
            </div>
          )}
        </div>
      )}

      {/* Main Bounding Box */}
      <div
        className={`figma-selection-box ${isDraggingBox ? 'dragging' : ''} ${isInlineEditing ? 'in-edit-mode' : ''}`}
        style={{
          left: `${selectedLayer.x}px`,
          top: `${selectedLayer.y}px`,
          width: `${selectedLayer.width}px`,
          height: `${selectedLayer.height}px`,
          pointerEvents: 'auto',
        }}
        onMouseDown={handleBoxMouseDown}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setIsInlineEditing(true);
        }}
      >
        {/* Layer Badge Tag (Top) */}
        {!isInlineEditing && (
          <div className="selection-badge-tag">
            <span className="badge-tag-icon">T</span>
            <span className="badge-tag-name">{selectedLayer.name}</span>
            <span className="badge-tag-size">
              {Math.round(selectedLayer.width)} × {Math.round(selectedLayer.height)}
            </span>
            <span className="badge-tag-hint">Double-click to edit</span>
          </div>
        )}

        {/* 8 Precision Transform Handles */}
        {!isInlineEditing && (
          <>
            {/* 4 Corners */}
            <div
              className="selection-handle handle-tl"
              onMouseDown={(e) => handleResizeMouseDown('nw', e)}
              title="Resize Top-Left"
            />
            <div
              className="selection-handle handle-tr"
              onMouseDown={(e) => handleResizeMouseDown('ne', e)}
              title="Resize Top-Right"
            />
            <div
              className="selection-handle handle-bl"
              onMouseDown={(e) => handleResizeMouseDown('sw', e)}
              title="Resize Bottom-Left"
            />
            <div
              className="selection-handle handle-br"
              onMouseDown={(e) => handleResizeMouseDown('se', e)}
              title="Resize Bottom-Right"
            />

            {/* 4 Edge Midpoints */}
            <div
              className="selection-handle handle-tc"
              onMouseDown={(e) => handleResizeMouseDown('n', e)}
              title="Resize Top Edge"
            />
            <div
              className="selection-handle handle-bc"
              onMouseDown={(e) => handleResizeMouseDown('s', e)}
              title="Resize Bottom Edge"
            />
            <div
              className="selection-handle handle-lc"
              onMouseDown={(e) => handleResizeMouseDown('w', e)}
              title="Resize Left Edge"
            />
            <div
              className="selection-handle handle-rc"
              onMouseDown={(e) => handleResizeMouseDown('e', e)}
              title="Resize Right Edge"
            />
          </>
        )}

        {/* Floating Contextual Action Bar (HUD) */}
        {!isInlineEditing && (
          <div
            className={`floating-action-hud ${isHudOnBottom ? 'hud-bottom' : 'hud-top'}`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Font Family Quick Select */}
            <select
              className="hud-font-select"
              value={style.fontFamily || 'Inter'}
              onChange={(e) => onUpdateStyle?.(selectedLayer.id, { fontFamily: e.target.value })}
              title="Font Family"
            >
              {COMMON_FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>

            {/* Font Size Stepper */}
            <div className="hud-stepper">
              <button
                className="hud-btn-mini"
                onClick={() => onUpdateStyle?.(selectedLayer.id, { fontSize: Math.max(8, fontSize - 2) })}
                title="Decrease font size"
              >
                <Minus size={11} />
              </button>
              <span className="hud-stepper-val">{fontSize}</span>
              <button
                className="hud-btn-mini"
                onClick={() => onUpdateStyle?.(selectedLayer.id, { fontSize: Math.min(180, fontSize + 2) })}
                title="Increase font size"
              >
                <Plus size={11} />
              </button>
            </div>

            <div className="hud-divider" />

            {/* Bold Toggle */}
            <button
              className={`hud-icon-btn ${isBold ? 'active' : ''}`}
              onClick={() => onUpdateStyle?.(selectedLayer.id, { fontWeight: isBold ? 'normal' : 'bold' })}
              title="Toggle Bold"
            >
              <Bold size={12} />
            </button>

            {/* Italic Toggle */}
            <button
              className={`hud-icon-btn ${isItalic ? 'active' : ''}`}
              onClick={() => onUpdateStyle?.(selectedLayer.id, { fontStyle: isItalic ? 'normal' : 'italic' })}
              title="Toggle Italic"
            >
              <Italic size={12} />
            </button>

            <div className="hud-divider" />

            {/* Alignment Toggles */}
            <button
              className={`hud-icon-btn ${textAlign === 'left' ? 'active' : ''}`}
              onClick={() => onUpdateStyle?.(selectedLayer.id, { textAlign: 'left' })}
              title="Align Left"
            >
              <AlignLeft size={12} />
            </button>
            <button
              className={`hud-icon-btn ${textAlign === 'center' ? 'active' : ''}`}
              onClick={() => onUpdateStyle?.(selectedLayer.id, { textAlign: 'center' })}
              title="Align Center"
            >
              <AlignCenter size={12} />
            </button>
            <button
              className={`hud-icon-btn ${textAlign === 'right' ? 'active' : ''}`}
              onClick={() => onUpdateStyle?.(selectedLayer.id, { textAlign: 'right' })}
              title="Align Right"
            >
              <AlignRight size={12} />
            </button>

            <div className="hud-divider" />

            {/* Quick Color Picker */}
            <div className="hud-color-group">
              <input
                type="color"
                className="hud-color-native"
                value={currentColor.startsWith('#') ? currentColor : '#ffffff'}
                onChange={(e) => onUpdateStyle?.(selectedLayer.id, { color: e.target.value })}
                title="Custom Color"
              />
              <div className="hud-swatches">
                {PRESET_COLORS.slice(0, 4).map((c) => (
                  <button
                    key={c}
                    className={`hud-swatch-dot ${currentColor === c ? 'active' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => onUpdateStyle?.(selectedLayer.id, { color: c })}
                  />
                ))}
              </div>
            </div>

            <div className="hud-divider" />

            {/* Edit Text in Place */}
            <button
              className="hud-action-pill"
              onClick={() => setIsInlineEditing(true)}
              title="Edit text directly on canvas"
            >
              <Edit3 size={11} />
              <span>Edit</span>
            </button>

            {/* Reset to Original Text */}
            {onResetLayer && (
              <button
                className="hud-icon-btn"
                onClick={() => onResetLayer(selectedLayer.id)}
                title="Reset layer to original imported text"
              >
                <RotateCcw size={12} />
              </button>
            )}

            {/* Deselect */}
            <button
              className="hud-icon-btn hud-close"
              onClick={onDeselect}
              title="Deselect layer (Esc)"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Inline On-Canvas Live Text Editor */}
        {isInlineEditing && (
          <div
            className="inline-canvas-editor"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <textarea
              ref={inlineTextareaRef}
              className="inline-canvas-textarea"
              value={inlineTextVal}
              onChange={(e) => {
                setInlineTextVal(e.target.value);
                onUpdateText?.(selectedLayer.id, e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  handleFinishInlineEdit();
                } else if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleFinishInlineEdit();
                }
              }}
              onBlur={handleFinishInlineEdit}
              style={{
                fontSize: `${fontSize}px`,
                fontFamily: style.fontFamily || 'Inter',
                fontWeight: style.fontWeight || 'normal',
                fontStyle: style.fontStyle || 'normal',
                color: currentColor,
                textAlign: textAlign as any,
                lineHeight: style.lineHeight ? `${style.lineHeight}px` : 'normal',
              }}
            />
            <div className="inline-editor-hint">
              <span>Press <kbd>Enter</kbd> to save • <kbd>Shift+Enter</kbd> for newline</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
