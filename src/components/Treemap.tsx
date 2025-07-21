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
      .eachBefore((d) => {
        // Store the original size for debugging
        (d.data as any).originalSize = d.data.size;
      })
      .sum((d) => {
        // IMPORTANT: Only count leaf nodes to avoid double counting
        // A leaf node is either:
        // 1. A file (!isDir)
        // 2. An empty directory (isDir but no children)
        if (!d.isDir || !d.children || d.children.length === 0) {
          return d.size || 0;
        }
        // For directories with children, return 0
        // D3 will sum up their children's values automatically
        return 0;
      })
      .sort((a, b) => (b.value || 0) - (a.value || 0));
    
    console.log('[Treemap] Data structure:', {
      rootName: data.name,
      rootSize: data.size,
      rootChildren: data.children?.length || 0,
      firstChild: data.children?.[0] ? {
        name: data.children[0].name,
        size: data.children[0].size,
        isDir: data.children[0].isDir,
        hasChildren: !!data.children[0].children,
        childCount: data.children[0].children?.length || 0
      } : null
    });
    

    console.log('[Treemap] Hierarchy created:', {
      value: hierarchy.value,
      height: hierarchy.height,
      leaves: hierarchy.leaves().length,
      rootSize: data.size,
      discrepancy: (hierarchy.value || 0) - (data.size || 0)
    });
    
    // Sanity check - hierarchy value should not exceed root size
    if ((hierarchy.value || 0) > (data.size || 0)) {
      console.warn('[Treemap] WARNING: Hierarchy value exceeds root size!', {
        hierarchyValue: hierarchy.value,
        rootSize: data.size,
        difference: (hierarchy.value || 0) - (data.size || 0)
      });
    }
    
    // Debug: Check values of top-level nodes
    if (hierarchy.children) {
      console.log('[Treemap] Top-level node values:', hierarchy.children.map(child => ({
        name: child.data.name,
        dataSize: child.data.size,
        computedValue: child.value,
        hasChildren: !!child.children,
        childCount: child.children?.length || 0
      })));
    }

    // Create treemap with more padding for nested view
    const treemap = d3.treemap<FileNode>()
      .size([width, height])
      .padding(1)
      .paddingInner(2)
      .paddingTop(18) // Extra space at top for parent labels
      .round(true)
      .tile(d3.treemapSquarify); // Use default squarify for better proportions

    const root = treemap(hierarchy);
    
    // Get all descendants up to depth 2 (root is 0, children are 1, grandchildren are 2)
    const allNodes = root.descendants().filter(d => d.depth > 0 && d.depth <= 2);
    
    // Separate parent nodes (depth 1) and child nodes (depth 2)
    const parentNodes = allNodes.filter(d => d.depth === 1);
    const childNodes = allNodes.filter(d => d.depth === 2);
    
    console.log('[Treemap] Rendering nodes:', {
      parents: parentNodes.length,
      children: childNodes.length,
      total: allNodes.length
    });
    
    // Debug: Log some parent nodes to see if they have children
    parentNodes.slice(0, 3).forEach(parent => {
      console.log('[Treemap] Parent node:', {
        name: parent.data.name,
        hasChildren: !!parent.children,
        childCount: parent.children?.length || 0,
        children: parent.children?.map(c => ({ name: c.data.name, size: c.data.size }))
      });
    });

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
    
    // First, draw parent nodes (depth 1) that have children
    const parentContainers = parentNodes.filter(d => d.children && d.children.length > 0);
    
    parentContainers.forEach(parent => {
      const group = svg.append('g')
        .attr('class', 'parent-node');
      
      // Draw parent rectangle
      group.append('rect')
        .attr('x', parent.x0)
        .attr('y', parent.y0)
        .attr('width', parent.x1 - parent.x0)
        .attr('height', parent.y1 - parent.y0)
        .attr('fill', getColor(parent))
        .attr('stroke', 'rgba(255, 255, 255, 0.8)')
        .attr('stroke-width', 1)
        .style('cursor', 'pointer')
        .on('dblclick', (event) => {
          event.preventDefault();
          if (onNodeClick) {
            onNodeClick(parent.data);
          }
        })
        .on('contextmenu', (event) => {
          event.preventDefault();
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
            node: parent.data
          });
        });
      
      // Add parent label at top
      if (parent.x1 - parent.x0 > 80 && parent.y1 - parent.y0 > 30) {
        group.append('text')
          .attr('x', parent.x0 + (parent.x1 - parent.x0) / 2)
          .attr('y', parent.y0 + 16)
          .attr('text-anchor', 'middle')
          .attr('font-size', '15px')
          .attr('font-weight', '600')
          .attr('fill', 'rgba(0, 0, 0, 0.9)')
          .style('user-select', 'none')
          .style('pointer-events', 'none')
          .style('text-shadow', '0 0 3px rgba(255, 255, 255, 0.8)')
          .text(parent.data.name);
      }
    });
    
    // Then draw all nodes (including childless parents and all children)
    const nodeGroups = svg.selectAll<SVGGElement, d3.HierarchyRectangularNode<FileNode>>('g.child-node')
      .data(allNodes)
      .enter()
      .append('g')
      .attr('class', d => d.depth === 1 ? 'parent-child-node' : 'child-node')
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
        if (onNodeClick && d.data.isDir && d.depth === 1) {
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
    
    // Add rectangles or file shapes for child nodes only (parents already drawn)
    nodeGroups.each(function(d) {
      // Skip if this is a parent node with children (already drawn above)
      if (d.depth === 1 && d.children && d.children.length > 0) {
        return;
      }
      
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

    // Add text labels for child nodes
    allNodes.forEach((d) => {
      // Skip parent labels if they have children (already added above)
      if (d.depth === 1 && d.children && d.children.length > 0) {
        return;
      }
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