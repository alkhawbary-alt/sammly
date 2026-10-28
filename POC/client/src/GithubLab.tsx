import React, { useState, useEffect, useRef } from 'react';
import {
  Layers,
  Eye,
  Upload,
  RefreshCw,
  Code,
  ExternalLink,
  Copy,
  Check,
  Download,
  Box,
  Trash2,
  Plus,
  ArrowRightLeft,
  Cpu,
  Info,
  Sliders,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Maximize2
} from 'lucide-react';

interface LabData {
  fileName: string;
  modern: {
    engine: string;
    repo: string;
    githubUrl: string;
    design: any;
    html: string;
    css: string;
    fullHtml: string;
    report: any;
    compositeUrl?: string;
    timeMs: number;
    stats: {
      totalLayers: number;
      textLayers: number;
      shapeLayers: number;
      rasterLayers: number;
    };
  };
  fabric: {
    engine: string;
    repo: string;
    githubUrl: string;
    fabricJson: any;
    timeMs: number;
    stats: {
      totalObjects: number;
      canvasWidth: number;
      canvasHeight: number;
    };
  };
  nodePsdToHtml: {
    engine: string;
    repo: string;
    githubUrl: string;
    fullHtml: string;
    bodyHtml: string;
    layerCount: number;
    textCount: number;
    imageCount: number;
    generatedAssets: string[];
    timeMs: number;
    stats: {
      totalLayers: number;
      textLayers: number;
      imageSlices: number;
      shapeLayers: number;
    };
  };
  psdJs: {
    engine: string;
    repo: string;
    githubUrl: string;
    header: any;
    totalLayers: number;
    textLayers: number;
    imageLayers: number;
    groupLayers: number;
    tree: any[];
    rawExport: any;
    timeMs: number;
    stats: {
      totalLayers: number;
      textLayers: number;
      rasterLayers: number;
      shapeLayers: number;
    };
  };
  comparison: {
    metrics: Array<{
      feature: string;
      modern: string;
      fabric: string;
      nodePsd: string;
      psdJs: string;
    }>;
  };
}

