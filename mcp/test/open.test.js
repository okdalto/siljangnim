import assert from "node:assert/strict";
import { test } from "node:test";
import { appBrowserCandidates, findAppBrowser } from "../src/open.js";

test("prefers Chrome, then Edge, and finds nothing when none is installed", () => {
  const mac = appBrowserCandidates("darwin", {});
  assert.match(mac[0], /Google Chrome$/);
  const edge = mac.find((p) => p.includes("Microsoft Edge"));
  assert.equal(findAppBrowser("darwin", {}, (p) => p === edge), edge);
  assert.equal(findAppBrowser("darwin", {}, () => false), null);
});

test("looks in the Windows install folders and on the Linux PATH", () => {
  const win = appBrowserCandidates("win32", { LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local", PROGRAMFILES: "C:\\Program Files" });
  assert.ok(win.includes("C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"));
  const linux = appBrowserCandidates("linux", { PATH: "/usr/bin:/snap/bin" });
  assert.ok(linux.includes("/snap/bin/chromium"));
  assert.equal(appBrowserCandidates("linux", {}).length, 0);
});
