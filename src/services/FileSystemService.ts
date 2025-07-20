import { Effect, Context, Layer } from 'effect';
import { Schema } from '@effect/schema';
import { invoke } from '@tauri-apps/api/core';
import { FileNodeSchema, type FileNode } from '@/schemas/FileSystem';

export class FileSystemError extends Schema.TaggedError<FileSystemError>()(
  'FileSystemError',
  {
    message: Schema.String,
  }
) {}

export interface FileSystemService {
  readonly scan: (path: string) => Effect.Effect<FileNode, FileSystemError>;
  readonly getHomeDirectory: () => Effect.Effect<string, FileSystemError>;
}

export const FileSystemService = Context.GenericTag<FileSystemService>(
  'FileSystemService'
);

export const FileSystemServiceLive = Layer.succeed(
  FileSystemService,
  FileSystemService.of({
    scan: (path: string) =>
      Effect.tryPromise({
        try: () => invoke<unknown>('scan_path', { path }),
        catch: (error) => new FileSystemError({ message: String(error) }),
      }).pipe(
        Effect.flatMap((data) =>
          Schema.decodeUnknown(FileNodeSchema)(data).pipe(
            Effect.mapError((error) => 
              new FileSystemError({ message: error.message })
            )
          )
        )
      ),
    
    getHomeDirectory: () =>
      Effect.tryPromise({
        try: () => invoke<string>('get_home_directory'),
        catch: (error) => new FileSystemError({ message: String(error) }),
      }),
  })
);