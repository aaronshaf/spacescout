# SpaceScout Detailed Implementation Plan

## Overview

This document provides a comprehensive implementation plan for SpaceScout, addressing all technical requirements including security, testing, CI/CD, and missing configurations.

## 1. Project Setup & Configuration

### 1.1 Initial Project Structure

```bash
# Create project with Tauri
bunx create-tauri-app spacescout --template react-ts --manager bun
cd spacescout

# Core dependencies
bun add effect @effect/schema
bun add d3 d3-hierarchy d3-scale d3-selection d3-transition d3-array
bun add react-i18next i18next
bun add clsx

# Development dependencies
bun add -d @biomejs/biome husky lint-staged @types/bun
bun add -d @playwright/test @vitest/ui @vitest/coverage-v8
bun add -d @testing-library/react @testing-library/user-event
bun add -d ast-grep
```

### 1.2 TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "jsx": "react-jsx",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "isolatedDeclarations": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "noEmit": true,
    "allowJs": false,
    "baseUrl": "./src",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", "build", "tmp", "**/*.generated.ts"]
}
```

### 1.3 Biome Configuration with TypeScript-only

```json
// biome.json
{
  "files": {
    "include": ["src/**/*.ts", "src/**/*.tsx"],
    "ignore": ["node_modules", "dist", "build", "tmp", "**/*.generated.ts"]
  },
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
      },
      "suspicious": {
        "noExplicitAny": "error"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always",
      "trailingCommas": "es5"
    }
  }
}
```

### 1.4 AST-Grep Configuration

```yaml
# ast-grep.config.yaml
rules:
  - id: no-as-casting
    language: typescript
    rule:
      pattern: $EXPR as $TYPE
      not:
        any:
          - pattern: $EXPR as const
          - pattern: $EXPR as unknown
    message: Type casting with 'as' is banned. Use type guards or 'as unknown' instead.
    severity: error
```

### 1.5 Testing Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.generated.ts',
        'tmp/',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
```

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bun run dev',
    port: 1420,
    reuseExistingServer: !process.env.CI,
  },
});
```

### 1.6 File Size Check Script

```typescript
// scripts/check-file-sizes.ts
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { exit } from 'process';

const MAX_LINES = 700;
const WARN_LINES = 500;

async function checkFileSizes() {
  const files = await glob('src/**/*.{ts,tsx}', {
    ignore: ['**/*.generated.ts', 'tmp/**'],
  });

  let hasErrors = false;
  let hasWarnings = false;

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n').length;

    if (lines > MAX_LINES) {
      console.error(`❌ ${file}: ${lines} lines (max: ${MAX_LINES})`);
      hasErrors = true;
    } else if (lines > WARN_LINES) {
      console.warn(`⚠️  ${file}: ${lines} lines (recommended: <${WARN_LINES})`);
      hasWarnings = true;
    }
  }

  if (hasErrors) {
    console.error('\n❌ File size check failed!');
    exit(1);
  }

  if (!hasWarnings && !hasErrors) {
    // No output when all files are under limit
    exit(0);
  }
}

checkFileSizes();
```

### 1.7 Pre-commit and Pre-push Hooks

```json
// package.json
{
  "scripts": {
    "prepare": "husky install",
    "dev": "tauri dev",
    "build": "tauri build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src",
    "lint:fix": "biome check --write src",
    "format": "biome format --write src",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "check:sizes": "bun scripts/check-file-sizes.ts",
    "check:ast": "ast-grep scan"
  },
  "lint-staged": {
    "src/**/*.{ts,tsx}": [
      "biome check --no-errors-on-unmatched",
      "ast-grep scan"
    ]
  }
}
```

```bash
# .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "🔍 Running pre-commit checks..."

# Type checking
echo "📝 Type checking..."
bun run typecheck || exit 1

# Linting
echo "🧹 Linting..."
bun run lint || exit 1

# AST checks
echo "🔍 Checking for banned patterns..."
bun run check:ast || exit 1

# File size checks
echo "📏 Checking file sizes..."
bun run check:sizes || exit 1

# Unit tests with coverage
echo "🧪 Running tests..."
bun run test:coverage || exit 1

# Run lint-staged
echo "✨ Running lint-staged..."
bunx lint-staged
```

```bash
# .husky/pre-push
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "🚀 Running pre-push checks..."

# All pre-commit checks
.husky/pre-commit || exit 1

# E2E tests
echo "🎭 Running E2E tests..."
bun run test:e2e || exit 1

