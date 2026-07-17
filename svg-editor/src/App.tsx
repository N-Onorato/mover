import { useState } from 'react';
import type { AssetDocument, ColorRole, Role } from './types';
import { parseSvgString } from './svg/parse';
import { findNode } from './svg/dom';
import { buildMvsvgDocument, parseMvsvgDocument } from './svg/mvsvgFormat';
import { Toolbar } from './components/Toolbar';
import { CanvasView } from './components/CanvasView';
import { Sidebar } from './components/Sidebar';
import { PreviewPanel } from './components/PreviewPanel';
import './App.css';

function baseName(fileName: string): string {
  return fileName.replace(/\.(svg|mvsvg)$/i, '');
}

async function loadDocumentFromFile(file: File): Promise<AssetDocument> {
  const text = await file.text();
  const looksLikeMvsvg = /<\s*mover:asset/.test(text) || file.name.toLowerCase().endsWith('.mvsvg');
  if (looksLikeMvsvg) {
    return parseMvsvgDocument(text);
  }
  const parsed = parseSvgString(text);
  const now = new Date().toISOString();
  return {
    meta: { name: baseName(file.name), sourceFilename: file.name, createdAt: now, updatedAt: now },
    parsed,
    rules: {},
  };
}

function downloadText(filename: string, contents: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [doc, setDoc] = useState<AssetDocument | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState<string | null>(null);

  const handleImportFile = async (file: File) => {
    try {
      const next = await loadDocumentFromFile(file);
      setDoc(next);
      setSelectedId(null);
      setPreviewSize({ width: next.parsed.width, height: next.parsed.height });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleExport = () => {
    if (!doc) return;
    const updated: AssetDocument = { ...doc, meta: { ...doc.meta, updatedAt: new Date().toISOString() } };
    const xml = buildMvsvgDocument(updated);
    downloadText(`${doc.meta.name || 'asset'}.mvsvg`, xml, 'application/xml');
  };

  const handleAssetNameChange = (name: string) => {
    setDoc((prev) => (prev ? { ...prev, meta: { ...prev.meta, name } } : prev));
  };

  const handleChangeRole = (role: Role | null) => {
    if (!doc || !selectedId) return;
    setDoc((prev) => {
      if (!prev) return prev;
      const rules = { ...prev.rules };
      if (role === null) {
        delete rules[selectedId];
      } else {
        rules[selectedId] = { ...rules[selectedId], role };
      }
      return { ...prev, rules };
    });
  };

  const handleChangeColorRole = (colorRole: ColorRole | null) => {
    if (!doc || !selectedId) return;
    setDoc((prev) => {
      if (!prev) return prev;
      const rules = { ...prev.rules };
      const existing = rules[selectedId];
      if (colorRole === null) {
        if (existing) {
          const { colorRole: _drop, ...rest } = existing;
          if (rest.role === 'fixed') {
            delete rules[selectedId];
          } else {
            rules[selectedId] = rest;
          }
        }
      } else {
        rules[selectedId] = { role: existing?.role ?? 'fixed', colorRole };
      }
      return { ...prev, rules };
    });
  };

  const selectedNode = doc && selectedId ? findNode(doc.parsed.root, selectedId) ?? null : null;

  return (
    <div className="app-shell">
      <Toolbar
        hasDoc={!!doc}
        onImportFile={handleImportFile}
        onExport={handleExport}
        assetName={doc?.meta.name ?? ''}
        onAssetNameChange={handleAssetNameChange}
      />
      {error && <div className="error-banner">{error}</div>}
      {!doc ? (
        <div className="empty-state">
          <p>Open an SVG to start tagging stretch/repeat/fixed regions.</p>
        </div>
      ) : (
        <div className="main-layout">
          <div className="canvas-column">
            <CanvasView
              root={doc.parsed.root}
              viewBox={doc.parsed.viewBox}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <PreviewPanel
              doc={doc}
              targetWidth={previewSize.width}
              targetHeight={previewSize.height}
              onTargetWidthChange={(width) => setPreviewSize((s) => ({ ...s, width }))}
              onTargetHeightChange={(height) => setPreviewSize((s) => ({ ...s, height }))}
            />
          </div>
          <Sidebar
            selectedNode={selectedNode}
            rule={selectedId ? doc.rules[selectedId] : undefined}
            onChangeRole={handleChangeRole}
            onChangeColorRole={handleChangeColorRole}
          />
        </div>
      )}
    </div>
  );
}

export default App;
