/**
 * Regex cache for performance optimization.
 * Avoids repeatedly creating the same RegExp objects in hot parsing paths.
 */

const regexCache = new Map<string, RegExp>()

/**
 * Get a cached RegExp instance or create and cache a new one.
 * @param pattern - The regex pattern string
 * @param flags - Optional regex flags (e.g., 'gi', 'i')
 * @returns A RegExp instance with lastIndex reset to 0
 */
export function getCachedRegex(pattern: string, flags?: string): RegExp {
  const key = flags ? `${pattern}:::${flags}` : pattern
  let regex = regexCache.get(key)
  
  if (!regex) {
    regex = new RegExp(pattern, flags)
    regexCache.set(key, regex)
    
    // Limit cache size to prevent memory leaks
    if (regexCache.size > 200) {
      // Remove oldest 50 entries
      const keysToDelete = Array.from(regexCache.keys()).slice(0, 50)
      for (const keyToDelete of keysToDelete) {
        regexCache.delete(keyToDelete)
      }
    }
  }
  
  // Reset lastIndex for global/sticky regexes to ensure consistent behavior
  regex.lastIndex = 0
  
  return regex
}

/**
 * Clear the regex cache. Useful for testing or memory management.
 */
export function clearRegexCache(): void {
  regexCache.clear()
}
