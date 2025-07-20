# SpaceScout MVP Implementation Plan (Simplified)

## Goal
Build a minimal working disk space analyzer that:
1. Scans a directory/disk
2. Shows treemap visualization  
3. Allows basic navigation

## Tech Stack (MVP Essentials)
- **Tauri** - Native app wrapper
- **React + TypeScript** - UI
- **D3** - Treemap visualization
- **Effect & Effect Schema** - Data management & validation
- **TanStack Router** - Routing
- **TanStack Query** - Async state (for scan operations)
- **Vite** - Build tool
- **Bun** - Package manager

## Phase 1: Project Setup (Day 1)

### 1.1 Initialize Project
```bash
bunx create-tauri-app spacescout --template react-ts --manager bun
cd spacescout

# Core dependencies
bun add effect @effect/schema
bun add @tanstack/react-router @tanstack/router-devtools
bun add @tanstack/react-query @tanstack/react-query-devtools
bun add d3 @types/d3

# Dev dependencies
bun add -d @biomejs/biome husky lint-staged @types/bun
bun add -d vitest @vitest/coverage-v8 @testing-library/react
bun add -d @playwright/test ast-grep
```

### 1.2 Complete Dev Environment Setup

#### TypeScript Config with all requirements
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
    "isolatedDeclarations": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "noEmit": true,
    "baseUrl": "./src",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", "build"]
}
```

### 1.3 Router Setup
```typescript
// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
});

// src/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { Home } from '@/pages/Home';

export const Route = createFileRoute('/')({
  component: Home,
});

// src/routes/scan.$path.tsx
import { createFileRoute } from '@tanstack/react-router';
import { ScanView } from '@/pages/ScanView';

export const Route = createFileRoute('/scan/$path')({
  component: ScanView,
});
```

### 1.4 Biome Configuration
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
      "suspicious": {
        "noExplicitAny": "error"
      }
    }
  }
}
```

### 1.5 AST-Grep Configuration
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
    exit(0);
  }
}

