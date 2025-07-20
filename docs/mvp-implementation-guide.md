# MVP Implementation Guide

## Overview

This guide outlines the step-by-step implementation of SpaceScout MVP - a minimal disk space analyzer that visualizes storage usage through an interactive treemap.

## MVP Scope

### In Scope
- Scan a selected directory or entire disk
- Display treemap visualization of file/folder sizes
- Basic navigation (click to zoom, breadcrumb)
- Show file details on hover
- Support for macOS 15.5+

### Out of Scope (Post-MVP)
- File operations (delete, move, compress)
- Advanced filtering options
- Search functionality
- Export features
- Multi-language support (beyond English)

## Implementation Steps

### Step 1: Project Initialization

```bash
# Create Tauri app with Bun
bunx create-tauri-app spacescout --template react-ts --manager bun

# Navigate to project
cd spacescout

# Install additional dependencies
bun add effect @effect/schema
bun add -d @biomejs/biome husky @types/bun
bun add react-i18next i18next
bun add d3-hierarchy d3-scale d3-selection
```

### Step 2: Configure TypeScript

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "jsx": "react-jsx",
    "strict": true,
    "isolatedDeclarations": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "noEmit": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### Step 3: Setup Biome Configuration

```json
// biome.json
{
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "complexity": {
        "noForEach": "off"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always"
    }
  }
}
```

### Step 4: Configure Pre-commit Hooks

```json
// package.json scripts
{
  "scripts": {
    "prepare": "husky install",
    "lint": "biome check src",
    "lint:fix": "biome check --write src",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "test:coverage": "bun test --coverage"
  }
}
```

```bash
# .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

bun run typecheck
bun run lint
bun run test
```

### Step 5: Implement Rust Backend

```rust
// src-tauri/src/scanner.rs
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}

pub fn scan_directory(
    path: &Path,
    app_handle: &tauri::AppHandle,
) -> Result<FileNode, String> {
    let metadata = fs::metadata(path)
        .map_err(|e| format!("Failed to read metadata: {}", e))?;
    
    let name = path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    
    if metadata.is_file() {
        return Ok(FileNode {
            name,
            path: path.to_string_lossy().to_string(),
            size: metadata.len(),
            is_dir: false,
            children: None,
        });
    }
    
    let mut children = Vec::new();
    let mut total_size = 0u64;
    
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            // Emit progress
            let _ = app_handle.emit("scan-progress", 
                &entry.path().to_string_lossy().to_string());
            
            if let Ok(child) = scan_directory(&entry.path(), app_handle) {
                total_size += if child.is_dir { child.size } else { child.size };
                children.push(child);
            }
        }
    }
    
    Ok(FileNode {
        name,
        path: path.to_string_lossy().to_string(),
        size: total_size,
        is_dir: true,
        children: Some(children),
    })
}
```

### Step 6: Create Tauri Commands

```rust
// src-tauri/src/commands.rs
use crate::scanner::{scan_directory, FileNode};
use std::path::Path;

#[tauri::command]
pub async fn scan_path(
    path: String,
    app_handle: tauri::AppHandle,
) -> Result<FileNode, String> {
    let path = Path::new(&path);
    scan_directory(path, &app_handle)
}

#[tauri::command]
pub fn get_home_directory() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Failed to get home directory".to_string())
}
```

### Step 7: Frontend Structure

```typescript
// src/types/FileSystem.ts
export interface FileNode {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
  children?: FileNode[];
}

export interface TreemapNode extends FileNode {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  depth: number;
  parent?: TreemapNode;
}
```

### Step 8: Effect Services

```typescript
// src/services/FileSystemService.ts
import { Effect, Layer, Context } from 'effect';
import { invoke } from '@tauri-apps/api/core';
import { FileNode } from '../types/FileSystem';

export interface FileSystemService {
  readonly scan: (path: string) => Effect.Effect<FileNode, Error>;
  readonly getHomeDirectory: () => Effect.Effect<string, Error>;
}

export const FileSystemService = Context.GenericTag<FileSystemService>(
  'FileSystemService'
);

export const FileSystemServiceLive = Layer.succeed(
  FileSystemService,
  {
    scan: (path: string) =>
      Effect.tryPromise({
        try: () => invoke<FileNode>('scan_path', { path }),
        catch: (error) => new Error(`Scan failed: ${error}`),
      }),
    
    getHomeDirectory: () =>
      Effect.tryPromise({
        try: () => invoke<string>('get_home_directory'),
        catch: (error) => new Error(`Failed to get home directory: ${error}`),
      }),
  }
);
```

### Step 9: Treemap Component with Motion Animations

