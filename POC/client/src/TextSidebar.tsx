import React, { useState } from 'react';
import {
  Type,
  Search,
  RotateCcw,
  Sliders,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Plus,
  Eye,
  Check,
  ChevronDown,
  ChevronRight,
  Sparkles,
  CaseSensitive,
} from 'lucide-react';
import { Layer, TextStyle } from './utils/htmlGenerator';

export interface TextLayerItem {
  layer: Layer;
  path: string[];
  originalText: string;
  originalStyle?: TextStyle;
}

interface TextSidebarProps {
  textLayers: TextLayerItem[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onUpdateText: (id: string, newText: string) => void;
  onUpdateStyle: (id: string, styleUpdates: Partial<TextStyle>) => void;
  onResetLayer: (id: string) => void;
  onResetAll: () => void;
  onAddTextLayer: () => void;
  onTransformAllText: (mode: 'uppercase' | 'lowercase' | 'titlecase') => void;
}

const COMMON_FONTS = [
  'Inter',
  'sans-serif',
  'Arial',
  'Helvetica',
  'Roboto',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Impact',
  'Trebuchet MS',
];

const PRESET_COLORS = [
  '#000000',
  '#ffffff',
  '#6366f1',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
];

export default function TextSidebar({
  textLayers,
  selectedLayerId,
  onSelectLayer,
  onUpdateText,
  onUpdateStyle,
  onResetLayer,
  onResetAll,
  onAddTextLayer,
  onTransformAllText,
}: TextSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSettingsId, setExpandedSettingsId] = useState<string | null>(null);

