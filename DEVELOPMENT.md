# SpaceScout Development

This guide covers the development setup, architecture, and contribution guidelines for SpaceScout.

## Prerequisites

- **Rust**: 1.70 or later - [Install Rust](https://www.rust-lang.org/tools/install)
- **Bun**: 1.0 or later - [Install Bun](https://bun.sh/docs/installation)
- **Node.js**: 18+ (for compatibility with some tools)
- **Xcode Command Line Tools**: Required for macOS development

### Optional but Recommended

- **dust**: For faster disk scanning during development
  ```bash
  brew install dust
  ```

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/spacescout.git
   cd spacescout
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Run in development mode:
   ```bash
   bun run dev
   ```

This starts both the Vite dev server (frontend) and Tauri (backend) with hot-reloading enabled.

## Project Structure

```
spacescout/
├── src/                    # React frontend
│   ├── components/        # React components
│   ├── hooks/            # Custom React hooks
│   ├── pages/            # Page components
│   ├── services/         # Service layer (Effect-based)
│   ├── schemas/          # TypeScript schemas
│   └── styles/           # CSS styles
├── src-tauri/            # Rust backend
│   ├── src/
│   │   ├── main.rs      # Tauri entry point
│   │   ├── lib.rs       # Main library
│   │   └── scanner.rs   # Directory scanning logic
│   └── Cargo.toml       # Rust dependencies
├── scripts/              # Build and utility scripts
└── docs/                 # Documentation
```

## Architecture

### Frontend (React + TypeScript)

- **Framework**: React 18 with TypeScript
- **State Management**: TanStack Query for server state
- **Routing**: TanStack Router for type-safe routing
- **Effects**: Effect library for functional error handling
- **Visualization**: D3.js for treemap rendering
- **Styling**: Plain CSS with CSS modules support

### Backend (Rust + Tauri)

- **Framework**: Tauri v2 for native desktop integration
- **Scanning**: 
  - Primary: `dust` command-line tool (when available)
  - Fallback: Native `du` command with optimizations
- **Parallelization**: Rayon for parallel processing
- **IPC**: Tauri commands and events for frontend communication

## Key Features Implementation

### Directory Scanning

The scanner (`src-tauri/src/scanner.rs`) implements a multi-strategy approach:

1. **Smart Detection**: Automatically uses `dust` if available for fastest performance
2. **Fallback Strategy**: Uses optimized `du` commands when `dust` is not available
3. **Progressive Loading**: Emits progress events during scanning
4. **Smart Filtering**: Filters out small files when dealing with large directories

### Treemap Visualization

The treemap component (`src/components/Treemap.tsx`) features:

- D3.js-based rectangular treemap layout
- Color coding by file type and directory depth
- Interactive navigation (click to drill down)
- Size labels on larger blocks
- Responsive sizing

## Development Workflow

### Code Quality

The project uses several tools to maintain code quality:

- **TypeScript**: Strict mode enabled
- **Biome**: For linting and formatting
- **Rust fmt**: For Rust code formatting
- **Pre-commit hooks**: Automated checks before commits

### Available Scripts

- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run preview` - Preview production build
- `bun run typecheck` - Run TypeScript type checking
- `bun run lint` - Run linting
- `bun run format` - Format code
- `bun run test` - Run tests
- `bun run check:ast` - Check for banned patterns
- `bun run check:sizes` - Check file sizes

### Testing

- Unit tests: Vitest for frontend components
- Integration tests: Playwright for E2E testing
- Coverage reports: Generated with Vitest

## Performance Considerations

1. **File Limits**: Automatically limits to top 100-200 files when scanning large directories
2. **Size Threshold**: Filters files smaller than 1MB in large directories
3. **Parallel Processing**: Uses Rayon for parallel directory traversal
4. **Streaming Updates**: Progress updates are throttled to prevent UI lockup

## Building for Production

### macOS

```bash
bun run build
```

This creates a universal macOS app bundle in `src-tauri/target/release/bundle/macos/`.

### Code Signing (macOS)

For distribution, you'll need to sign the app:

1. Set up your Apple Developer certificate
2. Configure signing in `tauri.conf.json`
3. Build with signing enabled

## Debugging

### Frontend Debugging

- Use Chrome DevTools (right-click and "Inspect")
- React Developer Tools extension works normally
- Console logs appear in the DevTools console

### Backend Debugging

- Rust logs appear in the terminal where you ran `bun run dev`
- Use `println!` for debugging output
- Set `RUST_LOG=debug` for verbose logging

## Contributing

### Before Submitting

1. Run all checks:
   ```bash
   bun run typecheck
   bun run lint
   bun run test
   ```

2. Ensure your code follows the project style
3. Add tests for new features
4. Update documentation as needed

### Commit Messages

Follow conventional commit format:
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation
- `refactor:` for code refactoring
- `test:` for tests
- `chore:` for maintenance tasks

### File Size Guidelines

To maintain good performance with AI assistants:
- Keep files under 500 lines
- Rust files should stay under 300 lines when possible
- Split large components into smaller ones

## Troubleshooting

### Common Issues

1. **Build fails with "cargo not found"**
   - Ensure Rust is installed and in PATH
   - Run `rustup update`

2. **dust command not working**
   - Install with `brew install dust`
   - The app will automatically fall back to `du` if dust is not available

3. **App not updating in development**
   - Check that both Vite and Tauri processes are running
   - Try restarting with `bun run dev`

### Performance Issues

If scanning is slow:
1. Install `dust` for 10x faster scanning
2. Check console for error messages
3. Large directories (>100GB) may take longer on first scan

## Resources

- [Tauri Documentation](https://tauri.app)
- [React Documentation](https://react.dev)
- [Effect Documentation](https://effect.website)
- [D3.js Documentation](https://d3js.org)
