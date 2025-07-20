import { useQuery, UseQueryResult, useQueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';
import { FileSystemService, FileSystemServiceLive } from '@/services/FileSystemService';
import type { FileNode } from '@/schemas/FileSystem';
import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

// Cancel any ongoing scans
async function cancelOngoingScans() {
  try {
    await invoke('cancel_scan');
    console.log('[useFileSystem] Cancelled ongoing scans');
  } catch (error) {
    console.error('[useFileSystem] Failed to cancel scans:', error);
  }
}

export function useScanDirectory(path: string | null): UseQueryResult<FileNode, Error> {
  const queryClient = useQueryClient();
  const queryKey = ['scan', path];
  
  // Listen for intermediate scan results and cancel previous scans
  useEffect(() => {
    if (!path) return;
    
    // Cancel any ongoing scans when path changes
    cancelOngoingScans();
    
    // Clear any cached query data for this path to ensure fresh start
    queryClient.removeQueries({ queryKey });
    
    let unlistenFn: (() => void) | null = null;
    
    const setupListener = async () => {
      try {
        unlistenFn = await listen<FileNode>('scan-intermediate', (event) => {
          console.log('[useFileSystem] Received intermediate scan result:', {
            name: event.payload?.name,
            childrenCount: event.payload?.children?.length || 0,
            size: event.payload?.size
          });
          // Update the query data with intermediate results
          queryClient.setQueryData(queryKey, (oldData: FileNode | undefined) => {
            console.log('[useFileSystem] Updating query data with intermediate results');
            return event.payload || oldData;
          });
        });
      } catch (error) {
        console.error('[useFileSystem] Failed to setup intermediate listener:', error);
      }
    };
    
    setupListener();
    
    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [path, queryClient]);
  
  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      if (!path) throw new Error('No path provided');
      
      // Cancel any ongoing scans before starting new one
      await cancelOngoingScans();
      
      console.log('[useFileSystem] Starting scan for path:', path);
      
      const program = FileSystemService.pipe(
        Effect.flatMap((service) => service.scan(path)),
        Effect.provide(FileSystemServiceLive)
      );
      
      // Create abort controller effect
      const result = await Effect.runPromise(program);
      
      console.log('[useFileSystem] Scan completed. Result:', {
        name: result?.name,
        path: result?.path,
        size: result?.size,
        isDir: result?.isDir,
        childrenCount: result?.children?.length || 0
      });
      console.log('[useFileSystem] Full result:', result);
      
      // Check if aborted
      if (signal?.aborted) {
        throw new Error('Scan cancelled');
      }
      
      return result;
    },
    enabled: !!path,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

export function useHomeDirectory(): UseQueryResult<string, Error> {
  return useQuery({
    queryKey: ['home-directory'],
    queryFn: async () => {
      const program = FileSystemService.pipe(
        Effect.flatMap((service) => service.getHomeDirectory()),
        Effect.provide(FileSystemServiceLive)
      );
      
      return Effect.runPromise(program);
    },
    staleTime: Infinity,
  });
}