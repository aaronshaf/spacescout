import React, { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ContextMenuProps {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
  onClose: () => void;
  onNavigate?: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ 
  x, 
  y, 
  path, 
  isDir, 
  onClose,
  onNavigate
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Close on escape key
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleShowInFinder = async () => {
    try {
      await invoke('show_in_finder', { path });
      onClose();
    } catch (error) {
      console.error('Failed to show in Finder:', error);
    }
  };

  const handleMoveToTrash = async () => {
    try {
      await invoke('move_to_trash', { path });
      onClose();
      // Trigger a rescan of the parent directory
      window.location.reload();
    } catch (error) {
      console.error('Failed to move to trash:', error);
      alert(`Failed to move to trash: ${error}`);
    }
  };

  // Adjust position to keep menu on screen
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 100);

  return (
    <div 
      ref={menuRef}
      className="context-menu"
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        zIndex: 1000
      }}
    >
      <ul className="context-menu-list">
        {isDir && onNavigate && (
          <>
            <li className="context-menu-item" onClick={onNavigate}>
              Open
            </li>
            <li className="context-menu-separator"></li>
          </>
        )}
        <li className="context-menu-item" onClick={handleShowInFinder}>
          Show in Finder
        </li>
        <li className="context-menu-separator"></li>
        <li className="context-menu-item" onClick={handleMoveToTrash}>
          Move to Trash
        </li>
      </ul>
    </div>
  );
};