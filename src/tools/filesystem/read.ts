import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { SecurityValidator } from '../../security/validator.js';
import { wrapError, createNotFoundError } from '../../utils/errors.js';
import type { Logger } from '../../utils/logger.js';
import type { ToolResult, Config } from '../../types/config.js';

const ReadFileSchema = z.object({
  path: z.string().describe('Absolute or relative path to the file, or URL if isUrl is true'),
  offset: z.number().int().default(0).describe('Line offset to start reading from (negative for tail)'),
  length: z.number().int().positive().optional().describe('Maximum number of lines to read'),
  isUrl: z.boolean().default(false).describe('Set to true to fetch content from URL'),
});

export type ReadFileArgs = z.infer<typeof ReadFileSchema>;

// Supported image extensions (excluding SVG due to executable XML/script risk)
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);

// Image MIME type mapping
const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

/**
 * Check if a file path is an image based on extension
 */
function isImageFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().match(/\.\w+$/)?.[0];
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().match(/\.\w+$/)?.[0];
  return ext ? (MIME_TYPES[ext] || 'application/octet-stream') : 'application/octet-stream';
}

/**
 * Fetch URL content with timeout and denylist check
 */
async function fetchUrl(url: string, config: Config, logger: Logger): Promise<Buffer> {
  // Parse URL to check against denylist
  const parsedUrl = new URL(url);
  const hostname = parsedUrl.hostname.toLowerCase();

  // Check denylist
  for (const blocked of config.urlDenylist) {
    if (hostname === blocked.toLowerCase() || hostname.endsWith(`.${blocked.toLowerCase()}`)) {
      throw new Error(`URL hostname "${hostname}" is in denylist`);
    }
  }

  logger.debug({ url, hostname }, 'Fetching URL');

  // Fetch with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.urlTimeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ABSD-MCP/0.3.0',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check size (5MB max for URLs)
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
      throw new Error('URL content exceeds 5MB limit');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Final size check after download
    if (buffer.length > 5 * 1024 * 1024) {
      throw new Error('Downloaded content exceeds 5MB limit');
    }

    return buffer;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function readFileTool(
  args: ReadFileArgs,
  validator: SecurityValidator,
  logger: Logger,
  config: Config
): Promise<ToolResult> {
  try {
    // Validate with Zod
    const validated = ReadFileSchema.parse(args);
    const { path, offset, length, isUrl } = validated;

    // Handle URL fetching
    if (isUrl) {
      const buffer = await fetchUrl(path, config, logger);

      // Check if URL points to an image
      if (isImageFile(path)) {
        const mimeType = getMimeType(path);
        const base64 = buffer.toString('base64');

        logger.info({ url: path, size: buffer.length, mimeType }, 'Image fetched from URL');

        return {
          content: [{
            type: 'image',
            data: base64,
            mimeType,
          }],
        };
      }

      // Text content from URL
      const content = buffer.toString('utf-8');
      const lines = content.split('\n');
      const totalLines = lines.length;
      const maxLines = length ?? config.fileReadLineLimit;

      const startIdx = offset < 0
        ? Math.max(0, totalLines + offset)
        : Math.min(offset, totalLines);

      const endIdx = Math.min(startIdx + maxLines, totalLines);
      const chunk = lines.slice(startIdx, endIdx);

      logger.info({ url: path, totalLines, returnedLines: chunk.length }, 'Text fetched from URL');

      return {
        content: [{
          type: 'text',
          text: chunk.join('\n'),
        }],
      };
    }

    // File path validation
    const validation = validator.validatePath(path);
    if (!validation.valid) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${validation.error}`,
        }],
      };
    }

    const validPath = validation.resolvedPath!;

    // Check if file is an image
    if (isImageFile(validPath)) {
      const buffer = await readFile(validPath).catch((error) => {
        if (error.code === 'ENOENT') {
          throw createNotFoundError(path);
        }
        throw error;
      });

      // Size check (10MB max for images)
      if (buffer.length > 10 * 1024 * 1024) {
        throw new Error('Image file exceeds 10MB limit');
      }

      const mimeType = getMimeType(validPath);
      const base64 = buffer.toString('base64');

      logger.info({ path: validPath, size: buffer.length, mimeType }, 'Image file read');

      return {
        content: [{
          type: 'image',
          data: base64,
          mimeType,
        }],
      };
    }

    // Read text file
    const content = await readFile(validPath, 'utf-8').catch((error) => {
      if (error.code === 'ENOENT') {
        throw createNotFoundError(path);
      }
      throw error;
    });

    const lines = content.split('\n');
    const totalLines = lines.length;

    // Apply line limit
    const maxLines = length ?? config.fileReadLineLimit;

    // Handle offset (negative = tail)
    const startIdx = offset < 0
      ? Math.max(0, totalLines + offset)
      : Math.min(offset, totalLines);

    const endIdx = Math.min(startIdx + maxLines, totalLines);
    const chunk = lines.slice(startIdx, endIdx);

    logger.info({
      tool: 'read_file',
      path: validPath,
      totalLines,
      returnedLines: chunk.length,
      offset: startIdx,
    }, 'File read successfully');

    return {
      content: [{
        type: 'text',
        text: chunk.join('\n'),
      }],
    };
  } catch (error) {
    const mcpError = wrapError(error, 'read_file');
    logger.error({ error: mcpError, args }, 'read_file failed');

    return {
      content: [{
        type: 'text',
        text: `Error: ${mcpError.message}`,
      }],
    };
  }
}

export const readFileToolDefinition = {
  name: 'read_file',
  description: 'Read the contents of a file or URL. Supports images (PNG, JPEG, GIF, WebP, BMP) with MCP native ImageContent. ' +
               'SVG files are treated as text due to executable XML/script risk. ' +
               'For URLs: max 5MB, configurable timeout (10s default) and denylist. ' +
               'For local images: max 10MB. ' +
               'For text files: optional chunking and offset support (negative offset for tail behavior).',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to file, or URL if isUrl is true',
      },
      offset: {
        type: 'number',
        description: 'Line offset to start reading from (negative for tail). Default: 0',
        default: 0,
      },
      length: {
        type: 'number',
        description: 'Maximum number of lines to read (optional)',
      },
      isUrl: {
        type: 'boolean',
        description: 'Set to true to fetch content from URL. Default: false',
        default: false,
      },
    },
    required: ['path'],
  },
};
