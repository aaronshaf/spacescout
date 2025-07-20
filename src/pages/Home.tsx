import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useHomeDirectory } from '@/hooks/useFileSystem';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { data: homeDir } = useHomeDirectory();
  const [customPath, setCustomPath] = useState('');

  const handleScan = (path: string) => {
    // Encode path for URL
    const encodedPath = encodeURIComponent(path);
    navigate({ to: `/scan/${encodedPath}` });
  };

  return (
    <div className="home">
      <img src="/logo.png" alt="SpaceScout Logo" className="logo" />
      <h1>SpaceScout</h1>
      <p>Select a location to analyze disk usage</p>
      
      <div className="scan-options">
        <button onClick={() => handleScan('/')}>
          Scan Entire Disk
        </button>
        
        {homeDir && (
          <button onClick={() => handleScan(homeDir)}>
            Scan Home Directory
          </button>
        )}
        
        <div className="custom-path">
          <input
            type="text"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            placeholder="Enter custom path..."
          />
          <button 
            onClick={() => handleScan(customPath)}
            disabled={!customPath}
          >
            Scan
          </button>
        </div>
      </div>
    </div>
  );
};