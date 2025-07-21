import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import type { FileNode } from '@/schemas/FileSystem';
import { formatBytes } from '@/utils/format';
import { ContextMenu } from './ContextMenu';

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
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: FileNode;
  } | null>(null);
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  
  console.log('[Treemap] Component props:', { 
    hasData: !!data, 
    width, 
    height,
    dataName: data?.name,
    dataSize: data?.size
  });

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && selectedNode && selectedNode.isDir && onNodeClick) {
        onNodeClick(selectedNode);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, onNodeClick]);

  useEffect(() => {
    if (!svgRef.current || !data) return;

    console.log('[Treemap] Rendering with data:', {
      name: data.name,
      size: data.size,
      childrenCount: data.children?.length || 0,
      hasChildren: !!data.children
    });

    const svg = d3.select(svgRef.current);
    
    // Use D3 data binding for smooth updates
    const t = d3.transition().duration(750);

    // Create hierarchy
    const hierarchy = d3.hierarchy<FileNode>(data)
      .sum((d) => {
        // For directories with children, the size is already aggregated
        // For files or empty directories, use the size directly
        return d.children && d.children.length > 0 ? 0 : (d.size || 0);
      })
      .sort((a, b) => (b.value || 0) - (a.value || 0));
    
    // If hierarchy has no value, something is wrong with the data
    if (hierarchy.value === 0) {
      console.warn('[Treemap] Hierarchy has no value, using size directly');
      hierarchy.sum((d) => d.size || 0);
    }

    console.log('[Treemap] Hierarchy created:', {
      value: hierarchy.value,
      height: hierarchy.height,
      leaves: hierarchy.leaves().length
    });

    // Create treemap with more padding for nested view
    const treemap = d3.treemap<FileNode>()
      .size([width, height])
      .padding(2)
      .paddingInner(3)
      .paddingTop(20) // Extra space at top for parent labels
      .round(true)
      .tile(d3.treemapSquarify.ratio(1));

    const root = treemap(hierarchy);
    
    // Get nodes to render - first level (children) and second level (grandchildren)
    const firstLevelNodes = root.children || [];
    const nodesToRender: d3.HierarchyRectangularNode<FileNode>[] = [];
    
    // Add first level nodes
    firstLevelNodes.forEach(node => {
      nodesToRender.push(node);
      // Add second level nodes (grandchildren) if they exist and parent is a directory
      if (node.children && node.data.isDir) {
        node.children.forEach(child => {
          nodesToRender.push(child);
        });
      }
    });
    
    // Sort by depth so parents are drawn first (behind children)
    nodesToRender.sort((a, b) => a.depth - b.depth);
    
    console.log('[Treemap] Rendering nodes:', nodesToRender.length, 'nodes across 2 levels');

    // Color scale based on file types and directories - returns gradient URL
    const getColor = (node: d3.HierarchyRectangularNode<FileNode>) => {
      const name = node.data.name.toLowerCase();
      const isDir = node.data.isDir;
      const depth = node.depth;
      
      // Files are white
      if (!isDir) {
        return '#ffffff';
      }
      
      // Create a hash-based color for consistent coloring by name
      const nameHash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      
      // Use different color ranges based on depth
      // First level gets brighter colors (0-9), second level gets slightly muted colors (10-15)
      const colorOffset = depth === 1 ? 0 : 10;
      const colorIndex = (nameHash % 6) + colorOffset;
      
      return `url(#gradient-${colorIndex})`;
    };

    // Clear previous content
    svg.selectAll('*').remove();
    
    // Add background click to deselect
    svg.on('click', () => {
      setSelectedNode(null);
    });
    
    // Create gradient definitions
    const defs = svg.append('defs');
    
    // Create gradients for each color - using a more sophisticated palette
    const gradientColors = [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
      '#14b8a6', '#a855f7', '#22c55e', '#0ea5e9', '#f43f5e', '#64748b'
    ];
    
    gradientColors.forEach((color, i) => {
      const gradient = defs.append('linearGradient')
        .attr('id', `gradient-${i}`)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '100%');
        
      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', color)
        .attr('stop-opacity', 1);
        
      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', d3.color(color)?.darker(0.3)?.toString() || color)
        .attr('stop-opacity', 1);
    });
    
    // Create groups for each node to allow complex shapes
    const nodeGroups = svg.selectAll<SVGGElement, d3.HierarchyRectangularNode<FileNode>>('g.node')
      .data(nodesToRender)
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.preventDefault();
        event.stopPropagation();
        // Single left-click selects the node
        if (event.button === 0) {
          setSelectedNode(d.data);
        }
      })
      .on('dblclick', (event, d) => {
        event.preventDefault();
        // Double-click navigates into directories
        if (onNodeClick && d.data.isDir) {
          onNodeClick(d.data);
        }
      })
      .on('contextmenu', (event, d) => {
        event.preventDefault();
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          node: d.data
        });
      });
    
    // Add rectangles or file shapes
    nodeGroups.each(function(d) {
      const group = d3.select(this);
      const width = d.x1 - d.x0;
      const height = d.y1 - d.y0;
      const isFile = !d.data.isDir;
      const cornerSize = Math.min(width * 0.2, height * 0.2, 20); // Larger peeling corner size
      
      if (isFile && width > 20 && height > 20) {
        // Create file shape with rounded peeling corner
        const cornerRadius = cornerSize * 0.3; // Radius for the curve
        
        // Main file shape with curved corner cutout
        const path = `
          M ${d.x0} ${d.y0}
          L ${d.x1 - cornerSize} ${d.y0}
          Q ${d.x1 - cornerSize + cornerRadius} ${d.y0} ${d.x1 - cornerSize + cornerRadius} ${d.y0 + cornerRadius}
          L ${d.x1 - cornerRadius} ${d.y0 + cornerSize - cornerRadius}
          Q ${d.x1} ${d.y0 + cornerSize - cornerRadius} ${d.x1} ${d.y0 + cornerSize}
          L ${d.x1} ${d.y1}
          L ${d.x0} ${d.y1}
          Z
        `;
        
        // Main file shape
        group.append('path')
          .attr('d', path)
          .attr('fill', getColor(d))
          .attr('stroke', selectedNode?.path === d.data.path ? '#4a9eff' : '#000000')
          .attr('stroke-width', selectedNode?.path === d.data.path ? 2 : 1)
          .style('shape-rendering', 'crispEdges');
        
        // Peeling corner with curve and gradient
        const cornerGroup = group.append('g');
        
        // Corner shadow (darker part under the curl)
        cornerGroup.append('path')
          .attr('d', `
            M ${d.x1 - cornerSize} ${d.y0}
            Q ${d.x1 - cornerSize + cornerRadius} ${d.y0} ${d.x1 - cornerSize + cornerRadius} ${d.y0 + cornerRadius}
            L ${d.x1 - cornerRadius} ${d.y0 + cornerSize - cornerRadius}
            Q ${d.x1 - cornerRadius} ${d.y0 + cornerSize} ${d.x1 - cornerRadius * 0.5} ${d.y0 + cornerSize}
            L ${d.x1 - cornerSize} ${d.y0 + cornerSize * 0.7}
            Z
          `)
          .attr('fill', 'rgba(0, 0, 0, 0.1)')
          .attr('stroke', 'none');
        
        // Corner fold (the curled part)
        cornerGroup.append('path')
          .attr('d', `
            M ${d.x1 - cornerSize} ${d.y0}
            Q ${d.x1 - cornerSize * 0.5} ${d.y0 + cornerSize * 0.5} ${d.x1} ${d.y0 + cornerSize}
            L ${d.x1 - cornerRadius} ${d.y0 + cornerSize - cornerRadius}
            Q ${d.x1 - cornerSize + cornerRadius} ${d.y0 + cornerRadius} ${d.x1 - cornerSize} ${d.y0}
            Z
          `)
          .attr('fill', '#f0f0f0')
          .attr('stroke', '#000000')
          .attr('stroke-width', 0.5);
          
      } else {
        // Regular rectangle for folders or very small files
        group.append('rect')
          .attr('x', d.x0)
          .attr('y', d.y0)
          .attr('width', width)
          .attr('height', height)
          .attr('fill', getColor(d))
          .attr('stroke', selectedNode?.path === d.data.path ? '#4a9eff' : 'rgba(255, 255, 255, 0.8)')
          .attr('stroke-width', selectedNode?.path === d.data.path ? 2 : 0.5)
          .style('shape-rendering', 'crispEdges');
      }
    });

    // Add text labels
    nodesToRender.forEach((d) => {
      const nodeWidth = d.x1 - d.x0;
      const nodeHeight = d.y1 - d.y0;
      const isParent = d.depth === 1 && d.children && d.children.length > 0;
      
      // Only show text if the node is large enough
      if (nodeWidth > 50 && nodeHeight > 30) {
        const isFile = !d.data.isDir;
        const textColor = isFile ? '#000000' : 'rgba(0, 0, 0, 0.9)';
        
        // Position text at top for parent directories, center for others
        const textX = d.x0 + nodeWidth / 2;
        const textY = isParent ? d.y0 + 15 : d.y0 + nodeHeight / 2 - (nodeHeight > 50 ? 8 : 0);
        
        const text = svg.append('text')
          .attr('x', textX)
          .attr('y', textY)
          .attr('text-anchor', 'middle')
          .attr('font-size', isParent ? '16px' : '14px')
          .attr('font-weight', isParent ? '600' : '500')
          .attr('fill', textColor)
          .style('user-select', 'none')
          .style('pointer-events', 'none')
          .style('text-shadow', isFile ? 'none' : '0 0 3px rgba(255, 255, 255, 0.8), 0 0 6px rgba(255, 255, 255, 0.6)');
        
        // Format size
        const formatSize = (bytes: number) => {
          const units = ['B', 'KB', 'MB', 'GB', 'TB'];
          let size = bytes;
          let unitIndex = 0;
          
          while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
          }
          
          return size >= 10 ? `${Math.round(size)}${units[unitIndex]}` : `${size.toFixed(1)}${units[unitIndex]}`;
        };
        
        // Show name on first line
        let displayName = d.data.name;
        const maxChars = Math.floor((nodeWidth - 8) / 7);
        if (displayName.length > maxChars && maxChars > 3) {
          displayName = displayName.substring(0, maxChars - 3) + '...';
        }
        
        text.text(displayName);
        
        // Store the position for size text
        const centerX = textX;
        const centerY = d.y0 + nodeHeight / 2;
        
        // Show size on second line if there's enough space
        if (nodeHeight > 50 && nodeWidth > 80 && !isParent) {
          const sizeY = isParent ? textY + 20 : textY + 16;
          const sizeText = svg.append('text')
            .attr('x', textX)
            .attr('y', sizeY)
            .attr('text-anchor', 'middle')
            .attr('font-size', '13px')
            .attr('font-weight', '400')
            .attr('fill', isFile ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.8)')
            .style('user-select', 'none')
            .style('pointer-events', 'none')
            .style('text-shadow', isFile ? 'none' : '0 0 3px rgba(255, 255, 255, 0.8), 0 0 6px rgba(255, 255, 255, 0.6)');
          
          sizeText.text(formatSize(d.data.size));
        }
      }
    });

    // Add tooltips to node groups with more information
    nodeGroups.append('title')
      .text((d) => {
        const parentSize = d.parent ? d.parent.value || 0 : hierarchy.value || 0;
        const percentage = parentSize > 0 ? ((d.value || 0) / parentSize * 100).toFixed(1) : '0';
        const path = d.ancestors().reverse().map(a => a.data.name).join(' → ');
        return `${d.data.name}\n${formatBytes(d.data.size)}\n${percentage}% of parent\nPath: ${path}`;
      });

  }, [data, width, height, onNodeClick, selectedNode]);

  return (
    <>
      <svg 
        ref={svgRef} 
        width={width} 
        height={height}
        style={{ background: '#f0f0f0' }}
      />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          path={contextMenu.node.path}
          isDir={contextMenu.node.isDir}
          onClose={() => setContextMenu(null)}
          onNavigate={contextMenu.node.isDir && onNodeClick ? () => {
            onNodeClick(contextMenu.node);
            setContextMenu(null);
          } : undefined}
        />
      )}
    </>
  );
};