  const filteredLayers = textLayers.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const textMatch = (item.layer.text || '').toLowerCase().includes(q);
    const nameMatch = (item.layer.name || '').toLowerCase().includes(q);
    return textMatch || nameMatch;
  });

  const modifiedCount = textLayers.filter(
    (item) => item.layer.text !== item.originalText
  ).length;

  return (
    <aside className="text-sidebar">
      {/* Sidebar Header */}
      <div className="sidebar-header">
        <div className="sidebar-title-row">
          <div className="sidebar-title">
            <Type size={18} className="text-primary" />
            <h3>Text Layers</h3>
            <span className="badge badge-poc">{textLayers.length}</span>
          </div>
          <button
            className="btn btn-outline btn-sm"
            onClick={onAddTextLayer}
            title="Add a new text layer on top of the design"
          >
            <Plus size={14} /> Add Text
          </button>
        </div>

        {/* Search bar */}
        <div className="sidebar-search">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search text layers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="search-clear"
              onClick={() => setSearchQuery('')}
            >
              ×
            </button>
          )}
        </div>

        {/* Global Toolbar */}
        {textLayers.length > 0 && (
          <div className="sidebar-global-tools">
            <div className="tool-group">
              <button
                className="tool-btn"
                onClick={() => onTransformAllText('uppercase')}
                title="Transform all text to UPPERCASE"
              >
                <CaseSensitive size={13} /> AA
              </button>
              <button
                className="tool-btn"
                onClick={() => onTransformAllText('lowercase')}
                title="Transform all text to lowercase"
              >
                <CaseSensitive size={13} /> aa
              </button>
              <button
                className="tool-btn"
                onClick={() => onTransformAllText('titlecase')}
                title="Transform all text to Title Case"
              >
                <Sparkles size={13} /> Aa
              </button>
            </div>

            {modifiedCount > 0 && (
              <button
                className="btn btn-outline btn-sm btn-revert-all"
                onClick={onResetAll}
                title="Revert all text changes back to original file"
              >
                <RotateCcw size={12} /> Reset All ({modifiedCount})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Layers List */}
      <div className="sidebar-body">
        {filteredLayers.length === 0 ? (
          <div className="sidebar-empty">
            {textLayers.length === 0 ? (
              <>
                <Type size={32} className="text-muted" />
                <h4>No Text Layers Detected</h4>
                <p>
                  This file does not contain editable vector text layers (e.g. flat image).
                </p>
                <button className="btn btn-primary btn-sm" onClick={onAddTextLayer}>
                  <Plus size={14} /> Add First Text Layer
                </button>
              </>
            ) : (
              <p className="text-muted">No layers match &quot;{searchQuery}&quot;</p>
            )}
          </div>
        ) : (
          filteredLayers.map((item) => {
            const layer = item.layer;
            const isSelected = layer.id === selectedLayerId;
            const isModified = layer.text !== item.originalText;
            const style = layer.style || {};
            const isSettingsExpanded = expandedSettingsId === layer.id;

            return (
              <div
                key={layer.id}
                className={`text-layer-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectLayer(layer.id)}
              >
                {/* Layer Card Top */}
                <div className="layer-card-header">
                  <div className="layer-title-info">
                    <span className="layer-type-dot" />
                    <span className="layer-name" title={layer.name}>
                      {layer.name}
                    </span>
                    {isModified && (
                      <span className="badge badge-modified" title="Text modified">
                        Modified
                      </span>
                    )}
                  </div>

                  <div className="layer-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`icon-btn ${isSettingsExpanded ? 'active' : ''}`}
                      onClick={() =>
                        setExpandedSettingsId(isSettingsExpanded ? null : layer.id)
                      }
                      title="Adjust Typography (Font, Color, Size, Alignment)"
                    >
                      <Sliders size={13} />
                    </button>
                    {isModified && (
                      <button
                        className="icon-btn"
                        onClick={() => onResetLayer(layer.id)}
                        title="Reset this layer text to original"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Primary Text Content Area */}
                <div className="layer-input-wrapper">
                  <textarea
                    className="layer-text-input"
                    rows={Math.min(4, Math.max(1, (layer.text || '').split('\n').length))}
                    value={layer.text || ''}
                    onFocus={() => onSelectLayer(layer.id)}
                    onChange={(e) => onUpdateText(layer.id, e.target.value)}
                    placeholder="Enter layer text..."
                    spellCheck={false}
                  />
                </div>

                {/* Layer Metadata Sub-bar */}
                <div className="layer-meta-bar">
                  <span>
                    {Math.round(layer.x)}, {Math.round(layer.y)} px
                  </span>
                  <span>{style.fontSize || 16}px</span>
                  <span
                    className="color-swatch-mini"
                    style={{ backgroundColor: style.color || '#000000' }}
                    title={`Color: ${style.color || '#000000'}`}
                  />
                  <span className="font-name-mini" title={style.fontFamily || 'sans-serif'}>
                    {style.fontFamily || 'sans-serif'}
                  </span>
                </div>

                {/* Expandable Typography Settings Panel */}
                {isSettingsExpanded && (
                  <div
                    className="typography-panel"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Font Size & Weight */}
                    <div className="typo-row">
                      <div className="typo-field">
                        <label>Size (px)</label>
                        <div className="stepper-input">
                          <input
                            type="number"
                            min="8"
                            max="200"
                            value={style.fontSize || 16}
                            onChange={(e) =>
                              onUpdateStyle(layer.id, {
                                fontSize: parseInt(e.target.value, 10) || 16,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="typo-field">
                        <label>Font Family</label>
                        <select
                          className="typo-select"
                          value={style.fontFamily || 'sans-serif'}
                          onChange={(e) =>
                            onUpdateStyle(layer.id, { fontFamily: e.target.value })
                          }
                        >
                          {COMMON_FONTS.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Color Swatches & Picker */}
                    <div className="typo-field">
                      <label>Color</label>
                      <div className="color-picker-row">
                        <input
                          type="color"
                          className="native-color-picker"
                          value={style.color || '#000000'}
                          onChange={(e) =>
                            onUpdateStyle(layer.id, { color: e.target.value })
                          }
                        />
                        <input
                          type="text"
                          className="hex-input"
                          value={style.color || '#000000'}
                          onChange={(e) =>
                            onUpdateStyle(layer.id, { color: e.target.value })
                          }
                        />
                        <div className="preset-swatches">
                          {PRESET_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              className={`swatch-btn ${style.color === c ? 'active' : ''}`}
                              style={{ backgroundColor: c }}
                              onClick={() => onUpdateStyle(layer.id, { color: c })}
                              title={c}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Alignment & Style Buttons */}
                    <div className="typo-row">
                      <div className="typo-field">
                        <label>Alignment</label>
                        <div className="btn-group">
                          <button
                            type="button"
                            className={`tool-btn ${style.textAlign === 'left' || !style.textAlign ? 'active' : ''}`}
                            onClick={() => onUpdateStyle(layer.id, { textAlign: 'left' })}
                            title="Left"
                          >
                            <AlignLeft size={13} />
                          </button>
                          <button
                            type="button"
                            className={`tool-btn ${style.textAlign === 'center' ? 'active' : ''}`}
                            onClick={() => onUpdateStyle(layer.id, { textAlign: 'center' })}
                            title="Center"
                          >
                            <AlignCenter size={13} />
                          </button>
                          <button
                            type="button"
                            className={`tool-btn ${style.textAlign === 'right' ? 'active' : ''}`}
                            onClick={() => onUpdateStyle(layer.id, { textAlign: 'right' })}
                            title="Right"
                          >
                            <AlignRight size={13} />
                          </button>
                        </div>
                      </div>

                      <div className="typo-field">
                        <label>Format</label>
                        <div className="btn-group">
                          <button
                            type="button"
                            className={`tool-btn ${style.fontWeight === 'bold' || style.fontWeight === 700 ? 'active' : ''}`}
                            onClick={() =>
                              onUpdateStyle(layer.id, {
                                fontWeight:
                                  style.fontWeight === 'bold' || style.fontWeight === 700
                                    ? 'normal'
                                    : 'bold',
                              })
                            }
                            title="Bold"
                          >
                            <Bold size={13} />
                          </button>
                          <button
                            type="button"
                            className={`tool-btn ${style.fontStyle === 'italic' ? 'active' : ''}`}
                            onClick={() =>
                              onUpdateStyle(layer.id, {
                                fontStyle: style.fontStyle === 'italic' ? 'normal' : 'italic',
                              })
                            }
                            title="Italic"
                          >
                            <Italic size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
