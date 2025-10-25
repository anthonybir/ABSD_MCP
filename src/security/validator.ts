import { resolve, normalize, dirname } from 'node:path';
import { existsSync, realpathSync, statSync } from 'node:fs';
import type { Config } from '../types/config.js';
import type { Logger } from 'pino';

export class SecurityValidator {
  private allowedPaths: Set<string>;
  private blockedCommands: Set<string>;
  private readonly hasUnrestrictedAccess: boolean;

  constructor(
    private config: Config,
    private logger: Logger
  ) {
    // Check if unrestricted access is enabled
    this.hasUnrestrictedAccess = config.allowedDirectories.length === 0;

    if (this.hasUnrestrictedAccess) {
      logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.warn('⚠️  SECURITY: Unrestricted Filesystem Access');
      logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.warn('allowedDirectories is EMPTY - Full filesystem access enabled');
      logger.warn('This is DANGEROUS and NOT recommended for production');
      logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    // Normalize and resolve all allowed directories to absolute paths
    this.allowedPaths = new Set(
      config.allowedDirectories.map(dir => {
        const resolved = resolve(dir);
        // Store realpath to handle symlinks
        return existsSync(resolved) ? realpathSync(resolved) : resolved;
      })
    );
    this.blockedCommands = new Set(config.blockedCommands);
  }

  /**
   * Valida que un path esté dentro de los directorios permitidos.
   * CRITICAL: Resuelve symlinks y normaliza paths para prevenir traversal.
   *
   * Si allowedDirectories está vacío, permite acceso a TODO el filesystem (con warning).
   */
  validatePath(requestedPath: string): { valid: boolean; error?: string; resolvedPath?: string } {
    try {
      // Normalize and resolve to absolute path
      const normalizedPath = normalize(requestedPath);
      const absolutePath = resolve(normalizedPath);

      // Resolve symlinks if path exists
      const realPath = existsSync(absolutePath)
        ? realpathSync(absolutePath)
        : absolutePath;

      // SI allowedDirectories está vacío → permitir TODO
      if (this.hasUnrestrictedAccess) {
        this.logger.debug({ path: realPath }, 'Unrestricted access granted');
        return { valid: true, resolvedPath: realPath };
      }

      // Check if path is within any allowed directory
      const isAllowed = Array.from(this.allowedPaths).some(allowedPath => {
        return realPath === allowedPath || realPath.startsWith(allowedPath + '/');
      });

      if (!isAllowed) {
        return {
          valid: false,
          error: `Path fuera de directorios permitidos: ${requestedPath}`,
        };
      }

      return { valid: true, resolvedPath: realPath };
    } catch (error) {
      return {
        valid: false,
        error: `Error validando path: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Valida comando contra lista de comandos bloqueados.
   * Compara tanto comando completo como partes individuales.
   */
  validateCommand(command: string): { valid: boolean; error?: string } {
    const normalizedCmd = command.trim().toLowerCase();

    // Check full command
    if (this.blockedCommands.has(normalizedCmd)) {
      return {
        valid: false,
        error: `Comando bloqueado: ${command}`,
      };
    }

    // Check command parts (for complex commands with pipes, etc)
    const parts = normalizedCmd.split(/[|;&]/).map(p => p.trim());
    for (const part of parts) {
      if (this.blockedCommands.has(part)) {
        return {
          valid: false,
          error: `Comando bloqueado detectado en: ${part}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Valida que un path apunte a un directorio.
   */
  isDirectory(path: string): boolean {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Obtiene el directorio padre más cercano que existe.
   * Útil para crear directorios recursivamente.
   */
  findExistingParent(path: string): string | null {
    let current = path;
    while (current !== '/') {
      if (existsSync(current)) {
        return current;
      }
      current = dirname(current);
    }
    return null;
  }

  /**
   * Sanitiza input para prevenir injection attacks.
   */
  sanitizeInput(input: string, maxLength: number = 10000): string {
    // Remove null bytes and control characters
    const sanitized = input.replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Truncate to max length
    return sanitized.slice(0, maxLength);
  }
}