echo "✅ All checks passed!"
```

## 2. GitHub Actions Configuration

### 2.1 CI Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  CARGO_TERM_COLOR: always

jobs:
  # Fast checks run in parallel
  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - name: Cache dependencies
        uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lockb') }}
      - run: bun install
      - run: bun run typecheck

  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - name: Cache dependencies
        uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lockb') }}
      - run: bun install
      - run: bun run lint
      - run: bun run check:ast
      - run: bun run check:sizes

  test:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - name: Cache dependencies
        uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lockb') }}
      - run: bun install
      - run: bun run test:coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info

  # Expensive checks run after fast checks pass
  e2e:
    name: E2E Tests
    needs: [typecheck, lint, test]
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - uses: actions-rust-lang/setup-rust-toolchain@v1
      - name: Cache dependencies
        uses: actions/cache@v4
        with:
          path: |
            ~/.bun/install/cache
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-full-${{ hashFiles('**/bun.lockb', '**/Cargo.lock') }}
      - run: bun install
      - run: bun x playwright install chromium
      - run: bun run test:e2e

  build:
    name: Build
    needs: [typecheck, lint, test]
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - uses: actions-rust-lang/setup-rust-toolchain@v1
      - name: Cache dependencies
        uses: actions/cache@v4
        with:
          path: |
            ~/.bun/install/cache
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-build-${{ hashFiles('**/bun.lockb', '**/Cargo.lock') }}
      - run: bun install
      - run: bun run build
```

## 3. Security Implementation

### 3.1 macOS Permissions (Tauri)

```rust
// src-tauri/src/permissions.rs
use cocoa::base::id;
use cocoa::foundation::NSString;
use objc::runtime::Object;
use objc::{msg_send, sel, sel_impl};

pub fn request_disk_access_permission() -> bool {
    unsafe {
        let workspace: id = msg_send![
            class!(NSWorkspace),
            sharedWorkspace
        ];
        
        let auth_status: i32 = msg_send![
            workspace,
            requestAccessToFilesWithOptions: 0
        ];
        
        auth_status == 1
    }
}

pub fn check_disk_access_permission() -> bool {
    // Check if we have full disk access
    std::fs::read_dir("/Library/Application Support/com.apple.TCC/")
        .is_ok()
}
```

### 3.2 Error Boundaries

```typescript
// src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Effect } from 'effect';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, resetError: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error without exposing sensitive paths
    const sanitizedError = {
      message: error.message.replace(/\/Users\/[^\/]+/g, '~'),
      stack: error.stack?.replace(/\/Users\/[^\/]+/g, '~'),
      componentStack: errorInfo.componentStack,
    };
    
    console.error('Component error:', sanitizedError);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error!, this.resetError);
      }

      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>An unexpected error occurred. Please try again.</p>
          <button onClick={this.resetError}>Try Again</button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook for error boundary
export function useErrorBoundary() {
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return {
    throwError: (error: Error) => setError(error),
    reset: () => setError(null),
  };
}
```

## 4. UI Components Implementation

### 4.1 Disk Selector

```typescript
// src/components/DiskSelector/DiskSelector.tsx
import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Effect, pipe } from 'effect';
import { FileSystemService } from '@/services/FileSystemService';

interface Disk {
  name: string;
  path: string;
  total: number;
  free: number;
  mountPoint: string;
}

export const DiskSelector: React.FC<{
  onSelect: (path: string) => void;
}> = ({ onSelect }) => {
  const [disks, setDisks] = useState<Disk[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    checkPermissionAndLoadDisks();
  }, []);

  const checkPermissionAndLoadDisks = async () => {
    try {
      const permission = await invoke<boolean>('check_disk_permission');
      setHasPermission(permission);

      if (permission) {
        const diskList = await invoke<Disk[]>('get_available_disks');
        setDisks(diskList);
      }
    } catch (error) {
      console.error('Failed to load disks:', error);
    } finally {
      setLoading(false);
    }
  };

  const requestPermission = async () => {
    const granted = await invoke<boolean>('request_disk_permission');
    if (granted) {
      setHasPermission(true);
      checkPermissionAndLoadDisks();
    }
  };

  if (loading) {
    return <div className="disk-selector loading">Checking permissions...</div>;
  }

  if (!hasPermission) {
    return (
      <div className="disk-selector no-permission">
        <h3>Disk Access Required</h3>
        <p>SpaceScout needs permission to analyze your disk space.</p>
        <button onClick={requestPermission}>Grant Permission</button>
      </div>
    );
  }

  return (
    <div className="disk-selector">
      <h3>Select a Disk to Analyze</h3>
      <div className="disk-list">
        {disks.map((disk) => (
          <button
            key={disk.path}
            className="disk-item"
            onClick={() => onSelect(disk.path)}
          >
            <div className="disk-name">{disk.name}</div>
            <div className="disk-info">
              {formatBytes(disk.free)} free of {formatBytes(disk.total)}
            </div>
            <div className="disk-usage-bar">
              <div
                className="disk-usage-fill"
                style={{
                  width: `${((disk.total - disk.free) / disk.total) * 100}%`,
                }}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
```

