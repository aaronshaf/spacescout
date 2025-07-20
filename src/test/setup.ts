import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock Tauri API
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

// Setup global test utilities
declare global {
  var mockTauriInvoke: typeof mockInvoke;
}

globalThis.mockTauriInvoke = mockInvoke;