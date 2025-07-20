# SpaceScout

A fast and intuitive disk space analyzer for macOS, built with Tauri and React.

## Overview

SpaceScout helps you visualize and understand disk usage on your computer through an interactive treemap visualization. It quickly scans directories and presents file and folder sizes as proportionally-sized, colored rectangles, making it easy to identify what's consuming your storage space.

## Features

- **Fast Scanning**: Uses the blazing-fast `dust` analyzer when available, with automatic fallback to system utilities
- **Interactive Treemap**: Visual representation of disk usage with proportional sizing
- **Smart Aggregation**: Automatically filters out small files to focus on significant space consumers
- **Real-time Progress**: Shows scanning progress with live updates
- **Color-coded Files**: Different colors for directories, images, videos, documents, and other file types
- **Drill-down Navigation**: Click on directories to explore their contents
- **Full-screen Visualization**: Maximizes screen space for better visibility

## Installation

### Prerequisites

- macOS 10.15 or later
- For best performance, install `dust`:
  ```bash
  brew install dust
  ```

### Download

Download the latest release from the [Releases](https://github.com/yourusername/spacescout/releases) page.

## Usage

1. **Launch SpaceScout** by double-clicking the app icon
2. **Choose a scan location**:
   - Click "Scan Home Directory" for a quick analysis of your user folder
   - Enter a custom path to scan a specific location
3. **Wait for the scan** to complete (typically takes seconds with dust installed)
4. **Explore the treemap**:
   - Larger rectangles represent larger files or folders
   - Click on directories (blue rectangles) to view their contents
   - File sizes are displayed on larger blocks
   - Click "Back" to return to the parent directory

## Performance

SpaceScout is optimized for speed:
- With `dust` installed: Scans hundreds of gigabytes in seconds
- Without `dust`: Falls back to native macOS utilities (slightly slower but still fast)
- Smart filtering shows only significant files when dealing with many items

## Privacy

SpaceScout runs entirely on your local machine. No data is sent to external servers. The app only reads file metadata (names and sizes) and does not access file contents.

## Building from Source

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed build instructions.

## License

[License information to be added]

## Contributing

Contributions are welcome! Please read [DEVELOPMENT.md](DEVELOPMENT.md) for development setup and guidelines.
