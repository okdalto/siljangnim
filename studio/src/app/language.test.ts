import { describe, expect, it } from "vitest";
import { resolveLanguage, systemLanguage } from "./language";

describe("language", () => {
  it("takes the first preferred language it has text for", () => {
    expect(systemLanguage(["ko-KR", "en-US"])).toBe("ko");
    expect(systemLanguage(["en-GB", "ko"])).toBe("en");
    expect(systemLanguage(["ja-JP", "ko-KR"])).toBe("ko");
    expect(systemLanguage(["ja-JP"])).toBe("en");
    expect(systemLanguage([])).toBe("en");
  });

  it("lets the setting override the system", () => {
    expect(resolveLanguage("en", ["ko-KR"])).toBe("en");
    expect(resolveLanguage("ko", ["en-US"])).toBe("ko");
    expect(resolveLanguage("auto", ["ko-KR"])).toBe("ko");
    expect(resolveLanguage(undefined, ["en-US"])).toBe("en");
  });
});
