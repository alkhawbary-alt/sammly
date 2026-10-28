import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Upload,
  FileCode,
  Eye,
  CheckCircle,
  AlertTriangle,
  Download,
  Camera,
  FileText,
  RefreshCw,
  Copy,
  Check,
  Layers,
  Sparkles,
  GitCompare,
  Cpu,
  Type,
  Maximize2,
} from 'lucide-react';
import GithubLab from './GithubLab';
import TextSidebar, { TextLayerItem } from './TextSidebar';
import CanvasPreview from './CanvasPreview';
import JsonViewer from './JsonViewer';
import {
  Layer,
  TextStyle,
  DesignDocument,
  generateHtmlCssClient,
} from './utils/htmlGenerator';
import {
  extractAllTextLayers,
  updateLayerTextContent,
  updateLayerStyleProperties,
  updateLayerBounds,
  transformAllLayersText,
  resetLayerToOriginal,
  resetAllLayersToOriginal,
} from './utils/layerUtils';

interface ImportReportItem {
  layerId: string;
  name: string;
  type: string;
  status: 'editable' | 'rasterized' | 'skipped';
  notes?: string;
}

interface ImportReport {
  totalLayers: number;
  editableLayers: number;
  rasterizedLayers: number;
  unsupportedFeatures: string[];
  missingFonts: string[];
  warnings: string[];
  details: ImportReportItem[];
}

interface VisualDiffResult {
  totalPixels: number;
  diffPixels: number;
  diffPercentage: number;
  diffImagePath: string;
  diffImageUrl: string;
  originalWidth: number;
  originalHeight: number;
}

