import React, { useMemo } from 'react';

interface RulersProps {
  width: number;
  height: number;
  zoomScale: number;
  panOffset: { x: number; y: number };
  containerWidth: number;
  containerHeight: number;
  mousePos: { x: number; y: number } | null;
}

export default function Rulers({
  width,
  height,
  zoomScale,
  panOffset,
  containerWidth,
  containerHeight,
  mousePos,
}: RulersProps) {
  const RULER_SIZE = 22;

  // Calculate where canvas (0,0) is relative to the ruler origin
  const canvasOriginX = containerWidth / 2 + panOffset.x - (width * zoomScale) / 2;
  const canvasOriginY = containerHeight / 2 + panOffset.y - (height * zoomScale) / 2;

  // Step size in canvas pixels (adapts nicely based on zoom level)
  const step = useMemo(() => {
    if (zoomScale >= 2) return 50;
    if (zoomScale >= 0.8) return 100;
    if (zoomScale >= 0.4) return 200;
    return 500;
  }, [zoomScale]);

  // Generate horizontal ticks
  const hTicks = useMemo(() => {
    const ticks: { pos: number; label?: number; isMajor: boolean }[] = [];
    if (containerWidth <= 0) return ticks;

    const minCanvasX = -canvasOriginX / zoomScale - 50;
    const maxCanvasX = (containerWidth - canvasOriginX) / zoomScale + 50;

    const startVal = Math.floor(minCanvasX / step) * step;
    const endVal = Math.ceil(maxCanvasX / step) * step;

    for (let val = startVal; val <= endVal; val += step / 5) {
      const screenX = canvasOriginX + val * zoomScale;
      if (screenX >= RULER_SIZE && screenX <= containerWidth) {
        const isMajor = Math.round(val) % step === 0;
        ticks.push({
          pos: screenX,
          label: isMajor ? Math.round(val) : undefined,
          isMajor,
        });
      }
    }
    return ticks;
  }, [containerWidth, canvasOriginX, zoomScale, step]);

  // Generate vertical ticks
  const vTicks = useMemo(() => {
    const ticks: { pos: number; label?: number; isMajor: boolean }[] = [];
    if (containerHeight <= 0) return ticks;

    const minCanvasY = -canvasOriginY / zoomScale - 50;
    const maxCanvasY = (containerHeight - canvasOriginY) / zoomScale + 50;

    const startVal = Math.floor(minCanvasY / step) * step;
    const endVal = Math.ceil(maxCanvasY / step) * step;

    for (let val = startVal; val <= endVal; val += step / 5) {
      const screenY = canvasOriginY + val * zoomScale;
      if (screenY >= RULER_SIZE && screenY <= containerHeight) {
        const isMajor = Math.round(val) % step === 0;
        ticks.push({
          pos: screenY,
          label: isMajor ? Math.round(val) : undefined,
          isMajor,
        });
      }
    }
    return ticks;
  }, [containerHeight, canvasOriginY, zoomScale, step]);

  return (
    <div className="canvas-rulers-overlay" style={{ pointerEvents: 'none' }}>
      {/* Corner Box */}
      <div className="ruler-corner" title="Ruler unit: pixels (px)">
        <span>px</span>
      </div>

      {/* Top Horizontal Ruler */}
      <svg
        className="ruler-horizontal"
        style={{ left: RULER_SIZE, width: Math.max(0, containerWidth - RULER_SIZE), height: RULER_SIZE }}
      >
        {/* Active Artboard Range Highlight */}
        <rect
          x={Math.max(0, canvasOriginX - RULER_SIZE)}
          y={0}
          width={Math.max(0, width * zoomScale)}
          height={RULER_SIZE}
          fill="rgba(99, 102, 241, 0.15)"
        />

        {hTicks.map((t, i) => {
          const x = t.pos - RULER_SIZE;
          if (x < 0) return null;
          return (
            <g key={i}>
              <line
                x1={x}
                y1={t.isMajor ? 8 : 15}
                x2={x}
                y2={RULER_SIZE}
                stroke={t.isMajor ? '#94a3b8' : '#475569'}
                strokeWidth={1}
              />
              {t.isMajor && t.label !== undefined && (
                <text
                  x={x + 3}
                  y={10}
                  fill="#94a3b8"
                  fontSize={9}
                  fontFamily="Inter, sans-serif"
                  fontWeight={500}
                >
                  {t.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Current Mouse Indicator */}
        {mousePos && mousePos.x >= RULER_SIZE && (
          <line
            x1={mousePos.x - RULER_SIZE}
            y1={0}
            x2={mousePos.x - RULER_SIZE}
            y2={RULER_SIZE}
            stroke="#ef4444"
            strokeWidth={1.5}
          />
        )}
      </svg>

      {/* Left Vertical Ruler */}
      <svg
        className="ruler-vertical"
        style={{ top: RULER_SIZE, width: RULER_SIZE, height: Math.max(0, containerHeight - RULER_SIZE) }}
      >
        {/* Active Artboard Range Highlight */}
        <rect
          x={0}
          y={Math.max(0, canvasOriginY - RULER_SIZE)}
          width={RULER_SIZE}
          height={Math.max(0, height * zoomScale)}
          fill="rgba(99, 102, 241, 0.15)"
        />

        {vTicks.map((t, i) => {
          const y = t.pos - RULER_SIZE;
          if (y < 0) return null;
          return (
            <g key={i}>
              <line
                x1={t.isMajor ? 8 : 15}
                y1={y}
                x2={RULER_SIZE}
                y2={y}
                stroke={t.isMajor ? '#94a3b8' : '#475569'}
                strokeWidth={1}
              />
              {t.isMajor && t.label !== undefined && (
                <text
                  x={4}
                  y={y - 3}
                  fill="#94a3b8"
                  fontSize={8}
                  fontFamily="Inter, sans-serif"
                  fontWeight={500}
                  transform={`rotate(-90 4 ${y - 3})`}
                  textAnchor="end"
                >
                  {t.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Current Mouse Indicator */}
        {mousePos && mousePos.y >= RULER_SIZE && (
          <line
            x1={0}
            y1={mousePos.y - RULER_SIZE}
            x2={RULER_SIZE}
            y2={mousePos.y - RULER_SIZE}
            stroke="#ef4444"
            strokeWidth={1.5}
          />
        )}
      </svg>
    </div>
  );
}
