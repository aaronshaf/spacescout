import React, { useEffect, useState, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

interface StatusBarProps {
  currentPath?: string;
  totalSize?: number;
}

interface ScanSummary {
  mdfindPasses: number;
  totalFilesFound: number;
  lastScanTime?: Date;
}

export const StatusBar: React.FC<StatusBarProps> = ({ currentPath, totalSize }) => {
  const [scanStatus, setScanStatus] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [scanSummary, setScanSummary] = useState<ScanSummary>({
    mdfindPasses: 0,
    totalFilesFound: 0
  });
  const summaryRef = useRef<ScanSummary>({
    mdfindPasses: 0,
    totalFilesFound: 0
  });

  useEffect(() => {
    let unlistenProgress: (() => void) | null = null;
    let unlistenIntermediate: (() => void) | null = null;

    const setupListeners = async () => {
      try {
        // Listen for scan progress
        unlistenProgress = await listen<{ current_path: string; items_processed: number }>('scan-progress', (event) => {
          const { current_path, items_processed } = event.payload;
          setIsScanning(true);
          
          // Extract scan type from the message
          if (current_path.includes('mdfind')) {
            setScanStatus(current_path);
            // Count mdfind passes
            const passMatch = current_path.match(/pass (\d+)\/(\d+)/);
            if (passMatch) {
              summaryRef.current.mdfindPasses = parseInt(passMatch[2]);
            }
            // Extract file count from mdfind status
            const fileMatch = current_path.match(/Found (\d+) large files/);
            if (fileMatch) {
              summaryRef.current.totalFilesFound = parseInt(fileMatch[1]);
            }
          } else if (current_path.includes('du')) {
            setScanStatus(current_path);
            // Extract file count from du status
            const duMatch = current_path.match(/Found (\d+) items/);
            if (duMatch) {
              summaryRef.current.totalFilesFound = Math.max(
                summaryRef.current.totalFilesFound, 
                parseInt(duMatch[1])
              );
            }
          } else if (current_path.includes('Building directory tree')) {
            setScanStatus('Building directory tree...');
          } else {
            setScanStatus(`Scanning: ${items_processed} items`);
            summaryRef.current.totalFilesFound = Math.max(
              summaryRef.current.totalFilesFound, 
              items_processed
            );
          }
        });

        // Listen for intermediate results (indicates active scanning)
        unlistenIntermediate = await listen('scan-intermediate', () => {
          setIsScanning(true);
        });
      } catch (error) {
        console.error('[StatusBar] Failed to setup listeners:', error);
      }
    };

    setupListeners();

    // Reset scanning status after no updates for 2 seconds
    let timeoutId: NodeJS.Timeout;
    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsScanning(false);
        setScanStatus('');
        // Save summary with timestamp when scan completes
        setScanSummary({
          ...summaryRef.current,
          lastScanTime: new Date()
        });
      }, 2000);
    };

    // Reset timeout whenever status changes
    if (isScanning) {
      resetTimeout();
    }

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenIntermediate) unlistenIntermediate();
      clearTimeout(timeoutId);
    };
  }, [isScanning]);

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  return (
    <div className="status-bar">
      <div className="status-section status-main">
        <span className="status-indicator">
          {isScanning ? (
            <span className="scanning">⟳</span>
          ) : (
            <span className="ready">✓</span>
          )}
        </span>
        
        {isScanning ? (
          <span className="status-text">{scanStatus}</span>
        ) : (
          <div 
            className="status-info-container"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <span className="status-info-icon">ⓘ</span>
            
            {showTooltip && scanSummary.lastScanTime && (
              <div className="status-tooltip">
                <div className="tooltip-arrow"></div>
                <h4>Last Scan Summary</h4>
                <div className="tooltip-row">
                  <span className="tooltip-label">mdfind passes:</span>
                  <span className="tooltip-value">{scanSummary.mdfindPasses || 0}</span>
                </div>
                <div className="tooltip-row">
                  <span className="tooltip-label">Files found:</span>
                  <span className="tooltip-value">{scanSummary.totalFilesFound.toLocaleString()}</span>
                </div>
                <div className="tooltip-row">
                  <span className="tooltip-label">Completed:</span>
                  <span className="tooltip-value">
                    {scanSummary.lastScanTime.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {currentPath && (
        <div className="status-section path">
          <span className="status-label">Path:</span>
          <span className="status-value">{currentPath}</span>
        </div>
      )}
      
      {totalSize !== undefined && totalSize > 0 && (
        <div className="status-section size">
          <span className="status-label">Total:</span>
          <span className="status-value">{formatSize(totalSize)}</span>
        </div>
      )}
      
      <div className="status-section hint">
        <span className="status-hint">⌘R to rescan</span>
      </div>
    </div>
  );
};