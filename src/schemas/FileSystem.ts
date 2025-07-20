import { Schema } from '@effect/schema';

// Define the base structure without children
const BaseFileNode = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  size: Schema.Number,
  isDir: Schema.Boolean,
});

// Define the recursive type
export interface FileNode extends Schema.Schema.Type<typeof BaseFileNode> {
  children?: FileNode[];
}

// Create the schema with manual type annotation
export const FileNodeSchema = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  size: Schema.Number,
  isDir: Schema.Boolean,
  children: Schema.optional(Schema.Unknown),
}) as unknown as Schema.Schema<FileNode>;

export const ScanProgressSchema = Schema.Struct({
  current_path: Schema.String,
  items_processed: Schema.Number,
});

export type ScanProgress = Schema.Schema.Type<typeof ScanProgressSchema>;

export const DiskInfoSchema = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  total: Schema.Number,
  free: Schema.Number,
  mountPoint: Schema.String,
});

export type DiskInfo = Schema.Schema.Type<typeof DiskInfoSchema>;