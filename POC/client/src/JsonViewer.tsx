import React, { useState } from 'react';
import {
  FileCode,
  Copy,
  Check,
  Download,
  AlertTriangle,
  Layers,
  FileCheck,
  CheckCircle,
} from 'lucide-react';
import { DesignDocument } from './utils/htmlGenerator';

interface JsonViewerProps {
  design: DesignDocument | null;
  jsonText: string;
  setJsonText: (val: string) => void;
  onApplyJson: () => void;
  jsonError: string | null;
  loading: boolean;
}

export default function JsonViewer({
  design,
  jsonText,
  setJsonText,
  onApplyJson,
  jsonError,
  loading,
}: JsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${design?.name || 'converted_design'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Count layer types
  const countLayerTypes = (layers: any[]): Record<string, number> => {
    const counts: Record<string, number> = { text: 0, shape: 0, raster: 0, image: 0, svg: 0, group: 0 };
    const traverse = (items: any[]) => {
      for (const l of items) {
        counts[l.type] = (counts[l.type] || 0) + 1;
        if (l.children) traverse(l.children);
      }
    };
    traverse(layers || []);
    return counts;
  };

  const layerStats = countLayerTypes(design?.layers || []);

  return (
    <div className="json-viewer-container">
      {/* Header Bar */}
      <div className="json-viewer-header">
        <div className="json-viewer-title">
          <FileCode size={18} className="text-primary" />
          <h3>Converted Design JSON</h3>
          <span className="badge badge-poc">Normalized Zod Schema</span>
        </div>

        <div className="json-viewer-actions">
          <button
            className="btn btn-outline btn-sm"
            onClick={handleCopy}
            title="Copy Normalized JSON to clipboard"
          >
            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>

          <button
            className="btn btn-outline btn-sm"
            onClick={handleDownload}
            title="Download design.json file"
          >
            <Download size={14} /> Download JSON
          </button>

          <button
            className="btn btn-primary btn-sm"
            onClick={onApplyJson}
            disabled={loading}
            title="Validate JSON schema and update live canvas"
          >
            <CheckCircle size={14} /> Apply JSON
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {design && (
        <div className="json-stats-bar">
          <div className="json-stat-item">
            <span>Dimensions:</span>
            <strong>{design.width} × {design.height} px</strong>
          </div>
          <div className="json-stat-item">
            <span>Total Layers:</span>
            <strong>{design.layers.length}</strong>
          </div>
          <div className="json-stat-item">
            <span>Text:</span>
            <strong className="text-primary">{layerStats.text || 0}</strong>
          </div>
          <div className="json-stat-item">
            <span>Shapes:</span>
            <strong>{layerStats.shape || 0}</strong>
          </div>
          <div className="json-stat-item">
            <span>Rasters:</span>
            <strong>{layerStats.raster || 0}</strong>
          </div>
        </div>
      )}

      {/* Error alert */}
      {jsonError && (
        <div className="json-error-banner">
          <AlertTriangle size={15} />
          <span>{jsonError}</span>
        </div>
      )}

      {/* Textarea Editor */}
      <div className="json-editor-wrapper">
        <textarea
          className="code-editor"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          placeholder="Normalized JSON representation will appear here..."
          spellCheck={false}
        />
      </div>
    </div>
  );
}
