import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { listen } from '@tauri-apps/api/event';
import type { ScanProgress } from '@/schemas/FileSystem';

interface ScanProgressTreemapProps {
  onCancel: () => void;
}

interface TreemapNode {
  name: string;
  path: string;
  value: number;
  children?: TreemapNode[];
}

export const ScanProgressTreemap: React.FC<ScanProgressTreemapProps> = ({ onCancel }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [stats, setStats] = useState({ items: 0, currentPath: '' });
  const rootRef = useRef<TreemapNode>({ name: 'root', path: '/', value: 1, children: [] });
  const nodesMapRef = useRef<Map<string, TreemapNode>>(new Map());
  const updatePendingRef = useRef(false);
  const lastUpdateRef = useRef(0);

  // Get responsive dimensions
  const getDimensions = useCallback(() => {
    if (!containerRef.current) return { width: 800, height: 600 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      width: rect.width || 800,
      height: rect.height || 600
    };
  }, []);

  // Update visualization with aggressive batching
  const updateVisualization = useCallback(() => {
    if (!svgRef.current || updatePendingRef.current) return;
    
    const now = Date.now();
    if (now - lastUpdateRef.current < 500) return; // Update only every 500ms
    
    updatePendingRef.current = true;
    lastUpdateRef.current = now;

    requestAnimationFrame(() => {
      if (!svgRef.current) {
        updatePendingRef.current = false;
        return;
      }

      const { width, height } = getDimensions();
      const svg = d3.select(svgRef.current);

      // Create hierarchy
      const hierarchy = d3.hierarchy(rootRef.current)
        .sum(d => d.value || 1)
        .sort((a, b) => (b.value || 0) - (a.value || 0));

      // Create treemap layout
      const treemap = d3.treemap<TreemapNode>()
        .size([width, height])
        .padding(1)
        .round(true);

      const root = treemap(hierarchy);

      // Color scale based on depth
      const color = d3.scaleSequential()
        .domain([0, 3])
        .interpolator(d3.interpolateCool);

      // Limit number of cells to render
      const MAX_CELLS = 500;
      const leaves = root.leaves().slice(0, MAX_CELLS);

      // Bind data
      const cell = svg.selectAll<SVGGElement, d3.HierarchyRectangularNode<TreemapNode>>('.cell')
        .data(leaves, d => d.data.path);

      // Exit old cells without animation for performance
      cell.exit().remove();

      // Enter new cells
      const cellEnter = cell.enter()
        .append('g')
        .attr('class', 'cell')
        .attr('transform', d => `translate(${d.x0},${d.y0})`);

      cellEnter.append('rect')
        .attr('width', d => d.x1 - d.x0)
        .attr('height', d => d.y1 - d.y0)
        .style('fill', d => {
          const depth = d.ancestors().length - 1;
          return color(depth);
        })
        .style('opacity', 0.8);

      // Add text labels for cells that are large enough
      cellEnter.each(function(d) {
        const nodeWidth = d.x1 - d.x0;
        const nodeHeight = d.y1 - d.y0;
        
        if (nodeWidth > 40 && nodeHeight > 20) {
          const group = d3.select(this);
          const text = group.append('text')
            .attr('x', 4)
            .attr('y', 16)
            .attr('font-size', '11px')
            .attr('fill', 'white')
            .style('user-select', 'none')
            .style('pointer-events', 'none');
          
          // Truncate text to fit
          let displayName = d.data.name;
          const maxChars = Math.floor((nodeWidth - 8) / 6);
          if (displayName.length > maxChars && maxChars > 3) {
            displayName = displayName.substring(0, maxChars - 3) + '...';
          }
          
          text.text(displayName);
        }
      });

      // Update existing cells without animation for performance
      cell.attr('transform', d => `translate(${d.x0},${d.y0})`)
        .select('rect')
        .attr('width', d => d.x1 - d.x0)
        .attr('height', d => d.y1 - d.y0);

      updatePendingRef.current = false;
    });
  }, [getDimensions]);

  // Process incoming paths
  const processPath = useCallback((path: string) => {
    const parts = path.split('/').filter(Boolean);
    const MAX_UI_DEPTH = 4; // Limit depth for UI performance
    let current = rootRef.current;
    let fullPath = '';

    for (let i = 0; i < Math.min(parts.length, MAX_UI_DEPTH); i++) {
      const part = parts[i];
      fullPath += '/' + part;
      
      if (!nodesMapRef.current.has(fullPath)) {
        const newNode: TreemapNode = {
          name: part,
          path: fullPath,
          value: 1,
          children: []
        };
        
        if (!current.children) current.children = [];
        current.children.push(newNode);
        nodesMapRef.current.set(fullPath, newNode);
      } else {
        // Increment value for existing node
        const node = nodesMapRef.current.get(fullPath)!;
        node.value = (node.value || 1) + 0.1;
      }
      
      current = nodesMapRef.current.get(fullPath)!;
    }

    // Update root value
    rootRef.current.value = rootRef.current.children?.reduce((sum, child) => sum + (child.value || 0), 0) || 1;
  }, []);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const { width, height } = getDimensions();
    
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);
    
    svg.selectAll('*').remove();

    // Initialize
    nodesMapRef.current.set('/', rootRef.current);
    
    // Setup event listener
    let unlistenFn: (() => void) | null = null;
    
    const setupListener = async () => {
      try {
        unlistenFn = await listen<ScanProgress>('scan-progress', (event) => {
          const { current_path, items_processed } = event.payload;
          
          setStats({ 
            items: items_processed, 
            currentPath: current_path.split('/').pop() || 'root'
          });

          processPath(current_path);
          
          // Update visualization less frequently to prevent lockup
          if (items_processed % 100 === 0 || Date.now() - lastUpdateRef.current > 1000) {
            updateVisualization();
          }
        });
      } catch (error) {
        console.error('Failed to setup event listener:', error);
      }
    };
    
    setupListener();

    // Handle window resize
    const handleResize = () => {
      updateVisualization();
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [getDimensions, processPath, updateVisualization]);

  return (
    <div className="scan-progress-treemap">
      <div className="scan-header">
        <h2>Scanning Your Disk...</h2>
        <div className="scan-stats">
          {stats.items > 0 ? (
            <>
              <p className="items-count">{stats.items.toLocaleString()} items found</p>
              <p className="current-file">{stats.currentPath}</p>
            </>
          ) : (
            <>
              <p className="items-count">Starting scan...</p>
              <div className="loading-spinner">⟳</div>
            </>
          )}
        </div>
      </div>
      
      <div ref={containerRef} className="treemap-scan-container">
        <svg ref={svgRef} />
        {stats.items === 0 && (
          <div className="scan-message">
            <p>Analyzing directory structure...</p>
            <p className="scan-tip">This may take a moment for large directories</p>
          </div>
        )}
      </div>
      
      <button onClick={onCancel} className="cancel-button">
        Cancel Scan
      </button>
    </div>
  );
};