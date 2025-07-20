import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { listen } from '@tauri-apps/api/event';
import type { ScanProgress } from '@/schemas/FileSystem';

interface ScanProgressVisualizationProps {
  onCancel: () => void;
}

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  value: number;
}

export const ScanProgressVisualization: React.FC<ScanProgressVisualizationProps> = ({ onCancel }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [itemsProcessed, setItemsProcessed] = useState(0);
  const treeDataRef = useRef<TreeNode>({ name: 'root', path: '/', children: [], value: 1 });
  const nodesMapRef = useRef<Map<string, TreeNode>>(new Map());

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 800;
    const height = 600;
    const radius = Math.min(width, height) / 2 - 40;

    // Clear and setup SVG
    const svg = d3.select(svgRef.current)
      .attr('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`);
    
    svg.selectAll('*').remove();

    // Create main group
    const g = svg.append('g');

    // Create partition layout
    const partition = d3.partition<TreeNode>()
      .size([2 * Math.PI, radius]);

    // Create arc generator
    const arc = d3.arc<d3.HierarchyRectangularNode<TreeNode>>()
      .startAngle(d => d.x0)
      .endAngle(d => d.x1)
      .innerRadius(d => d.y0)
      .outerRadius(d => d.y1);

    // Color scale
    const color = d3.scaleOrdinal(d3.schemeTableau10);

    // Initialize with root
    nodesMapRef.current.set('/', treeDataRef.current);

    // Initial render
    function update() {
      const root = d3.hierarchy(treeDataRef.current)
        .sum(d => d.value)
        .sort((a, b) => (b.value || 0) - (a.value || 0));

      const nodes = partition(root).descendants();

      // Bind data to paths
      const path = g.selectAll<SVGPathElement, d3.HierarchyRectangularNode<TreeNode>>('path')
        .data(nodes, d => d.data.path);

      // Enter new paths
      path.enter()
        .append('path')
        .attr('d', arc)
        .style('fill', d => {
          if (d.depth === 0) return '#2a2a2a';
          return color((d.children ? d : d.parent)?.data.name || '');
        })
        .style('opacity', 0)
        .transition()
        .duration(300)
        .style('opacity', 0.8);

      // Update existing paths
      path.transition()
        .duration(300)
        .attr('d', arc);

      // Add subtle animation to newest additions
      path.enter()
        .append('path')
        .attr('d', arc)
        .style('fill', d => {
          if (d.depth === 0) return '#2a2a2a';
          return color((d.children ? d : d.parent)?.data.name || '');
        })
        .style('stroke', '#fff')
        .style('stroke-width', 1)
        .style('opacity', 0)
        .transition()
        .duration(300)
        .style('opacity', 0.8)
        .transition()
        .duration(500)
        .style('stroke-width', 0.5);
    }

    // Listen for scan progress
    const unlisten = listen<ScanProgress>('scan-progress', (event) => {
      const { current_path, items_processed } = event.payload;
      setItemsProcessed(items_processed);

      // Parse the path and build tree structure
      const parts = current_path.split('/').filter(Boolean);
      let currentNode = treeDataRef.current;

      // Build path hierarchy
      let fullPath = '';
      for (const part of parts) {
        fullPath += '/' + part;
        
        // Check if this path already exists
        if (!nodesMapRef.current.has(fullPath)) {
          // Create new node
          const newNode: TreeNode = {
            name: part,
            path: fullPath,
            children: [],
            value: 1
          };
          
          currentNode.children.push(newNode);
          nodesMapRef.current.set(fullPath, newNode);
          
          // Update visualization with throttling
          if (items_processed % 10 === 0) {
            update();
          }
        }
        
        currentNode = nodesMapRef.current.get(fullPath)!;
      }
    });

    // Initial render
    update();

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  return (
    <div className="scan-progress-viz">
      <div className="scan-header">
        <h2>Scanning File System</h2>
        <p className="items-count">{itemsProcessed.toLocaleString()} items scanned</p>
      </div>
      
      <div className="viz-container">
        <svg ref={svgRef} width="800" height="600" />
      </div>
      
      <div className="scan-actions">
        <button onClick={onCancel} className="cancel-button">
          Cancel Scan
        </button>
      </div>
    </div>
  );
};