export default function App() {
  const [viewMode, setViewMode] = useState<'studio' | 'github-lab'>('studio');
  const [activeTab, setActiveTab] = useState<'text' | 'json' | 'fabric' | 'html' | 'css' | 'report' | 'diff' | 'benchmark'>('text');
  
  const [design, setDesign] = useState<DesignDocument | null>(null);
  const [jsonText, setJsonText] = useState<string>('');
  const [fabricJsonText, setFabricJsonText] = useState<string>('');
  const [htmlCode, setHtmlCode] = useState<string>('');
  const [cssCode, setCssCode] = useState<string>('');
  const [fullHtml, setFullHtml] = useState<string>('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [compositeUrl, setCompositeUrl] = useState<string | null>(null);
  const [benchmarkData, setBenchmarkData] = useState<any>(null);

  // Original texts map for reset functionality
  const originalTextsRef = useRef<Map<string, { text: string; style?: TextStyle }>>(new Map());

  // UI state
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Selection & Canvas state
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(0.85);
  const [showOutlines, setShowOutlines] = useState<boolean>(false);
  const [canvasBgMode, setCanvasBgMode] = useState<'checkered' | 'white' | 'dark' | 'slate' | 'dots' | 'grid'>('checkered');

  // Render & Diff results
  const [renderedPngUrl, setRenderedPngUrl] = useState<string | null>(null);
  const [renderedPdfUrl, setRenderedPdfUrl] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<VisualDiffResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load sample PSD on mount
  useEffect(() => {
    loadSample('psd');
  }, []);

  // Sync client-side fullHtml whenever design, selection or outlines change
  const refreshCanvasHtml = (doc: DesignDocument, selId: string | null = selectedLayerId, outlines: boolean = showOutlines) => {
    const generated = generateHtmlCssClient(doc, '', selId, outlines);
    setHtmlCode(generated.html);
    setCssCode(generated.css);
    setFullHtml(generated.fullHtml);
  };

  const storeOriginalTexts = (layers: Layer[]) => {
    originalTextsRef.current.clear();
    const traverse = (items: Layer[]) => {
      for (const item of items) {
        if (item.type === 'text') {
          originalTextsRef.current.set(item.id, {
            text: item.text || '',
            style: item.style ? { ...item.style } : undefined,
          });
        }
        if (item.type === 'group' && item.children) {
          traverse(item.children);
        }
      }
    };
    traverse(layers);
  };

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const loadSample = async (type: 'psd' | 'svg' | 'png') => {
    setLoading(true);
    setStatusMessage(`Generating and parsing sample ${type.toUpperCase()}...`);
    setJsonError(null);
    try {
      const res = await fetch(`/api/sample/${type}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load sample');

      setDesign(data.design);
      setJsonText(JSON.stringify(data.design, null, 2));
      if (data.fabricJson) setFabricJsonText(JSON.stringify(data.fabricJson, null, 2));
      setHtmlCode(data.html);
      setCssCode(data.css);
      setFullHtml(data.fullHtml);
      setReport(data.report);
      setCompositeUrl(data.compositeUrl || null);
      setDiffResult(null);
      setRenderedPngUrl(null);
      setRenderedPdfUrl(null);
      setSelectedLayerId(null);

      storeOriginalTexts(data.design.layers);
      setStatusMessage(`Loaded sample ${type.toUpperCase()} successfully`);
      setActiveTab('text');
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatusMessage(`Uploading and converting ${file.name} to JSON...`);
    setJsonError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      setDesign(data.design);
      setJsonText(JSON.stringify(data.design, null, 2));
      if (data.fabricJson) setFabricJsonText(JSON.stringify(data.fabricJson, null, 2));
      setHtmlCode(data.html);
      setCssCode(data.css);
      setFullHtml(data.fullHtml);
      setReport(data.report);
      setCompositeUrl(data.compositeUrl || null);
      setDiffResult(null);
      setRenderedPngUrl(null);
      setRenderedPdfUrl(null);
      setSelectedLayerId(null);

      storeOriginalTexts(data.design.layers);
      setStatusMessage(`Imported ${file.name} successfully! Converted to JSON.`);
      setActiveTab('text');
    } catch (err: any) {
      setStatusMessage(`Import Error: ${err.message}`);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Text layer handlers (Sidebar to edit text only)
  const textLayerItems: TextLayerItem[] = useMemo(() => {
    if (!design?.layers) return [];
    return extractAllTextLayers(design.layers, originalTextsRef.current);
  }, [design]);

  const handleUpdateText = (layerId: string, newText: string) => {
    if (!design) return;
    const updatedLayers = updateLayerTextContent(design.layers, layerId, newText);
    const updatedDoc: DesignDocument = {
      ...design,
      layers: updatedLayers,
    };
    setDesign(updatedDoc);
    setJsonText(JSON.stringify(updatedDoc, null, 2));
    refreshCanvasHtml(updatedDoc, selectedLayerId, showOutlines);
  };

  const handleUpdateStyle = (layerId: string, styleUpdates: Partial<TextStyle>) => {
    if (!design) return;
    const updatedLayers = updateLayerStyleProperties(design.layers, layerId, styleUpdates);
    const updatedDoc: DesignDocument = {
      ...design,
      layers: updatedLayers,
    };
    setDesign(updatedDoc);
    setJsonText(JSON.stringify(updatedDoc, null, 2));
    refreshCanvasHtml(updatedDoc, selectedLayerId, showOutlines);
  };

  const handleResetLayer = (layerId: string) => {
    if (!design) return;
    const updatedLayers = resetLayerToOriginal(design.layers, layerId, originalTextsRef.current);
    const updatedDoc: DesignDocument = { ...design, layers: updatedLayers };
    setDesign(updatedDoc);
    setJsonText(JSON.stringify(updatedDoc, null, 2));
    refreshCanvasHtml(updatedDoc, selectedLayerId, showOutlines);
  };

  const handleUpdateBounds = (layerId: string, bounds: { x?: number; y?: number; width?: number; height?: number }) => {
    if (!design) return;
    const updatedLayers = updateLayerBounds(design.layers, layerId, bounds);
    const updatedDoc: DesignDocument = { ...design, layers: updatedLayers };
    setDesign(updatedDoc);
    setJsonText(JSON.stringify(updatedDoc, null, 2));
    refreshCanvasHtml(updatedDoc, selectedLayerId, showOutlines);
  };

  const handleResetAll = () => {
    if (!design) return;
    const updatedLayers = resetAllLayersToOriginal(design.layers, originalTextsRef.current);
    const updatedDoc: DesignDocument = { ...design, layers: updatedLayers };
    setDesign(updatedDoc);
    setJsonText(JSON.stringify(updatedDoc, null, 2));
    refreshCanvasHtml(updatedDoc, selectedLayerId, showOutlines);
    setStatusMessage('All text layers reset to original values.');
  };

  const handleTransformAllText = (mode: 'uppercase' | 'lowercase' | 'titlecase') => {
    if (!design) return;
    const updatedLayers = transformAllLayersText(design.layers, mode);
    const updatedDoc: DesignDocument = { ...design, layers: updatedLayers };
    setDesign(updatedDoc);
    setJsonText(JSON.stringify(updatedDoc, null, 2));
    refreshCanvasHtml(updatedDoc, selectedLayerId, showOutlines);
  };

  const handleAddTextLayer = () => {
    if (!design) return;
    const newId = `text-custom-${Date.now()}`;
    const newLayer: Layer = {
      id: newId,
      name: `Text Layer ${textLayerItems.length + 1}`,
      type: 'text',
      x: Math.round(design.width * 0.1),
      y: Math.round(design.height * 0.1 + textLayerItems.length * 40),
      width: Math.round(design.width * 0.8),
      height: 48,
      text: 'New Editable Text',
      style: {
        fontSize: 24,
        fontFamily: 'Inter',
        color: '#ffffff',
        fontWeight: 'bold',
        textAlign: 'left',
      },
    };

    const updatedDoc: DesignDocument = {
      ...design,
      layers: [...design.layers, newLayer],
    };

    originalTextsRef.current.set(newId, {
      text: 'New Editable Text',
      style: { fontSize: 24, fontFamily: 'Inter', color: '#ffffff', fontWeight: 'bold' },
    });

    setDesign(updatedDoc);
    setJsonText(JSON.stringify(updatedDoc, null, 2));
    setSelectedLayerId(newId);
    refreshCanvasHtml(updatedDoc, newId, showOutlines);
    setStatusMessage('Added new text layer to canvas!');
  };

  const handleSelectLayer = (id: string | null) => {
    setSelectedLayerId(id);
    if (design) {
      refreshCanvasHtml(design, id, showOutlines);
    }
  };

  const handleToggleOutlines = (val: boolean | ((prev: boolean) => boolean)) => {
    setShowOutlines((prev) => {
      const nextVal = typeof val === 'function' ? val(prev) : val;
      if (design) {
        refreshCanvasHtml(design, selectedLayerId, nextVal);
      }
      return nextVal;
    });
  };

  // Apply JSON manually (re-parse and validate)
  const handleApplyJson = async () => {
    setJsonError(null);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err: any) {
      setJsonError(`JSON Syntax Error: ${err.message}`);
      return;
    }

    setLoading(true);
    setStatusMessage('Validating JSON schema and regenerating HTML/CSS...');

    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design: parsed }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Validation failed');
      }

      setDesign(data.design);
      if (data.fabricJson) setFabricJsonText(JSON.stringify(data.fabricJson, null, 2));
      setHtmlCode(data.html);
      setCssCode(data.css);
      setFullHtml(data.fullHtml);
      storeOriginalTexts(data.design.layers);
      setStatusMessage('JSON applied & HTML/CSS regenerated!');
    } catch (err: any) {
      setJsonError(`Validation Error: ${err.message}`);
      setStatusMessage('Failed to apply JSON');
    } finally {
      setLoading(false);
    }
  };

  const handleRenderPng = async () => {
    if (!design) return;
    setLoading(true);
    setStatusMessage('Rendering PNG in Playwright Chromium...');
    try {
      const res = await fetch('/api/render/png', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'PNG render failed');

      setRenderedPngUrl(data.pngUrl);
      setStatusMessage(`PNG exported in ${data.durationMs}ms (${data.width}×${data.height}px)`);
    } catch (err: any) {
      setStatusMessage(`Render Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRenderPdf = async () => {
    if (!design) return;
    setLoading(true);
    setStatusMessage('Rendering PDF in Playwright Chromium...');
    try {
      const res = await fetch('/api/render/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'PDF render failed');

      setRenderedPdfUrl(data.pdfUrl);
      setStatusMessage(`PDF exported in ${data.durationMs}ms`);
    } catch (err: any) {
      setStatusMessage(`Render Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunDiff = async () => {
    if (!design || !compositeUrl) return;
    setLoading(true);
    setActiveTab('diff');
    setStatusMessage('Rendering Playwright PNG and running pixel difference comparison...');
    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design, compositeUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Comparison failed');

      setDiffResult(data.diff);
      setRenderedPngUrl(data.renderedPngUrl);
      setStatusMessage(`Visual diff complete: ${data.diff.diffPercentage}% pixel difference`);
    } catch (err: any) {
      setStatusMessage(`Diff Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunBenchmark = async () => {
    setLoading(true);
    setActiveTab('benchmark');
    setStatusMessage('Running parser benchmark (ag-psd vs psd.js)...');
    try {
      const res = await fetch('/api/benchmark');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Benchmark failed');
      setBenchmarkData(data);
      setStatusMessage('Benchmark comparison completed!');
    } catch (err: any) {
      setStatusMessage(`Benchmark Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="brand">
          <Layers className="text-primary" size={24} color="#6366f1" />
          <h1>Design Conversion POC</h1>
          <div className="mode-toggle-group">
            <button
              className={`mode-toggle-btn ${viewMode === 'studio' ? 'active' : ''}`}
              onClick={() => setViewMode('studio')}
              title="Normalized JSON Studio & Canvas Text Editor"
            >
              <Sparkles size={14} /> Modern Studio
            </button>
            <button
              className={`mode-toggle-btn ${viewMode === 'github-lab' ? 'active' : ''}`}
              onClick={() => setViewMode('github-lab')}
              title="Test all 4 GitHub projects live: psd2fabric, node-psd-to-html, psd.js, ag-psd"
            >
              <Cpu size={14} /> 🧪 GitHub Engines Lab
            </button>
          </div>
          <span className="badge badge-poc">Technical Prototype</span>
          {design?.meta?.sourceFormat && (
            <span className="badge badge-source">
              Source: {design.meta.sourceFormat.toUpperCase()}
            </span>
          )}
        </div>

        {/* Global Pipeline Actions */}
        <div className="toolbar">
          {viewMode === 'studio' && (
            <>
              <button
                className="btn btn-primary"
                onClick={handleApplyJson}
                disabled={loading || !jsonText}
                title="Re-validate JSON and update the live preview"
              >
                <Check size={16} /> Apply JSON
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleRenderPng}
                disabled={loading || !design}
                title="Export exact canvas to PNG using Playwright"
              >
                <Camera size={16} /> Render PNG
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleRenderPdf}
                disabled={loading || !design}
                title="Export canvas to PDF using Playwright"
              >
                <FileText size={16} /> Render PDF
              </button>
              {compositeUrl && (
                <button
                  className="btn btn-secondary"
                  onClick={handleRunDiff}
                  disabled={loading || !design}
                  title="Compare Original PSD Composite vs Rendered HTML/CSS"
                >
                  <GitCompare size={16} /> Visual Diff
                </button>
              )}
              {renderedPngUrl && (
                <a
                  href={renderedPngUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-success"
                >
                  <Download size={16} /> Download PNG
                </a>
              )}
              {renderedPdfUrl && (
                <a
                  href={renderedPdfUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-success"
                >
                  <Download size={16} /> Download PDF
                </a>
              )}
            </>
          )}
        </div>
      </header>

      {viewMode === 'github-lab' ? (
        <GithubLab />
      ) : (
        <>
          {/* Upload and Sample Bar */}
          <section className="upload-section">
            <div className="upload-area">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".psd,.png,.jpg,.jpeg,.webp,.svg"
                style={{ display: 'none' }}
                id="file-upload-input"
              />
              <button
                className="btn btn-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                <Upload size={16} /> Upload PSD / Image / SVG
              </button>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Converts file to JSON & previews on canvas with text editing
              </span>
            </div>

            <div className="sample-presets">
              <span>Instant Samples:</span>
              <button
                className="btn btn-outline"
                onClick={() => loadSample('psd')}
                disabled={loading}
              >
                <Sparkles size={14} color="#818cf8" /> Sample PSD
              </button>
              <button
                className="btn btn-outline"
                onClick={() => loadSample('svg')}
                disabled={loading}
              >
                <Sparkles size={14} color="#06b6d4" /> Sample SVG
              </button>
              <button
                className="btn btn-outline"
                onClick={() => loadSample('png')}
                disabled={loading}
              >
                <Sparkles size={14} color="#10b981" /> Sample PNG
              </button>
            </div>
          </section>

          {/* Status & Alerts Bar */}
          {statusMessage && (
            <div
              style={{
                background: '#111827',
                padding: '0.4rem 2rem',
                borderBottom: '1px solid var(--border-color)',
                fontSize: '0.8125rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: statusMessage.includes('Error') ? 'var(--danger)' : 'var(--text-muted)',
              }}
            >
              {loading && <RefreshCw size={14} className="animate-spin" />}
              <span>{statusMessage}</span>
            </div>
          )}

          {jsonError && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                padding: '0.5rem 2rem',
                fontSize: '0.8125rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <AlertTriangle size={16} />
              <span>{jsonError}</span>
            </div>
          )}

          {/* Split Main Workspace */}
          <main className="main-content">
            {/* Left Panel: Text Sidebar / JSON / HTML / CSS / Report */}
            <section className="panel">
              <div className="panel-header">
                <div className="tabs-list">
                  <button
                    className={`tab-btn ${activeTab === 'text' ? 'active' : ''}`}
                    onClick={() => setActiveTab('text')}
                    title="Side bar to edit text layers only"
                  >
                    <Type size={14} /> Edit Text ({textLayerItems.length})
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'json' ? 'active' : ''}`}
                    onClick={() => setActiveTab('json')}
                    title="View & Edit Normalized Design Document JSON"
                  >
                    <FileCode size={14} /> JSON
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'fabric' ? 'active' : ''}`}
                    onClick={() => setActiveTab('fabric')}
                    title="Fabric.js 5.x JSON format"
                  >
                    Fabric.js
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'html' ? 'active' : ''}`}
                    onClick={() => setActiveTab('html')}
                  >
                    HTML
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'css' ? 'active' : ''}`}
                    onClick={() => setActiveTab('css')}
                  >
                    CSS
                  </button>
                  {report && (
                    <button
                      className={`tab-btn ${activeTab === 'report' ? 'active' : ''}`}
                      onClick={() => setActiveTab('report')}
                    >
                      Report
                    </button>
                  )}
                  {compositeUrl && (
                    <button
                      className={`tab-btn ${activeTab === 'diff' ? 'active' : ''}`}
                      onClick={() => setActiveTab('diff')}
                    >
                      Visual Diff
                    </button>
                  )}
                  <button
                    className={`tab-btn ${activeTab === 'benchmark' ? 'active' : ''}`}
                    onClick={handleRunBenchmark}
                    title="Compare ag-psd vs psd.js"
                  >
                    Benchmark
                  </button>
                </div>

                <div>
                  {activeTab === 'fabric' && (
                    <button
                      className="btn btn-outline"
                      onClick={() => handleCopy(fabricJsonText, 'fabric')}
                    >
                      {copied === 'fabric' ? <Check size={14} /> : <Copy size={14} />} Copy Fabric JSON
                    </button>
                  )}
                  {activeTab === 'html' && (
                    <button
                      className="btn btn-outline"
                      onClick={() => handleCopy(htmlCode, 'html')}
                    >
                      {copied === 'html' ? <Check size={14} /> : <Copy size={14} />} Copy HTML
                    </button>
                  )}
                  {activeTab === 'css' && (
                    <button
                      className="btn btn-outline"
                      onClick={() => handleCopy(cssCode, 'css')}
                    >
                      {copied === 'css' ? <Check size={14} /> : <Copy size={14} />} Copy CSS
                    </button>
                  )}
                </div>
              </div>

              <div className="panel-body">
                {activeTab === 'text' && (
                  <TextSidebar
                    textLayers={textLayerItems}
                    selectedLayerId={selectedLayerId}
                    onSelectLayer={handleSelectLayer}
                    onUpdateText={handleUpdateText}
                    onUpdateStyle={handleUpdateStyle}
                    onResetLayer={handleResetLayer}
                    onResetAll={handleResetAll}
                    onAddTextLayer={handleAddTextLayer}
                    onTransformAllText={handleTransformAllText}
                  />
                )}

                {activeTab === 'json' && (
                  <JsonViewer
                    design={design}
                    jsonText={jsonText}
                    setJsonText={setJsonText}
                    onApplyJson={handleApplyJson}
                    jsonError={jsonError}
                    loading={loading}
                  />
                )}

                {activeTab === 'fabric' && (
                  <pre className="code-viewer">{fabricJsonText || '// Fabric.js JSON format'}</pre>
                )}

                {activeTab === 'html' && (
                  <pre className="code-viewer">{htmlCode || '<!-- No HTML generated yet -->'}</pre>
                )}

                {activeTab === 'css' && (
                  <pre className="code-viewer">{cssCode || '/* No CSS generated yet */'}</pre>
                )}

                {activeTab === 'report' && report && (
                  <div className="report-view">
                    <div className="stats-grid">
                      <div className="stat-card">
                        <div className="stat-title">Total Layers</div>
                        <div className="stat-value">{report.totalLayers}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-title">Editable Layers</div>
                        <div className="stat-value editable">{report.editableLayers}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-title">Rasterized Layers</div>
                        <div className="stat-value rasterized">{report.rasterizedLayers}</div>
                      </div>
                    </div>

                    <div className="report-section">
                      <h4>Layer Breakdown</h4>
                      <table className="report-table">
                        <thead>
                          <tr>
                            <th>Layer Name</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.details.map((item) => (
                            <tr key={item.layerId}>
                              <td>{item.name}</td>
                              <td><span className="badge badge-source">{item.type}</span></td>
                              <td>
                                <span className={`badge ${item.status === 'editable' ? 'badge-poc' : 'badge-source'}`}>
                                  {item.status}
                                </span>
                              </td>
                              <td style={{ color: 'var(--text-muted)' }}>{item.notes || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === 'diff' && (
                  <div className="report-view">
                    <h3>Visual Diff (Photoshop Composite vs HTML/CSS Playwright Export)</h3>
                    {diffResult ? (
                      <>
                        <div className="stats-grid" style={{ margin: '1rem 0' }}>
                          <div className="stat-card">
                            <div className="stat-title">Mismatch Percentage</div>
                            <div
                              className="stat-value"
                              style={{
                                color: diffResult.diffPercentage < 10 ? '#34d399' : '#f59e0b',
                              }}
                            >
                              {diffResult.diffPercentage}%
                            </div>
                          </div>
                          <div className="stat-card">
                            <div className="stat-title">Diff Pixels</div>
                            <div className="stat-value">
                              {diffResult.diffPixels.toLocaleString()} / {diffResult.totalPixels.toLocaleString()}
                            </div>
                          </div>
                          <div className="stat-card">
                            <div className="stat-title">Dimensions</div>
                            <div className="stat-value" style={{ fontSize: '1.25rem' }}>
                              {diffResult.originalWidth} × {diffResult.originalHeight} px
                            </div>
                          </div>
                        </div>

                        <div className="diff-images-grid">
                          <div className="diff-box">
                            <h4>1. Original PSD Composite</h4>
                            <img src={compositeUrl!} alt="Original PSD" />
                          </div>
                          <div className="diff-box">
                            <h4>2. Generated HTML/CSS (Playwright)</h4>
                            <img src={renderedPngUrl!} alt="HTML Render" />
                          </div>
                          <div className="diff-box">
                            <h4>3. Pixel Difference Map (Red)</h4>
                            <img src={diffResult.diffImageUrl} alt="Pixel Diff" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ marginTop: '1.5rem' }}>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                          Click below to render the generated HTML/CSS in Playwright Chromium and compare it against the original composite.
                        </p>
                        <button
                          className="btn btn-primary"
                          onClick={handleRunDiff}
                          disabled={loading}
                        >
                          <GitCompare size={16} /> Run Pixel Comparison
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'benchmark' && (
                  <div className="report-view">
                    <h3>Parser Benchmark: ag-psd vs psd.js</h3>
                    {benchmarkData ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                        <div className="stat-card" style={{ borderColor: 'var(--primary)' }}>
                          <h4 style={{ color: '#ffffff' }}>ag-psd (Current Pipeline)</h4>
                          <div style={{ margin: '0.75rem 0', fontSize: '0.85rem' }}>
                            <div>⚡ <strong>Parse Time:</strong> {benchmarkData.agPsdResult.parseTimeMs} ms</div>
                            <div>📑 <strong>Total Layers:</strong> {benchmarkData.agPsdResult.totalLayers}</div>
                            <div>✏️ <strong>Editable Text:</strong> {benchmarkData.agPsdResult.textLayers}</div>
                          </div>
                        </div>
                        <div className="stat-card">
                          <h4 style={{ color: '#ffffff' }}>psd.js (Legacy)</h4>
                          <div style={{ margin: '0.75rem 0', fontSize: '0.85rem' }}>
                            <div>⚡ <strong>Parse Time:</strong> {benchmarkData.psdJsResult.parseTimeMs} ms</div>
                            <div>📑 <strong>Total Layers:</strong> {benchmarkData.psdJsResult.totalLayers}</div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button className="btn btn-primary" onClick={handleRunBenchmark} disabled={loading} style={{ marginTop: '1rem' }}>
                        Run Benchmark
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Right Panel: Live Canvas Preview */}
            <CanvasPreview
              design={design}
              fullHtml={fullHtml}
              zoomScale={zoomScale}
              setZoomScale={setZoomScale}
              showOutlines={showOutlines}
              setShowOutlines={handleToggleOutlines}
              canvasBgMode={canvasBgMode}
              setCanvasBgMode={setCanvasBgMode}
              selectedLayerId={selectedLayerId}
              onSelectTextLayer={handleSelectLayer}
              onUpdateText={handleUpdateText}
              onUpdateStyle={handleUpdateStyle}
              onUpdateBounds={handleUpdateBounds}
              onResetLayer={handleResetLayer}
              onQuickSnapshot={handleRenderPng}
            />
          </main>
        </>
      )}
    </div>
  );
}