```typescript
// src/components/Treemap/Treemap.tsx
import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as d3 from 'd3';
import { TreemapNode } from '../../types/FileSystem';
import { formatBytes } from '../../utils/format';

interface TreemapProps {
  data: TreemapNode;
  onNodeClick: (node: TreemapNode) => void;
}

interface AnimatedNode {
  id: string;
  node: d3.HierarchyRectangularNode<TreemapNode>;
  color: string;
}

export const Treemap: React.FC<TreemapProps> = ({ data, onNodeClick }) => {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const { nodes, width, height } = useMemo(() => {
    const containerWidth = 800; // Will be dynamic
    const containerHeight = 600; // Will be dynamic
    
    const hierarchy = d3.hierarchy(data)
      .sum((d) => (d.children ? 0 : d.size))
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    const treemap = d3.treemap<TreemapNode>()
      .size([containerWidth, containerHeight])
      .padding(2)
      .round(true);

    const root = treemap(hierarchy);
    const color = d3.scaleOrdinal(d3.schemeCategory10);
    
    const animatedNodes: AnimatedNode[] = root.leaves().map((node) => ({
      id: node.data.path,
      node,
      color: color(node.parent?.data.name || ''),
    }));

    return {
      nodes: animatedNodes,
      width: containerWidth,
      height: containerHeight,
    };
  }, [data]);

  return (
    <div className="treemap-container" style={{ width, height, position: 'relative' }}>
      <AnimatePresence mode="popLayout">
        {nodes.map(({ id, node, color }) => {
          const isHovered = hoveredNode === id;
          const rect = {
            x: node.x0,
            y: node.y0,
            width: node.x1 - node.x0,
            height: node.y1 - node.y0,
          };

          return (
            <motion.div
              key={id}
              layoutId={id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ 
                opacity: 1, 
                scale: isHovered ? 1.02 : 1,
                zIndex: isHovered ? 10 : 1,
              }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{
                layout: { type: "spring", stiffness: 300, damping: 30 },
                scale: { type: "spring", stiffness: 400, damping: 25 },
              }}
              style={{
                position: 'absolute',
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
                backgroundColor: color,
                border: '1px solid rgba(255, 255, 255, 0.2)',
                cursor: 'pointer',
                overflow: 'hidden',
                borderRadius: 4,
              }}
              onHoverStart={() => setHoveredNode(id)}
              onHoverEnd={() => setHoveredNode(null)}
              onClick={() => onNodeClick(node.data)}
              whileHover={{
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
              }}
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                style={{
                  padding: '8px',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 500,
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.4)',
                }}
              >
                <div style={{ 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap' 
                }}>
                  {node.data.name}
                </div>
                {rect.height > 40 && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 0.8, y: 0 }}
                    transition={{ delay: 0.3 }}
                    style={{ fontSize: '10px', marginTop: '4px' }}
                  >
                    {formatBytes(node.data.size)}
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      
      {/* Tooltip */}
      <AnimatePresence>
        {hoveredNode && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed',
              bottom: 20,
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              color: 'white',
              padding: '12px 20px',
              borderRadius: 8,
              fontSize: '14px',
              pointerEvents: 'none',
              zIndex: 100,
            }}
          >
            {nodes.find((n) => n.id === hoveredNode)?.node.data.name} - {' '}
            {formatBytes(nodes.find((n) => n.id === hoveredNode)?.node.data.size || 0)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
```

### Step 10: Main App Component

```typescript
// src/App.tsx
import React, { useState } from 'react';
import { Effect, pipe } from 'effect';
import { FileSystemService } from './services/FileSystemService';
import { Treemap } from './components/Treemap/Treemap';
import { FileNode, TreemapNode } from './types/FileSystem';
import './App.css';

export const App: React.FC = () => {
  const [data, setData] = useState<TreemapNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async (path: string) => {
    setLoading(true);
    setError(null);

    const program = pipe(
      FileSystemService,
      Effect.flatMap((service) => service.scan(path)),
      Effect.map((result) => result as TreemapNode),
      Effect.provide(FileSystemServiceLive)
    );

    try {
      const result = await Effect.runPromise(program);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = (node: TreemapNode) => {
    if (node.isDir && node.children?.length) {
      setData(node);
    }
  };

  return (
    <div className="app">
      <div className="toolbar">
        <button onClick={() => handleScan('/')}>
          Scan Root
        </button>
        <button onClick={() => handleScan(process.env.HOME || '/')}>
          Scan Home
        </button>
      </div>
      
      {loading && <div className="loading">Scanning...</div>}
      {error && <div className="error">{error}</div>}
      
      {data && !loading && (
        <Treemap data={data} onNodeClick={handleNodeClick} />
      )}
    </div>
  );
};
```

### Step 11: Styling

```css
/* src/App.css */
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1e1e1e;
  color: #fff;
}

.toolbar {
  display: flex;
  gap: 10px;
  padding: 10px;
  background: #2d2d2d;
  border-bottom: 1px solid #444;
}

.toolbar button {
  padding: 8px 16px;
  background: #007acc;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.toolbar button:hover {
  background: #005a9e;
}

.treemap-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.loading,
.error {
  padding: 20px;
  text-align: center;
}

.error {
  color: #ff6b6b;
}
```

### Step 12: Testing Setup

```typescript
// tests/unit/utils/format.test.ts
import { describe, it, expect } from 'bun:test';
import { formatBytes } from '../../src/utils/format';

describe('formatBytes', () => {
  it('should format bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(1073741824)).toBe('1.0 GB');
  });
});
```

### Step 13: Build Configuration

```javascript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'esnext',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
```

## Running the MVP

```bash
# Development
bun run tauri dev

# Build for production
bun run tauri build

# Run tests
bun test

# Check types
bun run typecheck

# Lint
bun run lint
```

## Next Steps After MVP

1. **Performance Optimization**
   - Implement virtual scrolling for large datasets
   - Add web workers for treemap calculations
   - Cache scan results

2. **Enhanced Features**
   - Breadcrumb navigation
   - File type filtering
   - Size threshold filtering
   - Export scan results

3. **UI Polish**
   - Smooth animations
   - Better color schemes
   - Dark/light mode toggle
   - Keyboard navigation

4. **Advanced Operations**
   - File deletion with confirmation
   - Move to trash
   - Reveal in Finder
   - Quick look preview