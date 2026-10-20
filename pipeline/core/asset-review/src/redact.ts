const SK_KEY = /sk-[A-Za-z0-9_-]{8,}/g;

/**
 * Matches `key: value` / `key=value` for credential-bearing keys. Quoted
 * values keep their opening/closing quote and any JSON escape prefix, and
 * unquoted values stop at JSON/NDJSON delimiters, so redacting serialized
 * text never consumes a string boundary.
 */
const SECRET_KEY_VALUE =
  /((?:\\*["'])?(?:api[_-]?key|[A-Za-z0-9_-]*(?:token|secret)|authorization)(?:\\*["'])?\s*[:=]\s*)(?:(\\*)(")((?:[^"\\\n]|\\.)*?)\2\3|(\\*)(')((?:[^'\\\n]|\\.)*?)\5\6|(?:bearer\s+|basic\s+)?[^\s,;}\]"'\\{}]+)/gi;

const SECRET_KEY_NAME = /(?:api[_-]?key|token|secret|authorization)$/i;

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

/**
 * Redact a value before serializing it. String leaves go through
 * `redactSecrets`; values under credential-named keys are replaced outright.
 * Redacting the object (not its serialized form) keeps JSON parseable.
 */
export function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEY_NAME.test(key) && (entry === null || typeof entry !== "object")
        ? "***"
        : redactValue(entry),
    ])
  );
}
