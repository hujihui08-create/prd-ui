const SK_KEY = /sk-[A-Za-z0-9_-]{8,}/g;

/**
 * Matches `key: value` / `key=value` for credential-bearing keys. Quoted
 * values keep their opening/closing quote and any JSON escape prefix, so
 * redacting a serialized event or NDJSON output leaves it parseable.
 */
const SECRET_KEY_VALUE =
  /((?:\\*["'])?(?:api[_-]?key|[A-Za-z0-9_-]*(?:token|secret)|authorization)(?:\\*["'])?\s*[:=]\s*)(?:(\\*)(")((?:[^"\\\n]|\\.)*?)\2\3|(\\*)(')((?:[^'\\\n]|\\.)*?)\5\6|(?:bearer\s+|basic\s+)?[^\s,;}]+)/gi;

/** Remove credentials from text before it reaches a log or evidence file. */
export function redactSecrets(text: string): string {
  return text
    .replace(
      SECRET_KEY_VALUE,
      (
        _match,
        prefix: string,
        doubleSlashes: string,
        doubleQuote: string,
        _doubleValue: string,
        singleSlashes: string,
        singleQuote: string
      ) => {
        if (doubleQuote !== undefined) {
          return `${prefix}${doubleSlashes}${doubleQuote}***${doubleSlashes}${doubleQuote}`;
        }
        if (singleQuote !== undefined) {
          return `${prefix}${singleSlashes}${singleQuote}***${singleSlashes}${singleQuote}`;
        }
        return `${prefix}***`;
      }
    )
    .replace(SK_KEY, "sk-***");
}