### 4.2 D3 Treemap Component

```typescript
// src/components/Treemap/Treemap.tsx
import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { TreemapNode } from '@/types/FileSystem';
import { formatBytes } from '@/utils/format';
import { useTheme } from '@/hooks/useTheme';

interface TreemapProps {
  data: TreemapNode;
  onNodeClick: (node: TreemapNode) => void;
  onFileSelect: (node: TreemapNode) => void;
}

export const Treemap: React.FC<TreemapProps> = ({
  data,
  onNodeClick,
  onFileSelect,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const { isDark } = useTheme();

  // Handle resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Create hierarchy
    const hierarchy = d3.hierarchy(data)
      .sum((d) => d.size)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    // Create treemap layout
    const treemap = d3.treemap<TreemapNode>()
      .size([dimensions.width, dimensions.height])
      .paddingInner(1)
      .paddingOuter(2)
      .round(true);

    const root = treemap(hierarchy);

    // Color scale
    const color = d3.scaleOrdinal()
      .domain(['folder', 'file'])
      .range(isDark ? ['#4a5568', '#2d3748'] : ['#e2e8f0', '#cbd5e0']);

    // Create groups for each node
    const node = svg.selectAll('g')
      .data(root.leaves())
      .join('g')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`);

    // Add rectangles
    node.append('rect')
      .attr('id', (d) => d.data.path)
      .attr('width', (d) => d.x1 - d.x0)
      .attr('height', (d) => d.y1 - d.y0)
      .attr('fill', (d) => color(d.data.isDir ? 'folder' : 'file'))
      .attr('stroke', isDark ? '#1a202c' : '#ffffff')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        if (d.data.isDir) {
          onNodeClick(d.data);
        } else {
          onFileSelect(d.data);
        }
      });

    // Add text labels
    node.append('text')
      .attr('x', 4)
      .attr('y', 16)
      .text((d) => d.data.name)
      .attr('font-size', '12px')
      .attr('fill', isDark ? '#f7fafc' : '#1a202c')
      .style('pointer-events', 'none')
      .each(function(d) {
        const self = d3.select(this);
        const width = d.x1 - d.x0 - 8;
        let text = d.data.name;
        
        // Truncate text if needed
        while (self.node()!.getComputedTextLength() > width && text.length > 0) {
          text = text.slice(0, -1);
          self.text(text + '...');
        }
      });

    // Add size label for larger rectangles
    node.filter((d) => (d.x1 - d.x0) > 60 && (d.y1 - d.y0) > 40)
      .append('text')
      .attr('x', 4)
      .attr('y', 32)
      .text((d) => formatBytes(d.data.size))
      .attr('font-size', '10px')
      .attr('fill', isDark ? '#cbd5e0' : '#4a5568')
      .style('pointer-events', 'none');

    // Add transitions
    node.selectAll('rect')
      .on('mouseenter', function() {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('opacity', 0.8);
      })
      .on('mouseleave', function() {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('opacity', 1);
      });

  }, [data, dimensions, isDark, onNodeClick, onFileSelect]);

  return (
    <div ref={containerRef} className="treemap-container">
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} />
    </div>
  );
};
```

### 4.3 File Details Sidebar

```typescript
// src/components/FileDetails/FileDetails.tsx
import React from 'react';
import { TreemapNode } from '@/types/FileSystem';
import { formatBytes, formatDate } from '@/utils/format';
import { getFileIcon } from '@/utils/fileIcons';

interface FileDetailsProps {
  file: TreemapNode | null;
  onClose: () => void;
}

