# SpaceScout Technical Plan

## Project Overview

SpaceScout is a disk space analyzer for macOS that provides visual representation of storage usage through interactive treemap visualization. Built with Tauri, React, and TypeScript, it offers a native macOS experience with web technologies.

## Technology Stack

### Core Technologies
- **Backend**: Tauri (Rust)
- **Frontend**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Package Manager**: Bun
- **State Management**: Effect & Effect Schema
- **Visualization**: D3.js (d3-hierarchy, d3-treemap, d3-transition)
- **Internationalization**: i18next
- **Testing**: Bun test
- **Code Quality**: Biome (linting/formatting)
- **Target Platform**: macOS 15.5+ (24F74)

### Development Configuration
- TypeScript with `isolatedDeclarations` enabled
- Pre-commit hooks enforcing:
  - Zero TypeScript errors
  - Zero linting errors (Biome)
- Enforced code coverage thresholds

## Architecture Overview

### Component Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (React)                   │
├─────────────────────────────────────────────────────┤
│                  State Layer (Effect)                │
├─────────────────────────────────────────────────────┤
│                   IPC Bridge                         │
├─────────────────────────────────────────────────────┤
│                Backend (Tauri/Rust)                  │
├─────────────────────────────────────────────────────┤
│              File System Operations                  │
└─────────────────────────────────────────────────────┘
```

### Key Components

1. **File System Scanner (Rust)**
   - Recursive directory traversal
   - File size calculation
   - Permission handling
   - Progress reporting

2. **Treemap Visualization (React + D3)**
   - D3 treemap with squarified algorithm
   - Interactive navigation with d3-transition
   - Smooth zoom transitions
   - Animated tooltips and hover effects
   - Click-to-zoom navigation
   - File details sidebar

3. **IPC Communication**
   - Command pattern for operations
   - Event system for progress updates
   - Error handling and recovery

## MVP Features

### Phase 1: Core Functionality
1. **Disk Selection & Permissions**
   - List available disks/volumes
   - Request file system permissions via macOS APIs
   - Handle permission denials gracefully
   - Show permission status in UI

2. **Scan Functionality**
   - Scan selected disk or directory
   - Display file/folder sizes
   - Show nested directory structure
   - Progress indication during scan

3. **Visual Representation**
   - D3 treemap with proportional sizing
   - Color coding by file type/extension
   - Hover tooltips with file info
   - Dark/light mode (system preference)

4. **Navigation & Interaction**
   - Click to zoom into directories
   - Breadcrumb navigation
   - Back/forward navigation
   - File details sidebar on click

### Future Phases
- File operations (delete, move)
- Advanced filtering
- Export functionality
- Performance optimizations

## Project Structure

```
spacescout/
├── src-tauri/          # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/   # Tauri commands
│   │   ├── scanner/    # File system scanning
│   │   └── utils/
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                # React frontend
│   ├── components/
│   │   ├── Treemap/
│   │   ├── Sidebar/
│   │   └── Toolbar/
│   ├── services/       # Effect services
│   ├── hooks/
│   ├── types/
│   ├── i18n/
│   └── main.tsx
├── tests/
│   ├── unit/
│   └── e2e/
├── docs/
├── package.json
├── bunfig.toml
├── biome.json
├── tsconfig.json
├── vite.config.ts
└── .husky/
```

## Data Flow

### Scanning Process
1. User initiates scan (button click)
2. Frontend sends IPC command to backend
3. Rust backend traverses file system
4. Progress updates sent via events
5. Final tree structure returned
6. Frontend processes and displays treemap

### Data Models

```typescript
// File System Node
interface FSNode {
  name: string;
  path: string;
  size: number;
  type: 'file' | 'directory';
  children?: FSNode[];
  lastModified: Date;
  permissions?: string;
}

// Scan Progress
interface ScanProgress {
  current: string;
  totalScanned: number;
  estimatedTotal?: number;
}

// Treemap Node
interface TreemapNode extends FSNode {
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  color: string;
}
```

## Development Setup

### Prerequisites
1. Rust toolchain (latest stable)
2. Bun runtime
3. Xcode Command Line Tools
4. macOS 15.5+

### Initial Setup Script
```bash
# Install dependencies
bun install

# Setup pre-commit hooks
bun run prepare

# Generate Rust bindings
bun run tauri build
```

## Testing Strategy

### Unit Tests
- **Frontend**: Component testing with React Testing Library
- **Backend**: Rust unit tests for scanner logic
- **Coverage Target**: 80% minimum

### Integration Tests
- IPC command testing
- File system operation mocking
- Error scenario handling

### E2E Tests
- Full application workflow
- Performance benchmarks
- Memory usage monitoring

## Performance Considerations

### Optimization Targets
- Scan 1TB disk in < 30 seconds
- Smooth 60fps treemap rendering
- < 200MB memory footprint
- Instant navigation response

### Strategies
1. **Rust Backend**
   - Parallel directory scanning
   - Efficient memory allocation
   - Progress throttling

2. **React Frontend**
   - Virtual rendering for large datasets
   - Memoization of calculations
   - Debounced interactions
   - D3 transitions for smooth animations
   - RequestAnimationFrame optimization
   - Reduced motion support for accessibility

## Security Considerations

### Permissions
- Request minimum file system permissions
- Handle permission denials gracefully
- No network access required

### Data Handling
- No data leaves the device
- No persistent storage of scan results
- Clear memory on application exit

## Deployment

### Build Process
1. Code signing with Apple Developer certificate
2. Notarization for Gatekeeper
3. DMG creation with background image
4. Auto-update capability (future)

### Distribution
- Direct download from website
- GitHub releases
- Homebrew cask (future)

## Development Workflow

### Branch Strategy
- `main`: Stable releases
- `develop`: Integration branch
- `feature/*`: New features
- `fix/*`: Bug fixes

### Release Process
1. Version bump in package.json
2. Update CHANGELOG.md
3. Create release tag
4. Build and sign application
5. Upload to distribution channels

## Monitoring & Analytics

### Error Tracking
- Sentry integration for crash reports
- Local error logging
- User-friendly error messages

### Usage Analytics (Privacy-Focused)
- Opt-in anonymous usage statistics
- Local analytics only
- No personal data collection

## Timeline

### Week 1-2: Foundation
- Project setup
- Basic Tauri integration
- File system scanning

### Week 3-4: Visualization
- Treemap implementation
- Basic UI components
- Navigation functionality

### Week 5-6: Polish
- Performance optimization
- Error handling
- Testing suite

### Week 7-8: Release
- Build pipeline
- Documentation
- Distribution setup

## Success Metrics

### Technical Metrics
- < 2s startup time
- < 100ms UI response time
- Zero crashes in production

### User Metrics
- Intuitive first-use experience
- Clear space usage insights
- Actionable recommendations

## Next Steps

1. Initialize project with Tauri CLI
2. Set up development environment
3. Implement basic file scanning
4. Create minimal treemap visualization
5. Iterate based on performance testing