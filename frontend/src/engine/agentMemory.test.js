import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadMemory, saveMemory, extractAndSave, buildMemorySection } from "./agentMemory.js";

// ---------------------------------------------------------------------------
// Mock localStorage
// ---------------------------------------------------------------------------

const store = {};
const localStorageMock = {
  getItem: vi.fn((key) => store[key] ?? null),
  setItem: vi.fn((key, val) => { store[key] = val; }),
  removeItem: vi.fn((key) => { delete store[key]; }),
  clear: vi.fn(() => { for (const k in store) delete store[k]; }),
};
vi.stubGlobal("localStorage", localStorageMock);

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// loadMemory / saveMemory
// ---------------------------------------------------------------------------

describe("loadMemory", () => {
  it("returns empty structure when no data exists", () => {
    const mem = loadMemory();
    expect(mem).toEqual({ entries: [], updated_at: null });
  });

  it("returns stored memory", () => {
    const data = { entries: [{ id: "test", text: "hello", score: 1 }], updated_at: "2026-03-31" };
    store["siljangnim:memory"] = JSON.stringify(data);
    const mem = loadMemory();
    expect(mem.entries).toHaveLength(1);
    expect(mem.entries[0].id).toBe("test");
  });
});

describe("saveMemory", () => {
  it("persists memory to localStorage with updated_at", () => {
    const mem = { entries: [{ id: "a", text: "b", score: 1 }], updated_at: null };
    saveMemory(mem);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "siljangnim:memory",
      expect.any(String),
    );
    const saved = JSON.parse(store["siljangnim:memory"]);
    expect(saved.updated_at).toBeTruthy();
    expect(saved.entries).toHaveLength(1);
  });

  it("prunes entries over MAX_ENTRIES (20)", () => {
    const entries = Array.from({ length: 25 }, (_, i) => ({
      id: `item-${i}`,
      text: `item ${i}`,
      score: i,
      created: "2026-01-01",
      updated: "2026-01-01",
    }));
    const mem = { entries, updated_at: null };
    saveMemory(mem);
    const saved = JSON.parse(store["siljangnim:memory"]);
    expect(saved.entries.length).toBeLessThanOrEqual(20);
    // Highest scores should survive
    expect(saved.entries[0].score).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// extractAndSave
// ---------------------------------------------------------------------------

describe("extractAndSave", () => {
  it("does nothing with empty chat history", () => {
    extractAndSave([]);
    expect(store["siljangnim:memory"]).toBeUndefined();
  });

  it("does nothing with only assistant messages", () => {
    extractAndSave([
      { role: "assistant", text: "I created a particle system" },
    ]);
    expect(store["siljangnim:memory"]).toBeUndefined();
  });

  it("extracts technique keywords from user messages", () => {
    extractAndSave([
      { role: "user", text: "particle system with perlin noise" },
      { role: "assistant", text: "Here is your scene" },
    ]);
    const mem = JSON.parse(store["siljangnim:memory"]);
    const ids = mem.entries.map((e) => e.id);
    expect(ids).toContain("technique:particle systems");
    expect(ids).toContain("technique:perlin noise");
  });

  it("extracts backend preference", () => {
    extractAndSave([
      { role: "user", text: "webgpu compute shader please" },
    ]);
    const mem = JSON.parse(store["siljangnim:memory"]);
    const ids = mem.entries.map((e) => e.id);
    expect(ids).toContain("backend:webgpu");
  });

  it("extracts style preferences", () => {
    extractAndSave([
      { role: "user", text: "dark minimal geometric pattern" },
    ]);
    const mem = JSON.parse(store["siljangnim:memory"]);
    const ids = mem.entries.map((e) => e.id);
    expect(ids).toContain("style:dark themes");
    expect(ids).toContain("style:minimal / clean aesthetics");
    expect(ids).toContain("style:geometric patterns");
  });

  it("extracts hex color palette when 2+ colors present", () => {
    extractAndSave([
      { role: "user", text: "use colors #1a1a2e and #e94560 and #16213e" },
    ]);
    const mem = JSON.parse(store["siljangnim:memory"]);
    const paletteEntry = mem.entries.find((e) => e.id === "palette:favorites");
    expect(paletteEntry).toBeTruthy();
    expect(paletteEntry.text).toContain("#1a1a2e");
    expect(paletteEntry.text).toContain("#e94560");
  });

  it("does not extract palette with only 1 color", () => {
    extractAndSave([
      { role: "user", text: "use color #ff0000" },
    ]);
    const mem = JSON.parse(store["siljangnim:memory"]);
    const paletteEntry = mem.entries.find((e) => e.id === "palette:favorites");
    expect(paletteEntry).toBeUndefined();
  });

  it("extracts Korean language preference", () => {
    extractAndSave([
      { role: "user", text: "파티클 시스템 만들어줘" },
    ]);
    const mem = JSON.parse(store["siljangnim:memory"]);
    const langEntry = mem.entries.find((e) => e.id === "lang:korean");
    expect(langEntry).toBeTruthy();
  });

  it("extracts Japanese language preference", () => {
    extractAndSave([
      { role: "user", text: "パーティクルシステムを作って" },
    ]);
    const mem = JSON.parse(store["siljangnim:memory"]);
    const langEntry = mem.entries.find((e) => e.id === "lang:japanese");
    expect(langEntry).toBeTruthy();
  });

  it("accumulates scores across multiple sessions", () => {
    extractAndSave([
      { role: "user", text: "particle effect" },
    ]);
    const mem1 = JSON.parse(store["siljangnim:memory"]);
    const score1 = mem1.entries.find((e) => e.id === "technique:particle systems").score;

    extractAndSave([
      { role: "user", text: "another particle thing" },
    ]);
    const mem2 = JSON.parse(store["siljangnim:memory"]);
    const score2 = mem2.entries.find((e) => e.id === "technique:particle systems").score;

    expect(score2).toBeGreaterThan(score1);
  });

  it("handles multiple user messages in one session", () => {
    extractAndSave([
      { role: "user", text: "I want fluid simulation" },
      { role: "assistant", text: "Sure" },
      { role: "user", text: "add bloom effect too" },
      { role: "assistant", text: "Done" },
    ]);
    const mem = JSON.parse(store["siljangnim:memory"]);
    const ids = mem.entries.map((e) => e.id);
    expect(ids).toContain("technique:fluid simulation");
    expect(ids).toContain("technique:bloom / glow effects");
  });
});

// ---------------------------------------------------------------------------
// buildMemorySection
// ---------------------------------------------------------------------------

describe("buildMemorySection", () => {
  it("returns empty string when no memory exists", () => {
    expect(buildMemorySection()).toBe("");
  });

  it("returns formatted section with entries", () => {
    const data = {
      entries: [
        { id: "technique:particle systems", text: "Frequently uses: particle systems", score: 5 },
        { id: "backend:webgpu", text: "Preferred backend: webgpu", score: 3 },
      ],
      updated_at: "2026-03-31",
    };
    store["siljangnim:memory"] = JSON.stringify(data);

    const section = buildMemorySection();
    expect(section).toContain("## USER PREFERENCES (from past sessions)");
    expect(section).toContain("- Frequently uses: particle systems");
    expect(section).toContain("- Preferred backend: webgpu");
  });

  it("sorts by score descending and limits to top 10", () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({
      id: `item-${i}`,
      text: `Item ${i}`,
      score: i,
    }));
    store["siljangnim:memory"] = JSON.stringify({ entries, updated_at: "2026-03-31" });

    const section = buildMemorySection();
    // Top score (14) should be present, low score (0) should not
    expect(section).toContain("Item 14");
    expect(section).not.toContain("Item 0");
    // Count lines starting with "- "
    const lines = section.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(10);
  });
});
