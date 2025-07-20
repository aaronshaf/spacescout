import React from 'react';
import { useNavigate } from '@tanstack/react-router';

interface BreadcrumbsProps {
  currentPath: string;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ currentPath }) => {
  const navigate = useNavigate();
  
  // Parse the path into segments
  const pathSegments = currentPath.split('/').filter(Boolean);
  
  // Determine the root label based on the path
  const getRootLabel = (path: string) => {
    const homeDir = '~'; // We'll get this from env later
    if (path.startsWith('/Users/') || path.includes(homeDir)) {
      const userMatch = path.match(/\/Users\/([^\/]+)/);
      if (userMatch) {
        return `${userMatch[1]}'s Mac`;
      }
      return 'Home';
    }
    if (path.startsWith('/Applications')) return 'Applications';
    if (path.startsWith('/System')) return 'System';
    if (path.startsWith('/Library')) return 'Library';
    if (path.startsWith('/Volumes/')) {
      const volumeMatch = path.match(/\/Volumes\/([^\/]+)/);
      if (volumeMatch) {
        return volumeMatch[1]; // Volume name
      }
    }
    return 'Disk'; // Default fallback
  };
  
  const handleBreadcrumbClick = (segmentIndex: number) => {
    if (segmentIndex === -1) {
      // Root click - go to the disk root
      const rootPath = '/' + (pathSegments.length > 0 ? pathSegments[0] : '');
      const encodedPath = encodeURIComponent(rootPath);
      navigate({ to: '/scan/$path', params: { path: encodedPath } });
    } else {
      // Build path up to the clicked segment
      const targetPath = '/' + pathSegments.slice(0, segmentIndex + 1).join('/');
      const encodedPath = encodeURIComponent(targetPath);
      navigate({ to: '/scan/$path', params: { path: encodedPath } });
    }
  };
  
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb navigation">
      <ol className="breadcrumb-list">
        {/* Root breadcrumb */}
        <li className="breadcrumb-item">
          <button 
            className="breadcrumb-button root" 
            onClick={() => handleBreadcrumbClick(-1)}
            title={`Go to ${getRootLabel(currentPath)}`}
          >
            📁 {getRootLabel(currentPath)}
          </button>
        </li>
        
        {/* Path segments */}
        {pathSegments.map((segment, index) => (
          <li key={index} className="breadcrumb-item">
            <span className="breadcrumb-separator">›</span>
            <button 
              className={`breadcrumb-button ${index === pathSegments.length - 1 ? 'current' : ''}`}
              onClick={() => handleBreadcrumbClick(index)}
              title={`Go to ${segment}`}
              disabled={index === pathSegments.length - 1}
            >
              {segment}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
};