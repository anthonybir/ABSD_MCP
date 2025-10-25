import { describe, it, expect, beforeEach } from 'vitest';
import { SecurityValidator } from '../../src/security/validator.js';
import { tmpdir } from 'node:os';
import { mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../../src/types/config.js';

describe('SecurityValidator - Path Traversal Protection', () => {
  let validator: SecurityValidator;
  let testDir: string;
  let allowedDir: string;

  beforeEach(() => {
    // Create temp test directory
    testDir = join(tmpdir(), `absd-mcp-test-${Date.now()}`);
    allowedDir = join(testDir, 'allowed');
    mkdirSync(allowedDir, { recursive: true });

    const config: Config = {
      allowedDirectories: [allowedDir],
      blockedCommands: ['rm -rf /', 'dd if=/dev/zero'],
      fileReadLineLimit: 1000,
      fileWriteLineLimit: 50,
      sessionTimeout: 30000,
      logLevel: 'error',
    };

    validator = new SecurityValidator(config);
  });

  it.afterEach(() => {
    // Cleanup
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Path Traversal Attacks', () => {
    it('debe rechazar ../ traversal', () => {
      const result = validator.validatePath(join(allowedDir, '../../../etc/passwd'));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('fuera de directorios permitidos');
    });

    it('debe rechazar path absoluto fuera de allowed', () => {
      const result = validator.validatePath('/etc/passwd');
      expect(result.valid).toBe(false);
    });

    it('debe rechazar encoded traversal (%2e%2e%2f)', () => {
      const decoded = decodeURIComponent('%2e%2e%2f');
      const result = validator.validatePath(join(allowedDir, decoded, 'etc/passwd'));
      expect(result.valid).toBe(false);
    });

    it('debe aceptar path válido dentro de allowed', () => {
      const validPath = join(allowedDir, 'test.txt');
      const result = validator.validatePath(validPath);
      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBeDefined();
    });
  });

  describe('Symlink Resolution', () => {
    it('debe resolver symlinks y validar target real', () => {
      const outsideDir = join(testDir, 'outside');
      mkdirSync(outsideDir);
      writeFileSync(join(outsideDir, 'secret.txt'), 'data');

      const symlinkPath = join(allowedDir, 'link');
      symlinkSync(join(outsideDir, 'secret.txt'), symlinkPath);

      const result = validator.validatePath(symlinkPath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('fuera de directorios permitidos');
    });

    it('debe aceptar symlink a archivo dentro de allowed', () => {
      const targetFile = join(allowedDir, 'target.txt');
      writeFileSync(targetFile, 'data');

      const symlinkPath = join(allowedDir, 'link.txt');
      symlinkSync(targetFile, symlinkPath);

      const result = validator.validatePath(symlinkPath);
      expect(result.valid).toBe(true);
    });
  });

  describe('Command Validation', () => {
    it('debe rechazar comando bloqueado exacto', () => {
      const result = validator.validateCommand('rm -rf /');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('bloqueado');
    });

    it('debe rechazar comando bloqueado en pipe', () => {
      const result = validator.validateCommand('ls -la | rm -rf /');
      expect(result.valid).toBe(false);
    });

    it('debe aceptar comando seguro', () => {
      const result = validator.validateCommand('ls -la');
      expect(result.valid).toBe(true);
    });

    it('debe ser case-insensitive', () => {
      const result = validator.validateCommand('RM -RF /');
      expect(result.valid).toBe(false);
    });
  });

  describe('Input Sanitization', () => {
    it('debe remover null bytes', () => {
      const input = 'test\0malicious';
      const sanitized = validator.sanitizeInput(input);
      expect(sanitized).not.toContain('\0');
      expect(sanitized).toBe('testmalicious');
    });

    it('debe remover control characters', () => {
      const input = 'test\x01\x02\x03';
      const sanitized = validator.sanitizeInput(input);
      expect(sanitized).toBe('test');
    });

    it('debe truncar a max length', () => {
      const input = 'a'.repeat(20000);
      const sanitized = validator.sanitizeInput(input, 1000);
      expect(sanitized.length).toBe(1000);
    });

    it('debe preservar input válido', () => {
      const input = 'Valid input with émojis 🎉 and special chars: @#$%';
      const sanitized = validator.sanitizeInput(input);
      expect(sanitized).toBe(input);
    });
  });
});
