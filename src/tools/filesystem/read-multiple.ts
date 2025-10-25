import { z } from 'zod';
import fs from 'fs/promises';
import type { SecurityValidator } from '../../security/validator.js';
import type { Logger } from 'pino';
import type { ToolResult } from '../../types/config.js';

// Zod schema
export const ReadMultipleFilesSchema = z.object({
  paths: z.array(z.string()).min(1, 'Al menos una ruta requerida').max(50, 'Máximo 50 archivos por operación'),
});

export type ReadMultipleFilesArgs = z.infer<typeof ReadMultipleFilesSchema>;

// Tool definition
export const readMultipleFilesToolDefinition = {
  name: 'read_multiple_files',
  description: 'Read contents of multiple files simultaneously. Returns array of file contents with metadata. ' +
               'SIZE LIMITS: Max 1MB per file, 5MB total across all files. ' +
               'Files exceeding individual limit show PREVIEW ONLY with explicit truncation notice. ' +
               'Operation stops at 5MB total with truncation notice.',
  inputSchema: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        description: 'Array of absolute file paths to read (max 50 files)',
        items: {
          type: 'string',
        },
        minItems: 1,
        maxItems: 50,
      },
    },
    required: ['paths'],
  },
};

// Size limits
const MAX_FILE_SIZE = 1024 * 1024; // 1MB per file
const MAX_TOTAL_SIZE = 5 * 1024 * 1024; // 5MB total

interface FileReadResult {
  path: string;
  success: boolean;
  content?: string;
  size?: number;
  error?: string;
  truncated?: boolean;
  truncationReason?: 'file_size_limit' | 'total_size_limit';
}

/**
 * Read multiple files with size caps and graceful failure handling
 */
