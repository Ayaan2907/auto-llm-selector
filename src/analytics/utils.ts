/* eslint-env node */
import crypto from 'crypto';
import os from 'os';

/**
 * Shared analytics utilities to avoid code duplication
 */
export class AnalyticsUtils {
  /**
   * Generate stable anonymous user fingerprint from system characteristics
   */
  static generateUserFingerprint(): string {
    const systemCharacteristics = [
      process.platform,
      process.arch,
      process.version.split('.')[0],
      os.cpus().length.toString(),
      Math.floor(os.totalmem() / (1024 * 1024 * 1024)).toString(),
      process.env.NODE_ENV || 'unknown',
      this.detectRuntimeEnvironment(),
    ].join('|');

    return crypto
      .createHash('sha256')
      .update(systemCharacteristics)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Detect runtime environment and framework
   */
  static detectRuntimeEnvironment(): string {
    try {
      if (process.env.VERCEL) return 'vercel';
      if (process.env.NETLIFY) return 'netlify';
      if (process.env.AWS_LAMBDA_FUNCTION_NAME) return 'aws-lambda';
      if (process.env.NEXT_RUNTIME) return 'nextjs';

      if (this.hasPackage('next')) return 'nextjs';
      if (this.hasPackage('express')) return 'express';
      if (this.hasPackage('fastify')) return 'fastify';
      if (this.hasPackage('koa')) return 'koa';

      return 'nodejs';
    } catch {
      return 'nodejs';
    }
  }

  /**
   * Check if package is available in current project
   */
  static hasPackage(packageName: string): boolean {
    try {
      require.resolve(packageName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Collect anonymized system information
   */
  static collectSystemInfo() {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version.split('.')[0],
      cpuCount: os.cpus().length,
      totalMemoryGB: Math.floor(os.totalmem() / (1024 * 1024 * 1024)),
      environment: process.env.NODE_ENV || 'unknown',
      runtime: this.detectRuntimeEnvironment(),
    };
  }

  /**
   * Generate privacy-safe hash of content
   */
  static generateContentHash(content: string): string {
    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Get library version from package.json
   */
  static getLibraryVersion(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const packageJson = require('../../package.json') as { version?: string };
      return packageJson.version || 'unknown';
    } catch {
      return 'development';
    }
  }

  /**
   * Generate session identifier
   */
  static generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Remove sensitive information from configuration
   */
  static sanitizeConfig(config: Record<string, unknown>) {
    const sanitized = { ...config };
    delete sanitized.OPEN_ROUTER_API_KEY;
    delete sanitized.apiKey;
    delete sanitized.key;
    delete sanitized.secret;
    return sanitized;
  }
}