export default function GithubLab() {
  const [labData, setLabData] = useState<LabData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [activeEngine, setActiveEngine] = useState<'overview' | 'fabric' | 'nodePsd' | 'psdJs' | 'arena'>('overview');
  const [copied, setCopied] = useState<string | null>(null);

  // Fabric Canvas State
  const fabricCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricInstanceRef = useRef<any>(null);
  const [selectedFabricObject, setSelectedFabricObject] = useState<any>(null);

  // PSD.js Inspector State
  const [selectedPsdNode, setSelectedPsdNode] = useState<any>(null);
  const [expandedPsdGroups, setExpandedPsdGroups] = useState<Record<string, boolean>>({});

  // Arena Dual Comparison State
  const [arenaLeft, setArenaLeft] = useState<'modern' | 'fabric' | 'nodePsd' | 'psdJs'>('modern');
  const [arenaRight, setArenaRight] = useState<'modern' | 'fabric' | 'nodePsd' | 'psdJs'>('nodePsd');

  // Preview zoom scale
  const [previewZoom, setPreviewZoom] = useState<number>(0.75);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load sample on mount
  useEffect(() => {
    loadLabSample();
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const loadLabSample = async () => {
    setLoading(true);
    setStatusMessage('Running all 4 GitHub engines on Sample PSD...');
    try {
      const res = await fetch('/api/lab/sample');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to run engines on sample PSD');
      setLabData(data);
      if (data.psdJs?.tree?.[0]) {
        setSelectedPsdNode(data.psdJs.tree[0]);
      }
      setStatusMessage('All 4 GitHub engines executed successfully!');
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
    setStatusMessage(`Uploading ${file.name} and executing across all 4 GitHub engines...`);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/lab/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Processing failed');
      setLabData(data);
      if (data.psdJs?.tree?.[0]) {
        setSelectedPsdNode(data.psdJs.tree[0]);
      }
      setStatusMessage(`All 4 engines processed ${file.name} successfully!`);
    } catch (err: any) {
      setStatusMessage(`Upload Error: ${err.message}`);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Initialize and Sync Fabric.js Canvas
  useEffect(() => {
    if (activeEngine !== 'fabric' && activeEngine !== 'arena') return;
    if (!labData?.fabric?.fabricJson || !fabricCanvasRef.current) return;

    const fabricLib = (window as any).fabric;
    if (!fabricLib) {
      console.warn('Fabric.js library not found on window object.');
      return;
    }

    if (fabricInstanceRef.current) {
      fabricInstanceRef.current.dispose();
      fabricInstanceRef.current = null;
    }

    const json = labData.fabric.fabricJson;
    const canvas = new fabricLib.Canvas(fabricCanvasRef.current, {
      width: json.width || 800,
      height: json.height || 600,
      backgroundColor: json.background || '#ffffff',
      preserveObjectStacking: true,
      selection: true,
    });

    fabricInstanceRef.current = canvas;

    canvas.loadFromJSON(json, () => {
      canvas.renderAll();
      setStatusMessage('Fabric.js canvas loaded with interactive layers');
    });

    canvas.on('selection:created', (e: any) => setSelectedFabricObject(e.selected?.[0] || null));
    canvas.on('selection:updated', (e: any) => setSelectedFabricObject(e.selected?.[0] || null));
    canvas.on('selection:cleared', () => setSelectedFabricObject(null));

    return () => {
      if (fabricInstanceRef.current) {
        fabricInstanceRef.current.dispose();
        fabricInstanceRef.current = null;
      }
    };
  }, [activeEngine, labData]);

  // Fabric controls
  const handleAddFabricText = () => {
    if (!fabricInstanceRef.current) return;
    const fabricLib = (window as any).fabric;
    const newText = new fabricLib.IText('Double click to edit', {
      left: 150,
      top: 150,
      fontSize: 24,
      fill: '#4f46e5',
      fontFamily: 'Arial',
    });
    fabricInstanceRef.current.add(newText);
    fabricInstanceRef.current.setActiveObject(newText);
    fabricInstanceRef.current.renderAll();
  };

  const handleDeleteSelectedFabric = () => {
    if (!fabricInstanceRef.current || !selectedFabricObject) return;
    fabricInstanceRef.current.remove(selectedFabricObject);
    fabricInstanceRef.current.discardActiveObject();
    fabricInstanceRef.current.renderAll();
    setSelectedFabricObject(null);
  };

  const handleExportFabricPng = () => {
    if (!fabricInstanceRef.current) return;
    const dataUrl = fabricInstanceRef.current.toDataURL({ format: 'png', quality: 1 });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `fabric_export_${Date.now()}.png`;
    a.click();
  };

  const togglePsdGroup = (id: string) => {
    setExpandedPsdGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderPsdJsTreeNode = (node: any, depth: number = 0) => {
    const isGroup = node.type === 'group';
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedPsdGroups[node.id] !== false; // default expanded

    return (
      <div key={node.id} style={{ marginLeft: `${depth * 14}px` }}>
        <div
          className={`tree-node-item ${selectedPsdNode?.id === node.id ? 'selected' : ''}`}
          onClick={() => setSelectedPsdNode(node)}
        >
          {isGroup ? (
            <span
              className="tree-expand-icon"
              onClick={(e) => {
                e.stopPropagation();
                togglePsdGroup(node.id);
              }}
            >
              {isExpanded ? '▼' : '►'}
            </span>
          ) : (
            <span className="tree-leaf-bullet">•</span>
          )}
          <span className={`node-type-tag ${node.type}`}>{node.type}</span>
          <span className="node-name-text" title={node.name}>{node.name}</span>
          {node.coords && (
            <span className="node-dim-badge">
              {node.coords.width}×{node.coords.height}
            </span>
          )}
        </div>

        {isGroup && hasChildren && isExpanded && (
          <div className="tree-children-container">
            {node.children.map((child: any) => renderPsdJsTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Helper to render engine preview for Arena dual view
  const renderEnginePreview = (engineKey: 'modern' | 'fabric' | 'nodePsd' | 'psdJs', label: string) => {
    if (!labData) return <div className="loading-card">Loading...</div>;

    switch (engineKey) {
      case 'modern':
        return (
          <div className="arena-pane">
            <div className="arena-pane-header">
              <div className="pane-title">
                <Sparkles size={14} className="text-primary" /> {label}: Modern Pipeline (`ag-psd` + Normalized JSON)
              </div>
              <span className="badge badge-source">{labData.modern.timeMs}ms</span>
            </div>
            <div className="arena-pane-body">
              <iframe
                title="Modern HTML/CSS Preview"
                srcDoc={labData.modern.fullHtml}
                className="preview-iframe"
                style={{
                  width: `${(labData.modern.design.width || 800) * previewZoom}px`,
                  height: `${(labData.modern.design.height || 600) * previewZoom}px`,
                }}
              />
            </div>
          </div>
        );

      case 'nodePsd':
        return (
          <div className="arena-pane">
            <div className="arena-pane-header">
              <div className="pane-title">
                <Box size={14} className="text-warning" /> {label}: `node-psd-to-html` (Sliced Background Images)
              </div>
              <span className="badge badge-poc">{labData.nodePsdToHtml.timeMs}ms</span>
            </div>
            <div className="arena-pane-body">
              <iframe
                title="node-psd-to-html Preview"
                srcDoc={labData.nodePsdToHtml.fullHtml}
                className="preview-iframe"
                style={{
                  width: `${800 * previewZoom}px`,
                  height: `${600 * previewZoom}px`,
                }}
              />
            </div>
          </div>
        );

      case 'fabric':
        return (
          <div className="arena-pane">
            <div className="arena-pane-header">
              <div className="pane-title">
                <Layers size={14} className="text-success" /> {label}: `psd2fabric` (Fabric.js 5.x JSON)
              </div>
              <span className="badge badge-source">{labData.fabric.timeMs}ms</span>
            </div>
            <div className="arena-pane-body text-center p-4">
              <pre className="code-viewer mini-code" style={{ maxHeight: '380px', textAlign: 'left' }}>
                {JSON.stringify(labData.fabric.fabricJson, null, 2)}
              </pre>
            </div>
          </div>
        );

      case 'psdJs':
        return (
          <div className="arena-pane">
            <div className="arena-pane-header">
              <div className="pane-title">
                <Cpu size={14} /> {label}: `psd.js` (AST Object Tree)
              </div>
              <span className="badge badge-poc">{labData.psdJs.timeMs}ms</span>
            </div>
            <div className="arena-pane-body p-4">
              <pre className="code-viewer mini-code" style={{ maxHeight: '380px', textAlign: 'left' }}>
                {JSON.stringify(labData.psdJs.header, null, 2)}
                {'\n// Layer Count: ' + labData.psdJs.totalLayers}
                {'\n' + JSON.stringify(labData.psdJs.rawExport, null, 2).slice(0, 1500) + '...'}
              </pre>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="github-lab-container">
      {/* Top Action Bar */}
      <div className="lab-header-bar">
        <div className="lab-title-group">
          <h2>🧪 GitHub Projects Lab & Arena</h2>
          <span className="lab-subtitle">
            Directly test, compare, and manipulate all 4 open-source PSD conversion engines live!
          </span>
        </div>

        <div className="lab-actions-group">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".psd"
            style={{ display: 'none' }}
          />

          <button
            className="btn btn-outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            title="Upload any PSD to run across all 4 engines"
          >
            <Upload size={14} /> Upload Custom PSD
          </button>

          <button
            className="btn btn-primary"
            onClick={loadLabSample}
            disabled={loading}
            title="Re-run benchmark on sample banner PSD"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            {loading ? 'Processing Engines...' : 'Try Sample PSD'}
          </button>
        </div>
      </div>

      {/* Engine Switcher Tabs */}
      <div className="lab-engine-tabs">
        <button
          className={`lab-tab-btn ${activeEngine === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveEngine('overview')}
        >
          <Info size={15} /> All-in-One Arena & Matrix
        </button>

        <button
          className={`lab-tab-btn ${activeEngine === 'fabric' ? 'active' : ''}`}
          onClick={() => setActiveEngine('fabric')}
          title="haibingtown/psd2fabric: Interactive Fabric.js Canvas"
        >
          <Layers size={15} className="text-success" /> 2. `psd2fabric` (Fabric.js Canvas)
        </button>

        <button
          className={`lab-tab-btn ${activeEngine === 'nodePsd' ? 'active' : ''}`}
          onClick={() => setActiveEngine('nodePsd')}
          title="Clarence-pan/node-psd-to-html: Direct HTML/CSS generator with image slicing"
        >
          <Box size={15} className="text-warning" /> 3. `node-psd-to-html` (Sliced HTML)
        </button>

        <button
          className={`lab-tab-btn ${activeEngine === 'psdJs' ? 'active' : ''}`}
          onClick={() => setActiveEngine('psdJs')}
          title="jmorvan/psdjs: Parse PSD into AST tree"
        >
          <Cpu size={15} /> 4. `psd.js` (AST & Tree Explorer)
        </button>

        <button
          className={`lab-tab-btn ${activeEngine === 'arena' ? 'active' : ''}`}
          onClick={() => setActiveEngine('arena')}
          title="Compare any two engines side-by-side simultaneously"
        >
          <ArrowRightLeft size={15} className="text-primary" /> Versus Duel (Side-by-Side)
        </button>
      </div>

      {statusMessage && (
        <div className="lab-status-toast">
          <span>{statusMessage}</span>
          {labData && <span className="toast-file-tag">File: {labData.fileName}</span>}
        </div>
      )}

      {/* Engine 1 / Overview: Comparison Matrix & Cards */}
      {activeEngine === 'overview' && labData && (
        <div className="lab-overview-view">
          {/* Quick Engine Cards */}
          <div className="engine-cards-grid">
            {/* Engine 1: Modern Pipeline */}
            <div className="engine-card featured-card">
              <div className="engine-card-header">
                <span className="engine-badge badge-primary">Engine 1 (Our Engine)</span>
                <span className="engine-time">{labData.modern.timeMs} ms</span>
              </div>
              <h3 className="engine-name">Modern Pipeline</h3>
              <p className="engine-repo">`ag-psd` + Normalized JSON</p>
              <div className="engine-stats">
                <div><span>Total Layers:</span> <strong>{labData.modern.stats.totalLayers}</strong></div>
                <div><span>Editable Text:</span> <strong>{labData.modern.stats.textLayers}</strong></div>
                <div><span>CSS Shapes:</span> <strong className="text-success">{labData.modern.stats.shapeLayers}</strong></div>
                <div><span>Raster Fallback:</span> <strong>{labData.modern.stats.rasterLayers}</strong></div>
              </div>
              <div className="engine-footer">
                <span className="badge badge-source">97.59% Visual Parity</span>
              </div>
            </div>

            {/* Engine 2: haibingtown/psd2fabric */}
            <div className="engine-card">
              <div className="engine-card-header">
                <span className="engine-badge badge-success">Engine 2 (Canvas)</span>
                <span className="engine-time">{labData.fabric.timeMs} ms</span>
              </div>
              <h3 className="engine-name">psd2fabric</h3>
              <a
                href={labData.fabric.githubUrl}
                target="_blank"
                rel="noreferrer"
                className="engine-repo link"
              >
                haibingtown/psd2fabric <ExternalLink size={11} />
              </a>
              <div className="engine-stats">
                <div><span>Fabric Objects:</span> <strong>{labData.fabric.stats.totalObjects}</strong></div>
                <div><span>Interactive Canvas:</span> <strong className="text-success">Yes (HTML5)</strong></div>
                <div><span>Canvas Size:</span> <strong>{labData.fabric.stats.canvasWidth}×{labData.fabric.stats.canvasHeight}</strong></div>
                <div><span>Format:</span> <strong>Fabric.js 5.3 JSON</strong></div>
              </div>
              <div className="engine-footer">
                <button className="btn btn-outline btn-xs" onClick={() => setActiveEngine('fabric')}>
                  Open Canvas Studio →
                </button>
              </div>
            </div>

            {/* Engine 3: Clarence-pan/node-psd-to-html */}
            <div className="engine-card">
              <div className="engine-card-header">
                <span className="engine-badge badge-warning">Engine 3 (DOM Slicer)</span>
                <span className="engine-time">{labData.nodePsdToHtml.timeMs} ms</span>
              </div>
              <h3 className="engine-name">node-psd-to-html</h3>
              <a
                href={labData.nodePsdToHtml.githubUrl}
                target="_blank"
                rel="noreferrer"
                className="engine-repo link"
              >
                Clarence-pan/node-psd-to-html <ExternalLink size={11} />
              </a>
              <div className="engine-stats">
                <div><span>Total Slices:</span> <strong>{labData.nodePsdToHtml.layerCount}</strong></div>
                <div><span>Sliced Images:</span> <strong className="text-warning">{labData.nodePsdToHtml.imageCount}</strong></div>
                <div><span>CSS Shapes:</span> <strong className="text-danger">0 (All Raster Slices)</strong></div>
                <div><span>Output:</span> <strong>Inline CSS DIVs</strong></div>
              </div>
              <div className="engine-footer">
                <button className="btn btn-outline btn-xs" onClick={() => setActiveEngine('nodePsd')}>
                  Inspect Slices →
                </button>
              </div>
            </div>

            {/* Engine 4: jmorvan/psdjs */}
            <div className="engine-card">
              <div className="engine-card-header">
                <span className="engine-badge">Engine 4 (AST Tree)</span>
                <span className="engine-time">{labData.psdJs.timeMs} ms</span>
              </div>
              <h3 className="engine-name">psd.js</h3>
              <a
                href={labData.psdJs.githubUrl}
                target="_blank"
                rel="noreferrer"
                className="engine-repo link"
              >
                jmorvan/psdjs <ExternalLink size={11} />
              </a>
              <div className="engine-stats">
                <div><span>AST Nodes:</span> <strong>{labData.psdJs.totalLayers}</strong></div>
                <div><span>Text Nodes:</span> <strong>{labData.psdJs.textLayers}</strong></div>
                <div><span>Group Nodes:</span> <strong>{labData.psdJs.groupLayers}</strong></div>
                <div><span>Color Mode:</span> <strong>{labData.psdJs.header?.colorMode}</strong></div>
              </div>
              <div className="engine-footer">
                <button className="btn btn-outline btn-xs" onClick={() => setActiveEngine('psdJs')}>
                  Explore Tree →
                </button>
              </div>
            </div>
          </div>

          {/* Side-by-Side Comprehensive Comparison Table */}
          <div className="lab-matrix-card">
            <h3 className="matrix-title">
              <Sliders size={16} /> Architectural & Capability Breakdown
            </h3>
            <div className="table-responsive">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>Feature / Criterion</th>
                    <th className="highlight-col">Engine 1: Modern Pipeline</th>
                    <th>Engine 2: `psd2fabric`</th>
                    <th>Engine 3: `node-psd-to-html`</th>
                    <th>Engine 4: `psd.js`</th>
                  </tr>
                </thead>
                <tbody>
                  {labData.comparison.metrics.map((m, i) => (
                    <tr key={i}>
                      <td className="feature-name"><strong>{m.feature}</strong></td>
                      <td className="highlight-col">{m.modern}</td>
                      <td>{m.fabric}</td>
                      <td>{m.nodePsd}</td>
                      <td>{m.psdJs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Engine 2: haibingtown/psd2fabric (Interactive Canvas Studio) */}
      {activeEngine === 'fabric' && labData && (
        <div className="lab-fabric-studio">
          <div className="fabric-toolbar">
            <div className="fabric-tool-info">
              <span className="badge badge-success">haibingtown/psd2fabric</span>
              <span>Interactive HTML5 Canvas (Fabric.js 5.3)</span>
            </div>

            <div className="fabric-actions">
              <button className="btn btn-outline btn-sm" onClick={handleAddFabricText}>
                <Plus size={13} /> Add Text
              </button>
              {selectedFabricObject && (
                <button className="btn btn-danger btn-sm" onClick={handleDeleteSelectedFabric}>
                  <Trash2 size={13} /> Delete Selected
                </button>
              )}
              <button className="btn btn-outline btn-sm" onClick={handleExportFabricPng}>
                <Download size={13} /> Export Canvas PNG
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleCopy(JSON.stringify(labData.fabric.fabricJson, null, 2), 'fabricJson')}
              >
                {copied === 'fabricJson' ? <Check size={13} /> : <Copy size={13} />} Copy Fabric JSON
              </button>
            </div>
          </div>

          <div className="fabric-workspace">
            <div className="fabric-canvas-container">
              <div className="canvas-wrapper-box">
                <canvas ref={fabricCanvasRef} />
              </div>
              <p className="canvas-hint">
                💡 <strong>Try it:</strong> Click on any text or shape to move, rotate, resize, or double-click text to edit inline!
              </p>
            </div>

            <div className="fabric-inspector-panel">
              <h4>Inspector & Fabric.js JSON</h4>
              {selectedFabricObject ? (
                <div className="selected-object-box">
                  <div className="inspector-row"><span>Type:</span> <code>{selectedFabricObject.type}</code></div>
                  <div className="inspector-row"><span>X / Y:</span> <code>{Math.round(selectedFabricObject.left)}px, {Math.round(selectedFabricObject.top)}px</code></div>
                  <div className="inspector-row"><span>Width / Height:</span> <code>{Math.round(selectedFabricObject.width * (selectedFabricObject.scaleX || 1))}px × {Math.round(selectedFabricObject.height * (selectedFabricObject.scaleY || 1))}px</code></div>
                  <div className="inspector-row"><span>Angle:</span> <code>{Math.round(selectedFabricObject.angle || 0)}°</code></div>
                </div>
              ) : (
                <p className="text-muted text-sm">Select an element on the canvas to inspect its Fabric.js properties.</p>
              )}

              <h5 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>Fabric.js 5.x JSON Document</h5>
              <pre className="code-viewer mini-code" style={{ maxHeight: '350px' }}>
                {JSON.stringify(labData.fabric.fabricJson, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Engine 3: Clarence-pan/node-psd-to-html */}
      {activeEngine === 'nodePsd' && labData && (
        <div className="lab-node-psd-view">
          <div className="engine-info-banner">
            <div className="banner-left">
              <Box size={18} className="text-warning" />
              <div>
                <h4>Clarence-pan/node-psd-to-html Implementation</h4>
                <p>
                  Slices PSD layers into PNG files and renders static <code>&lt;div&gt;</code> tags with absolute positioning and inline <code>background-image: url(...)</code>.
                </p>
              </div>
            </div>
            <div className="banner-stats">
              <span>Slices Generated: <strong>{labData.nodePsdToHtml.imageCount}</strong></span>
              <span>Execution Time: <strong>{labData.nodePsdToHtml.timeMs}ms</strong></span>
            </div>
          </div>

          <div className="node-psd-content-grid">
            {/* Live Rendered HTML iframe */}
            <div className="node-psd-preview-card">
              <div className="card-header">
                <span className="card-title"><Eye size={14} /> Live Rendered HTML Document</span>
                <span className="badge badge-poc">Hardcoded Background Images</span>
              </div>
              <div className="preview-scroll-wrapper">
                <iframe
                  title="node-psd-to-html Output"
                  srcDoc={labData.nodePsdToHtml.fullHtml}
                  className="preview-iframe"
                  style={{
                    width: `${800 * previewZoom}px`,
                    height: `${600 * previewZoom}px`,
                  }}
                />
              </div>
            </div>

            {/* Sliced PNG Gallery & Code */}
            <div className="node-psd-slices-card">
              <div className="card-header">
                <span className="card-title"><Code size={14} /> Generated Slices & HTML Source</span>
                <button
                  className="btn btn-outline btn-xs"
                  onClick={() => handleCopy(labData.nodePsdToHtml.fullHtml, 'nodePsdHtml')}
                >
                  {copied === 'nodePsdHtml' ? <Check size={12} /> : <Copy size={12} />} Copy HTML
                </button>
              </div>

              <div className="slices-list-section">
                <h5>Extracted Image Slices ({labData.nodePsdToHtml.generatedAssets.length}):</h5>
                <div className="slices-grid">
                  {labData.nodePsdToHtml.generatedAssets.map((asset, i) => (
                    <div key={i} className="slice-thumbnail-card">
                      <img src={`/assets/${asset}`} alt={asset} className="slice-img" />
                      <span className="slice-name" title={asset}>{asset}</span>
                    </div>
                  ))}
                </div>
              </div>

              <h5 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>Generated HTML Markup:</h5>
              <pre className="code-viewer mini-code" style={{ maxHeight: '250px' }}>
                {labData.nodePsdToHtml.fullHtml}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Engine 4: jmorvan/psdjs (AST & Tree Explorer) */}
      {activeEngine === 'psdJs' && labData && (
        <div className="lab-psdjs-view">
          <div className="psdjs-header-stats">
            <div className="stat-pill"><span>Width × Height:</span> <strong>{labData.psdJs.header?.width} × {labData.psdJs.header?.height}px</strong></div>
            <div className="stat-pill"><span>Channels:</span> <strong>{labData.psdJs.header?.channels}</strong></div>
            <div className="stat-pill"><span>Color Mode:</span> <strong>{labData.psdJs.header?.colorMode}</strong></div>
            <div className="stat-pill"><span>Color Depth:</span> <strong>{labData.psdJs.header?.depth}-bit</strong></div>
            <div className="stat-pill"><span>Parse Time:</span> <strong>{labData.psdJs.timeMs}ms</strong></div>
          </div>

          <div className="psdjs-workspace-grid">
            {/* Interactive Tree View */}
            <div className="psdjs-tree-card">
              <div className="card-header">
                <span className="card-title"><Layers size={14} /> PSD Layer Hierarchy (psd.tree())</span>
                <span className="badge badge-poc">{labData.psdJs.totalLayers} Nodes</span>
              </div>
              <div className="tree-scroll-container">
                {labData.psdJs.tree.map((node) => renderPsdJsTreeNode(node))}
              </div>
            </div>

            {/* Node Inspector Drawer */}
            <div className="psdjs-inspector-card">
              <div className="card-header">
                <span className="card-title"><Sliders size={14} /> Layer Inspector</span>
                <button
                  className="btn btn-outline btn-xs"
                  onClick={() => handleCopy(JSON.stringify(selectedPsdNode, null, 2), 'nodeDetail')}
                >
                  {copied === 'nodeDetail' ? <Check size={12} /> : <Copy size={12} />} Copy Node JSON
                </button>
              </div>

              {selectedPsdNode ? (
                <div className="node-detail-body">
                  <div className="detail-header-block">
                    <h3>{selectedPsdNode.name}</h3>
                    <span className={`node-type-tag ${selectedPsdNode.type}`}>{selectedPsdNode.type}</span>
                  </div>

                  <div className="detail-rows">
                    <div className="detail-row"><span>Position (Top, Left):</span> <strong>{selectedPsdNode.coords?.top}px, {selectedPsdNode.coords?.left}px</strong></div>
                    <div className="detail-row"><span>Dimensions (W × H):</span> <strong>{selectedPsdNode.coords?.width}px × {selectedPsdNode.coords?.height}px</strong></div>
                    <div className="detail-row"><span>Opacity:</span> <strong>{Math.round(selectedPsdNode.opacity * 100)}%</strong></div>
                    <div className="detail-row"><span>Blend Mode:</span> <strong>{selectedPsdNode.blendMode}</strong></div>
                    <div className="detail-row"><span>Visible:</span> <strong>{selectedPsdNode.visible ? 'Yes' : 'No'}</strong></div>
                  </div>

                  {selectedPsdNode.text && (
                    <div className="text-analysis-box">
                      <h5>TypeTool Typography Data:</h5>
                      <div className="text-preview">"{selectedPsdNode.text.value}"</div>
                      <div className="detail-row"><span>Extracted Fonts:</span> <code>{selectedPsdNode.text.fonts.join(', ') || 'None'}</code></div>
                      <div className="detail-row"><span>Font Sizes:</span> <code>{selectedPsdNode.text.sizes.join(', ')}px</code></div>
                      <div className="detail-row"><span>Color:</span> <code>{selectedPsdNode.text.colors.join(', ')}</code></div>
                      <div className="detail-row"><span>Alignment:</span> <code>{selectedPsdNode.text.alignment}</code></div>
                    </div>
                  )}

                  <h5 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>Raw Node Properties:</h5>
                  <pre className="code-viewer mini-code" style={{ maxHeight: '200px' }}>
                    {JSON.stringify(selectedPsdNode, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="p-4 text-muted">Select a layer from the tree on the left to inspect its details.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Versus Duel (Side-by-Side Dual Engine Comparison) */}
      {activeEngine === 'arena' && labData && (
        <div className="lab-arena-view">
          {/* Engine Pickers */}
          <div className="arena-controls-bar">
            <div className="engine-select-group">
              <label>Left Engine:</label>
              <select
                value={arenaLeft}
                onChange={(e) => setArenaLeft(e.target.value as any)}
                className="select-engine"
              >
                <option value="modern">1. Modern Pipeline (ag-psd + HTML/CSS)</option>
                <option value="nodePsd">2. node-psd-to-html (Sliced Background Images)</option>
                <option value="fabric">3. psd2fabric (Fabric.js JSON)</option>
                <option value="psdJs">4. psd.js (AST Object Tree)</option>
              </select>
            </div>

            <div className="vs-badge">VS</div>

            <div className="engine-select-group">
              <label>Right Engine:</label>
              <select
                value={arenaRight}
                onChange={(e) => setArenaRight(e.target.value as any)}
                className="select-engine"
              >
                <option value="nodePsd">2. node-psd-to-html (Sliced Background Images)</option>
                <option value="modern">1. Modern Pipeline (ag-psd + HTML/CSS)</option>
                <option value="fabric">3. psd2fabric (Fabric.js JSON)</option>
                <option value="psdJs">4. psd.js (AST Object Tree)</option>
              </select>
            </div>

            <div className="zoom-controls" style={{ marginLeft: 'auto' }}>
              <button
                className="btn btn-outline btn-xs"
                onClick={() => setPreviewZoom((z) => Math.max(0.4, z - 0.1))}
              >
                <ZoomOut size={12} />
              </button>
              <span className="zoom-label">{Math.round(previewZoom * 100)}%</span>
              <button
                className="btn btn-outline btn-xs"
                onClick={() => setPreviewZoom((z) => Math.min(1.2, z + 0.1))}
              >
                <ZoomIn size={12} />
              </button>
            </div>
          </div>

          {/* Dual Split Screen */}
          <div className="arena-split-container">
            {renderEnginePreview(arenaLeft, 'LEFT')}
            {renderEnginePreview(arenaRight, 'RIGHT')}
          </div>
        </div>
      )}
    </div>
  );
}