export async function readMultipleFilesTool(
  args: ReadMultipleFilesArgs,
  validator: SecurityValidator,
  logger: Logger
): Promise<ToolResult> {
  // Validate arguments with Zod
  const validated = ReadMultipleFilesSchema.parse(args);
  const { paths } = validated;
  const results: FileReadResult[] = [];
  let totalBytesRead = 0;
  let operationTruncated = false;

  logger.info({ fileCount: paths.length }, 'Reading multiple files');

  for (const requestedPath of paths) {
    // Check if we've hit total size limit
    if (totalBytesRead >= MAX_TOTAL_SIZE) {
      operationTruncated = true;
      logger.warn({ totalBytesRead, limit: MAX_TOTAL_SIZE }, 'Total size limit reached');
      results.push({
        path: requestedPath,
        success: false,
        error: '⚠️  OPERATION TRUNCATED: Total size limit (5MB) reached. Remaining files not read.',
      });
      continue;
    }

    // Validate path
    const validation = validator.validatePath(requestedPath);
    if (!validation.valid) {
      results.push({
        path: requestedPath,
        success: false,
        error: validation.error,
      });
      continue;
    }

    const validPath = validation.resolvedPath!;

    try {
      // Check file stats first
      const stats = await fs.stat(validPath);

      if (!stats.isFile()) {
        results.push({
          path: requestedPath,
          success: false,
          error: 'Path is not a regular file',
        });
        continue;
      }

      const fileSize = stats.size;

      // Check if single file exceeds limit
      if (fileSize > MAX_FILE_SIZE) {
        // Read preview only (first 100KB)
        const previewSize = 100 * 1024;
        const buffer = Buffer.alloc(previewSize);
        const fd = await fs.open(validPath, 'r');
        const { bytesRead } = await fd.read(buffer, 0, previewSize, 0);
        await fd.close();

        const preview = buffer.toString('utf-8', 0, bytesRead);
        const lines = preview.split('\n');

        results.push({
          path: requestedPath,
          success: true,
          content: lines.slice(0, 100).join('\n'),
          size: fileSize,
          truncated: true,
          truncationReason: 'file_size_limit',
        });

        totalBytesRead += bytesRead;
        logger.debug({ path: validPath, fileSize, bytesRead }, 'File truncated (size limit)');
        continue;
      }

      // Check if reading this file would exceed total limit
      const remainingBudget = MAX_TOTAL_SIZE - totalBytesRead;
      if (fileSize > remainingBudget) {
        // Read partial file up to budget
        const buffer = Buffer.alloc(remainingBudget);
        const fd = await fs.open(validPath, 'r');
        const { bytesRead } = await fd.read(buffer, 0, remainingBudget, 0);
        await fd.close();

        const preview = buffer.toString('utf-8', 0, bytesRead);
        const lines = preview.split('\n');

        results.push({
          path: requestedPath,
          success: true,
          content: lines.join('\n'),
          size: fileSize,
          truncated: true,
          truncationReason: 'total_size_limit',
        });

        totalBytesRead += bytesRead;
        operationTruncated = true;
        logger.debug({ path: validPath, fileSize, bytesRead }, 'File truncated (total limit)');
        continue;
      }

      // Read full file
      const content = await fs.readFile(validPath, 'utf-8');
      results.push({
        path: requestedPath,
        success: true,
        content,
        size: fileSize,
        truncated: false,
      });

      totalBytesRead += fileSize;
      logger.debug({ path: validPath, size: fileSize }, 'File read successfully');

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        path: requestedPath,
        success: false,
        error: `Error reading file: ${message}`,
      });
      logger.error({ path: validPath, error: message }, 'File read failed');
    }
  }

  // Build response text
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  const truncatedCount = results.filter(r => r.truncated).length;

  let responseText = `=== Read ${paths.length} Files ===\n\n`;
  responseText += `✅ Success: ${successCount}\n`;
  responseText += `❌ Failures: ${failureCount}\n`;
  if (truncatedCount > 0) {
    responseText += `⚠️  Truncated: ${truncatedCount}\n`;
  }
  responseText += `📊 Total bytes read: ${totalBytesRead.toLocaleString()} / ${MAX_TOTAL_SIZE.toLocaleString()}\n\n`;

  if (operationTruncated) {
    responseText += '⚠️  WARNING: Operation stopped early due to 5MB total size limit.\n';
    responseText += '   Some files were not read. Consider reading fewer/smaller files.\n\n';
  }

  responseText += '---\n\n';

  for (const result of results) {
    responseText += `📄 ${result.path}\n`;

    if (!result.success) {
      responseText += `   ❌ ${result.error}\n\n`;
      continue;
    }

    responseText += `   ✅ ${result.size?.toLocaleString()} bytes`;

    if (result.truncated) {
      if (result.truncationReason === 'file_size_limit') {
        responseText += ' (⚠️  PREVIEW ONLY - File exceeds 1MB limit)\n';
        responseText += `   📊 Showing first ~100 lines. Full file is ${result.size?.toLocaleString()} bytes.\n`;
      } else {
        responseText += ' (⚠️  PARTIAL - Hit 5MB total limit)\n';
        responseText += `   📊 Showing partial content. Full file is ${result.size?.toLocaleString()} bytes.\n`;
      }
    } else {
      responseText += '\n';
    }

    responseText += '\n';
    responseText += result.content;
    responseText += '\n\n---\n\n';
  }

  if (truncatedCount > 0) {
    responseText += '\n⚠️  TRUNCATION NOTICE:\n';
    responseText += `   ${truncatedCount} file(s) show PREVIEW or PARTIAL content only.\n`;
    responseText += '   - Files >1MB: First ~100 lines shown\n';
    responseText += '   - Total limit: Operation stops at 5MB cumulative\n';
    responseText += '   Use read_file for full access to individual large files.\n';
  }

  logger.info({
    total: paths.length,
    success: successCount,
    failures: failureCount,
    truncated: truncatedCount,
    totalBytes: totalBytesRead,
  }, 'read_multiple_files completed');

  return {
    content: [{
      type: 'text',
      text: responseText,
    }],
  };
}
