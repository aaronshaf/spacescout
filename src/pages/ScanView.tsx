import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useScanDirectory } from '@/hooks/useFileSystem';
import { Treemap } from '@/components/Treemap';
import { ScanProgressTreemap } from '@/components/ScanProgressTreemap';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { StatusBar } from '@/components/StatusBar';
import type { FileNode } from '@/schemas/FileSystem';

export const ScanView: React.FC = () => {
  const { path } = useParams({ from: '/scan/$path' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const decodedPath = decodeURIComponent(path);
  
  const { data, isLoading, error, refetch } = useScanDirectory(decodedPath);
  const [dimensions, setDimensions] = useState({ 
    width: window.innerWidth - 40, 
    height: window.innerHeight - 112 // 60px header + 32px status bar + 20px margin
  });
  
  // Handle window resize
  React.useEffect(() => {
    const handleResize = () => {
      setDimensions({ 
        width: window.innerWidth - 40, 
        height: window.innerHeight - 112 // Account for header and status bar
      });
    };
    
    window.addEventListener('resize', handleResize);
    handleResize(); // Call once to set initial size
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Handle Command+R for rescan
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd+R (Mac) or Ctrl+R (Windows/Linux)
      if ((event.metaKey || event.ctrlKey) && event.key === 'r') {
        event.preventDefault(); // Prevent browser refresh
        console.log('[ScanView] Triggering rescan via Cmd+R');
        
        // Clear the cache for this path and refetch
        queryClient.removeQueries({ queryKey: ['scan', decodedPath] });
        refetch();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [decodedPath, queryClient, refetch]);
  
  // Debug logging
  console.log('[ScanView] Component state:', { 
    isLoading, 
    hasData: !!data, 
    error: error?.message,
    dataDetails: data ? {
      name: data.name,
      path: data.path,
      size: data.size,
      childrenCount: data.children?.length || 0
    } : null
  });

  const handleNodeClick = (node: FileNode) => {
    if (node && node.isDir) {
      // Navigate to the new directory path
      const encodedPath = encodeURIComponent(node.path);
      navigate({ to: '/scan/$path', params: { path: encodedPath } });
    }
  };

  const handleBack = () => {
    // Navigate back to parent directory or home
    const pathParts = decodedPath.split('/').filter(Boolean);
    if (pathParts.length > 1) {
      const parentPath = '/' + pathParts.slice(0, -1).join('/');
      const encodedParentPath = encodeURIComponent(parentPath);
      navigate({ to: '/scan/$path', params: { path: encodedParentPath } });
    } else {
      navigate({ to: '/' });
    }
  };

  if (isLoading) {
    console.log('[ScanView] Rendering progress view because isLoading=true');
    return <ScanProgressTreemap onCancel={() => navigate({ to: '/' })} />;
  }

  if (error) {
    console.log('[ScanView] Rendering error view:', error.message);
    return (
      <div className="error">
        <p>Error: {error.message}</p>
        <button onClick={() => navigate({ to: '/' })}>Go Back</button>
      </div>
    );
  }

  const displayData = data;
  
  console.log('[ScanView] Rendering results view with data:', {
    hasDisplayData: !!displayData,
    displayDataName: displayData?.name,
    displayDataChildrenCount: displayData?.children?.length || 0
  });

  return (
    <div className="scan-view">
      <nav>
        <button onClick={handleBack} className="back-button">← Back</button>
        <div className="header-content">
          <Breadcrumbs currentPath={decodedPath} />
        </div>
      </nav>
      
      {displayData && (
        <div className="treemap-container">
          <Treemap
            data={displayData}
            width={dimensions.width}
            height={dimensions.height}
            onNodeClick={handleNodeClick}
          />
        </div>
      )}
      
      <StatusBar 
        currentPath={decodedPath}
        totalSize={displayData?.size}
      />
    </div>
  );
};