checkFileSizes();
```

### 1.7 Test Configuration
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

### 1.8 Pre-commit Hooks
```json
// package.json scripts
{
  "scripts": {
    "prepare": "husky install",
    "dev": "tauri dev",
    "build": "tauri build",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src",
    "lint:fix": "biome check --write src",
    "format": "biome format --write src",
    "test": "vitest run",
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

# Format
echo "✨ Running formatter..."
bun run format

# Run lint-staged
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

### 1.9 Update CLAUDE.md
```markdown
# CLAUDE.md updates
- ✅ No sensitive data in commits (enforced via .gitignore)
- ✅ All checks run on pre-commit and pre-push
- ✅ 80% code coverage enforced
- ✅ Formatter runs automatically
- ✅ No implicit any (TypeScript strict mode)
- ✅ isolatedDeclarations: true
- ✅ ast-grep bans 'as' typecasting
- ✅ Only .ts/.tsx files allowed
- ✅ File size limits enforced
- ✅ Generated code excluded from checks
```

## Phase 2: Core Data Models with Effect Schema (Day 1)

### 2.1 File System Schema
```typescript
// src/schemas/FileSystem.ts
import { Schema } from '@effect/schema';

export const FileNodeSchema = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  size: Schema.BigInt,
  isDir: Schema.Boolean,
  children: Schema.optional(Schema.Array(Schema.suspend(() => FileNodeSchema))),
});

export type FileNode = Schema.Schema.Type<typeof FileNodeSchema>;

export const ScanProgressSchema = Schema.Struct({
  current: Schema.String,
  processed: Schema.Number,
  total: Schema.optional(Schema.Number),
});

export type ScanProgress = Schema.Schema.Type<typeof ScanProgressSchema>;

export const DiskInfoSchema = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  total: Schema.BigInt,
  free: Schema.BigInt,
  mountPoint: Schema.String,
});

export type DiskInfo = Schema.Schema.Type<typeof DiskInfoSchema>;
```

## Phase 3: Rust Backend (Day 2)

### 3.1 Simple File Scanner
```rust
// src-tauri/src/scanner.rs
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}

pub fn scan_directory(path: &Path) -> Result<FileNode, String> {
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
    
    // For directories
    let mut children = Vec::new();
    let mut total_size = 0u64;
    
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(child) = scan_directory(&entry.path()) {
                total_size += child.size;
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

// src-tauri/src/main.rs
#[tauri::command]
async fn scan_path(path: String) -> Result<FileNode, String> {
    let path = Path::new(&path);
    scan_directory(path)
}

#[tauri::command]
fn get_home_directory() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Failed to get home directory".to_string())
}
```

## Phase 4: Effect Services (Day 2)

### 4.1 File System Service
```typescript
// src/services/FileSystemService.ts
import { Effect, Context, Layer } from 'effect';
import { Schema } from '@effect/schema';
import { invoke } from '@tauri-apps/api/core';
import { FileNodeSchema, type FileNode } from '@/schemas/FileSystem';

export class FileSystemError extends Schema.TaggedError<FileSystemError>()(
  'FileSystemError',
  {
    message: Schema.String,
  }
) {}

export interface FileSystemService {
  readonly scan: (path: string) => Effect.Effect<FileNode, FileSystemError>;
  readonly getHomeDirectory: () => Effect.Effect<string, FileSystemError>;
}

export const FileSystemService = Context.GenericTag<FileSystemService>(
  'FileSystemService'
);

export const FileSystemServiceLive = Layer.succeed(
  FileSystemService,
  {
    scan: (path: string) =>
      Effect.tryPromise({
        try: () => invoke<unknown>('scan_path', { path }),
        catch: (error) => new FileSystemError({ message: String(error) }),
      }).pipe(
        Effect.flatMap((data) =>
          Schema.decode(FileNodeSchema)(data).pipe(
            Effect.mapError((error) => 
              new FileSystemError({ message: error.message })
            )
          )
        )
      ),
    
    getHomeDirectory: () =>
      Effect.tryPromise({
        try: () => invoke<string>('get_home_directory'),
        catch: (error) => new FileSystemError({ message: String(error) }),
      }),
  }
);
```

## Phase 5: TanStack Query Integration (Day 3)

### 5.1 Query Hooks
```typescript
// src/hooks/useFileSystem.ts
import { useQuery, useMutation } from '@tanstack/react-query';
import { Effect } from 'effect';
import { FileSystemService, FileSystemServiceLive } from '@/services/FileSystemService';
import { FileNode } from '@/schemas/FileSystem';

export function useScanDirectory(path: string | null) {
  return useQuery({
    queryKey: ['scan', path],
    queryFn: async () => {
      if (!path) throw new Error('No path provided');
      
      const program = FileSystemService.pipe(
        Effect.flatMap((service) => service.scan(path)),
        Effect.provide(FileSystemServiceLive)
      );
      
      return Effect.runPromise(program);
    },
    enabled: !!path,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useHomeDirectory() {
  return useQuery({
    queryKey: ['home-directory'],
    queryFn: async () => {
      const program = FileSystemService.pipe(
        Effect.flatMap((service) => service.getHomeDirectory()),
        Effect.provide(FileSystemServiceLive)
      );
      
      return Effect.runPromise(program);
    },
  });
}
```

## Phase 6: Simple D3 Treemap (Day 3)

### 6.1 Treemap Component
```typescript
// src/components/Treemap.tsx
import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { FileNode } from '@/schemas/FileSystem';
import { formatBytes } from '@/utils/format';

interface TreemapProps {
  data: FileNode;
  width: number;
  height: number;
  onNodeClick?: (node: FileNode) => void;
}

export const Treemap: React.FC<TreemapProps> = ({
  data,
  width,
  height,
  onNodeClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Create hierarchy
    const hierarchy = d3.hierarchy(data)
      .sum((d) => Number(d.size))
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    // Create treemap
    const treemap = d3.treemap<FileNode>()
      .size([width, height])
      .padding(2);

    const root = treemap(hierarchy);

    // Color scale
    const color = d3.scaleOrdinal(d3.schemeCategory10);

    // Create nodes
    const node = svg.selectAll('g')
      .data(root.leaves())
      .join('g')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`);

    // Add rectangles
    node.append('rect')
      .attr('width', (d) => d.x1 - d.x0)
      .attr('height', (d) => d.y1 - d.y0)
      .attr('fill', (d) => color(d.parent?.data.name || ''))
      .attr('stroke', '#fff')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        if (onNodeClick && d.data.isDir) {
          onNodeClick(d.data);
        }
      });

    // Add labels
    node.append('text')
      .attr('x', 4)
      .attr('y', 16)
      .text((d) => d.data.name)
      .attr('font-size', '12px')
      .attr('fill', 'white')
      .style('user-select', 'none');

    // Add tooltips
    node.append('title')
      .text((d) => `${d.data.name}\n${formatBytes(Number(d.data.size))}`);

  }, [data, width, height, onNodeClick]);

  return <svg ref={svgRef} width={width} height={height} />;
};
```

## Phase 7: Main App Setup (Day 4)

### 7.1 App Provider Setup
```typescript
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routeTree } from './routeTree.gen';

