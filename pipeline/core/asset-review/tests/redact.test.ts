import { describe, expect, it } from "vitest";
import { redactSecrets, redactValue } from "../src/redact.js";

describe("redactSecrets", () => {
  it("masks sk- keys", () => {
    expect(redactSecrets("key sk-abcdefgh12345678 here")).toBe("key sk-*** here");
  });

  it("masks apiKey, token, secret and authorization values in JSON", () => {
    const redacted = redactSecrets(
      JSON.stringify({
        apiKey: "api-key-value",
        api_key: "snake-key-value",
        accessToken: "access-token-value",
        token: "token-value",
        clientSecret: "client-secret-value",
        authorization: "Bearer authorization-value",
      })
    );

    for (const secret of [
      "api-key-value",
      "snake-key-value",
      "access-token-value",
      "token-value",
      "client-secret-value",
      "authorization-value",
    ]) {
      expect(redacted).not.toContain(secret);
    }
    expect(JSON.parse(redacted)).toEqual({
      apiKey: "***",
      api_key: "***",
      accessToken: "***",
      token: "***",
      clientSecret: "***",
      authorization: "***",
    });
  });

  it("masks secrets inside JSON embedded in NDJSON text", () => {
    const line = JSON.stringify({
      type: "final",
      text: JSON.stringify({
        verdict: "pass",
        token: "tok_live_123456",
        secret: "s3cr3t-value",
      }),
    });

    const redacted = redactSecrets(line);

    expect(redacted).not.toContain("tok_live_123456");
    expect(redacted).not.toContain("s3cr3t-value");
    expect(JSON.parse(redacted)).toMatchObject({ type: "final" });
  });

  it("does not redact token counts", () => {
    const usage = '{"inputTokens":10,"totalTokens":30}';
    expect(redactSecrets(usage)).toBe(usage);
  });

  it("masks unquoted key-value forms", () => {
    expect(redactSecrets("token=abc secret: xyz Authorization: Bearer def")).toBe(
      "token=*** secret: *** Authorization: ***"
    );
  });

  it("keeps serialized JSON parseable when a value looks like a secret", () => {
    const redacted = redactSecrets(JSON.stringify({ reason: "Token: expired" }));
    expect(JSON.parse(redacted)).toEqual({ reason: "Token: ***" });
  });

  it("keeps arrays parseable when entries look like secrets", () => {
    const redacted = redactSecrets(
      JSON.stringify({ inconsistencies: ["authorization: missing"] })
    );
    expect(JSON.parse(redacted)).toEqual({ inconsistencies: ["authorization: ***"] });
  });

  it("redacts string leaves and sensitive keys recursively", () => {
    expect(
      redactValue({
        token: "tok_live",
        note: "Token: expired",
        count: 2,
        nested: ["secret: x"],
      })
    ).toEqual({
      token: "***",
      note: "Token: ***",
      count: 2,
      nested: ["secret: ***"],
    });
  });
});
