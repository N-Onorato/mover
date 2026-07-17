import { useRef } from 'react';

interface Props {
  hasDoc: boolean;
  onImportFile: (file: File) => void;
  onExport: () => void;
  assetName: string;
  onAssetNameChange: (name: string) => void;
}

export function Toolbar({ hasDoc, onImportFile, onExport, assetName, onAssetNameChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="toolbar">
      <span className="brand">SVG Enricher</span>
      <button onClick={() => inputRef.current?.click()}>Open SVG / .mvsvg…</button>
      <input
        ref={inputRef}
        type="file"
        accept=".svg,.mvsvg,image/svg+xml,application/xml"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImportFile(file);
          e.target.value = '';
        }}
      />
      {hasDoc && (
        <>
          <input
            className="asset-name"
            value={assetName}
            onChange={(e) => onAssetNameChange(e.target.value)}
          />
          <button onClick={onExport}>Export .mvsvg</button>
        </>
      )}
    </div>
  );
}