const queryClient = new QueryClient();
const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
```

### 7.2 Home Page
```typescript
// src/pages/Home.tsx
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
```

### 7.3 Scan View Page
```typescript
// src/pages/ScanView.tsx
import React, { useState } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useScanDirectory } from '@/hooks/useFileSystem';
import { Treemap } from '@/components/Treemap';
import { FileNode } from '@/schemas/FileSystem';

export const ScanView: React.FC = () => {
  const { path } = useParams({ from: '/scan/$path' });
  const navigate = useNavigate();
  const decodedPath = decodeURIComponent(path);
  
  const { data, isLoading, error } = useScanDirectory(decodedPath);
  const [currentNode, setCurrentNode] = useState<FileNode | null>(null);

  const handleNodeClick = (node: FileNode) => {
    if (node.isDir && node.children) {
      setCurrentNode(node);
    }
  };

  const handleBack = () => {
    if (currentNode) {
      setCurrentNode(null);
    } else {
      navigate({ to: '/' });
    }
  };

  if (isLoading) {
    return <div className="loading">Scanning {decodedPath}...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>Error: {error.message}</p>
        <button onClick={() => navigate({ to: '/' })}>Go Back</button>
      </div>
    );
  }

  const displayData = currentNode || data;

  return (
    <div className="scan-view">
      <header>
        <button onClick={handleBack}>← Back</button>
        <h2>{displayData?.name || decodedPath}</h2>
      </header>
      
      {displayData && (
        <div className="treemap-container">
          <Treemap
            data={displayData}
            width={window.innerWidth}
            height={window.innerHeight - 60}
            onNodeClick={handleNodeClick}
          />
        </div>
      )}
    </div>
  );
};
```

## Phase 8: Basic Styling (Day 4)

```css
/* src/styles/app.css */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #1a1a1a;
  color: #fff;
}

.home {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  padding: 20px;
}

.scan-options {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 40px;
}

button {
  padding: 12px 24px;
  background: #0066cc;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.2s;
}

button:hover {
  background: #0052a3;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading, .error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  flex-direction: column;
  gap: 20px;
}

.scan-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.scan-view header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 20px;
  background: #2a2a2a;
  border-bottom: 1px solid #444;
}

.treemap-container {
  flex: 1;
  overflow: hidden;
}
```

## MVP Checklist

### Week 1: Foundation
- [ ] Project setup with all dependencies
- [ ] Basic routing with TanStack Router
- [ ] Effect schemas for data models
- [ ] Rust scanner implementation
- [ ] Basic Tauri commands

### Week 2: Core Features
- [ ] Effect service layer
- [ ] TanStack Query integration
- [ ] D3 treemap component
- [ ] Basic navigation
- [ ] Error handling

### Week 3: Polish & Testing
- [ ] Add loading states
- [ ] Improve error messages
- [ ] Basic styling
- [ ] Manual testing
- [ ] Build and package

## Next Steps After MVP
1. Add file permissions handling
2. Implement breadcrumb navigation
3. Add file details sidebar
4. Performance optimization for large directories
5. Dark/light theme support
6. Proper test suite

## Key Decisions for MVP
- **No complex permissions UI** - Just try to scan, show error if fails
- **No file operations** - View only
- **Simple navigation** - Click to drill down, back button to go up
- **No caching** - Fresh scan each time
- **Basic styling** - Focus on functionality

This plan focuses on getting a working app quickly while using Effect and TanStack tools effectively.