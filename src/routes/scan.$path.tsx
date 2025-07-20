import { createFileRoute } from '@tanstack/react-router';
import { ScanView } from '@/pages/ScanView';

export const Route = createFileRoute('/scan/$path')({
  component: ScanView,
});