import React, { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { ScanProgress as ScanProgressType } from '@/schemas/FileSystem';

interface ScanProgressComponentProps {
  onCancel: () => void;
}

export const ScanProgress: React.FC<ScanProgressComponentProps> = ({ onCancel }) => {
  const [progress, setProgress] = useState<ScanProgressType | null>(null);

  useEffect(() => {
    const unlisten = listen<ScanProgressType>('scan-progress', (event) => {
      setProgress(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="scan-progress">
      <div className="scan-progress-content">
        <h2>Scanning...</h2>
        <div className="progress-info">
          {progress ? (
            <>
              <p className="current-path">{progress.current_path}</p>
              <p className="items-count">Processed: {progress.items_processed} items</p>
            </>
          ) : (
            <p>Starting scan...</p>
          )}
        </div>
        <button onClick={onCancel} className="cancel-button">
          Cancel
        </button>
      </div>
    </div>
  );
};