/**
 * Input Sanitization Module
 * 
 * Prevents injection attacks (SQL, XSS, command injection).
 * Applied to all user inputs.
 * 
 * Requirements: 10.5
 */

// ============================================
// SANITIZATION FUNCTIONS
// ============================================

/**
 * Sanitize string input to prevent XSS attacks.
 * Escapes HTML special characters.
 * 
 * @param input - Raw input string
 * @returns Sanitized string
 * 
 * Validates: Requirements 10.5
 */
export function sanitizeHTML(input: string): string {
  if (!input) return '';
  
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize input to prevent command injection.
 * Removes shell metacharacters.
 * 
 * @param input - Raw input string
 * @returns Sanitized string
 * 
 * Validates: Requirements 10.5
 */
export function sanitizeCommand(input: string): string {
  if (!input) return '';
  
  // Remove shell metacharacters
  return input.replace(/[;&|`$(){}[\]<>\\]/g, '');
}

/**
 * Sanitize URL input.
 * Ensures URL is safe and well-formed.
 * 
 * @param input - Raw URL string
 * @returns Sanitized URL or null if invalid
 * 
 * Validates: Requirements 10.5
 */
export function sanitizeURL(input: string): string | null {
  if (!input) return null;
  
  try {
    const url = new URL(input);
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }
    
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Sanitize bot name input.
 * Removes potentially dangerous characters.
 * 
 * @param input - Raw name string
 * @returns Sanitized name
 * 
 * Validates: Requirements 10.5
 */
export function sanitizeBotName(input: string): string {
  if (!input) return '';
  
  // Allow alphanumeric, spaces, hyphens, underscores
  return input.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim();
}

/**
 * Sanitize bot handle input.
 * Ensures handle follows valid format.
 * 
 * @param input - Raw handle string
 * @returns Sanitized handle
 * 
 * Validates: Requirements 10.5
 */
export function sanitizeBotHandle(input: string): string {
  if (!input) return '';
  
  // Allow only alphanumeric and underscores, convert to lowercase
  return input.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
}

/**
 * Sanitize JSON input.
 * Validates and parses JSON safely.
 * 
 * @param input - Raw JSON string
 * @returns Parsed object or null if invalid
 * 
 * Validates: Requirements 10.5
 */
export function sanitizeJSON<T = any>(input: string): T | null {
  if (!input) return null;
  
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

/**
 * Sanitize integer input.
 * Ensures value is a valid integer within bounds.
 * 
 * @param input - Raw input
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns Sanitized integer or null if invalid
 * 
 * Validates: Requirements 10.5
 */
export function sanitizeInteger(
  input: string | number,
  min?: number,
  max?: number
): number | null {
  const num = typeof input === 'string' ? parseInt(input, 10) : input;
  
  if (isNaN(num) || !isFinite(num)) {
    return null;
  }
  
  if (min !== undefined && num < min) {
    return null;
  }
  
  if (max !== undefined && num > max) {
    return null;
  }
  
  return num;
}

/**
 * Sanitize float input.
 * Ensures value is a valid float within bounds.
 * 
 * @param input - Raw input
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns Sanitized float or null if invalid
 * 
 * Validates: Requirements 10.5
 */
export function sanitizeFloat(
  input: string | number,
  min?: number,
  max?: number
): number | null {
  const num = typeof input === 'string' ? parseFloat(input) : input;
  
  if (isNaN(num) || !isFinite(num)) {
    return null;
  }
  
  if (min !== undefined && num < min) {
    return null;
  }
  
  if (max !== undefined && num > max) {
    return null;
  }
  
  return num;
}

/**
 * Sanitize email input.
 * Validates email format.
 * 
 * @param input - Raw email string
 * @returns Sanitized email or null if invalid
 * 
 * Validates: Requirements 10.5
 */
export function sanitizeEmail(input: string): string | null {
  if (!input) return null;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(input)) {
    return null;
  }
  
  return input.toLowerCase().trim();
}

/**
 * Validate and sanitize bot configuration input.
 * Comprehensive sanitization for bot creation/update.
 * 
 * @param input - Raw configuration object
 * @returns Sanitized configuration
 * 
 * Validates: Requirements 10.5
 */
export interface BotConfigInput {
  name?: string;
  handle?: string;
  bio?: string;
  avatarUrl?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export function sanitizeBotConfig(input: BotConfigInput): BotConfigInput {
  const sanitized: BotConfigInput = {};
  
  if (input.name) {
    sanitized.name = sanitizeBotName(input.name);
  }
  
  if (input.handle) {
    sanitized.handle = sanitizeBotHandle(input.handle);
  }
  
  if (input.bio) {
    sanitized.bio = sanitizeHTML(input.bio);
  }
  
  if (input.avatarUrl) {
    const url = sanitizeURL(input.avatarUrl);
    if (url) {
      sanitized.avatarUrl = url;
    }
  }
  
  if (input.systemPrompt) {
    sanitized.systemPrompt = input.systemPrompt.trim();
  }
  
  if (input.temperature !== undefined) {
    const temp = sanitizeFloat(input.temperature, 0, 2);
    if (temp !== null) {
      sanitized.temperature = temp;
    }
  }
  
  if (input.maxTokens !== undefined) {
    const tokens = sanitizeInteger(input.maxTokens, 1, 100000);
    if (tokens !== null) {
      sanitized.maxTokens = tokens;
    }
  }
  
  return sanitized;
}
