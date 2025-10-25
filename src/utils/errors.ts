import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Wrap any error into an McpError
 */
export function wrapError(error: unknown, context: string): McpError {
  if (error instanceof McpError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  return new McpError(
    ErrorCode.InternalError,
    `${context}: ${message}`,
    { originalError: message }
  );
}

/**
 * Create a validation error for invalid parameters
 */
export function createValidationError(message: string, details?: Record<string, unknown>): McpError {
  return new McpError(
    ErrorCode.InvalidParams,
    message,
    details
  );
}

/**
 * Create a security error for blocked operations
 */
export function createSecurityError(message: string, details?: Record<string, unknown>): McpError {
  return new McpError(
    ErrorCode.InvalidRequest,
    message,
    details
  );
}

/**
 * Create a not found error
 */
export function createNotFoundError(resource: string): McpError {
  return new McpError(
    ErrorCode.InvalidRequest,
    `Resource not found: ${resource}`,
    { resource }
  );
}

/**
 * Retry an operation with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unreachable'); // TypeScript exhaustiveness check
}