export const FileDetails: React.FC<FileDetailsProps> = ({ file, onClose }) => {
  if (!file) return null;

  return (
    <div className="file-details">
      <div className="file-details-header">
        <button className="close-button" onClick={onClose}>×</button>
        <h3>File Details</h3>
      </div>
      
      <div className="file-details-content">
        <div className="file-icon">
          {getFileIcon(file.name)}
        </div>
        
        <div className="file-info">
          <div className="file-name">{file.name}</div>
          <div className="file-path">{file.path}</div>
          
          <div className="file-stats">
            <div className="stat">
              <span className="label">Size:</span>
              <span className="value">{formatBytes(file.size)}</span>
            </div>
            <div className="stat">
              <span className="label">Type:</span>
              <span className="value">{file.isDir ? 'Directory' : 'File'}</span>
            </div>
            {file.lastModified && (
              <div className="stat">
                <span className="label">Modified:</span>
                <span className="value">{formatDate(file.lastModified)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="file-actions">
        <button className="action-button">Reveal in Finder</button>
        <button className="action-button danger">Move to Trash</button>
      </div>
    </div>
  );
};
```

### 4.4 Theme Hook

```typescript
// src/hooks/useTheme.ts
import { useEffect, useState } from 'react';

export function useTheme() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    setIsDark(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return { isDark };
}
```

## 5. Breadcrumb Navigation

```typescript
// src/components/Breadcrumb/Breadcrumb.tsx
import React from 'react';

interface BreadcrumbProps {
  path: string[];
  onNavigate: (index: number) => void;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ path, onNavigate }) => {
  return (
    <nav className="breadcrumb">
      {path.map((segment, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="separator">/</span>}
          <button
            className={`breadcrumb-item ${index === path.length - 1 ? 'current' : ''}`}
            onClick={() => onNavigate(index)}
            disabled={index === path.length - 1}
          >
            {segment || 'Root'}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
};
```

## 6. Main App Integration

```typescript
// src/App.tsx
import React, { useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DiskSelector } from '@/components/DiskSelector';
import { Treemap } from '@/components/Treemap';
import { FileDetails } from '@/components/FileDetails';
import { Breadcrumb } from '@/components/Breadcrumb';
import { ScanProgress } from '@/components/ScanProgress';
import { useScan } from '@/hooks/useScan';
import { TreemapNode } from '@/types/FileSystem';

export const App: React.FC = () => {
  const [selectedDisk, setSelectedDisk] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<TreemapNode | null>(null);
  const [navigationStack, setNavigationStack] = useState<TreemapNode[]>([]);
  
  const { data, loading, progress, error, scan } = useScan();

  const handleDiskSelect = (path: string) => {
    setSelectedDisk(path);
    setCurrentPath([path]);
    scan(path);
  };

  const handleNodeClick = (node: TreemapNode) => {
    if (node.isDir && node.children) {
      setNavigationStack([...navigationStack, data!]);
      setCurrentPath([...currentPath, node.name]);
      // Update view to show node's children
    }
  };

  const handleBreadcrumbNavigate = (index: number) => {
    const newPath = currentPath.slice(0, index + 1);
    const newStack = navigationStack.slice(0, index);
    setCurrentPath(newPath);
    setNavigationStack(newStack);
    // Update view accordingly
  };

  return (
    <div className="app">
      <ErrorBoundary>
        <header className="app-header">
          <h1>SpaceScout</h1>
          {currentPath.length > 0 && (
            <Breadcrumb path={currentPath} onNavigate={handleBreadcrumbNavigate} />
          )}
        </header>

        <main className="app-main">
          {!selectedDisk && (
            <DiskSelector onSelect={handleDiskSelect} />
          )}

          {loading && <ScanProgress progress={progress} />}

          {error && (
            <div className="error-message">
              {error.message}
              <button onClick={() => scan(selectedDisk!)}>Retry</button>
            </div>
          )}

          {data && !loading && (
            <div className="visualization-container">
              <Treemap
                data={data}
                onNodeClick={handleNodeClick}
                onFileSelect={setSelectedFile}
              />
              <FileDetails file={selectedFile} onClose={() => setSelectedFile(null)} />
            </div>
          )}
        </main>
      </ErrorBoundary>
    </div>
  );
};
```

## 7. CSS Structure

```css
/* src/styles/app.css */
:root {
  --color-bg: #ffffff;
  --color-text: #1a202c;
  --color-border: #e2e8f0;
  --color-hover: #f7fafc;
  --color-primary: #3182ce;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #1a202c;
    --color-text: #f7fafc;
    --color-border: #2d3748;
    --color-hover: #2d3748;
    --color-primary: #63b3ed;
  }
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
}

.treemap-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.file-details {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 320px;
  background: var(--color-bg);
  border-left: 1px solid var(--color-border);
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
  transform: translateX(0);
  transition: transform 0.3s ease;
}

.breadcrumb {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background: var(--color-hover);
  border-bottom: 1px solid var(--color-border);
}
```

This comprehensive plan now includes:

1. ✅ D3 treemap visualization instead of Motion
2. ✅ Disk selection with permission handling
3. ✅ Error boundaries for React
4. ✅ AST-grep configuration to ban `as` typecasting
5. ✅ File size checking scripts
6. ✅ Pre-commit and pre-push hooks
7. ✅ GitHub Actions with caching and optimization
8. ✅ Test coverage enforcement
9. ✅ Dark/light mode support (system preference)
10. ✅ File details sidebar
11. ✅ Breadcrumb navigation
12. ✅ TypeScript-only configuration
13. ✅ Security considerations

The plan is ready for implementation!