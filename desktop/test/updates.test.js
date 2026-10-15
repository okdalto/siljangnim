import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUpdates, newerVersion, releaseInfo, RELEASES_URL } from '../src/updates.js';
const tag = 'v0.2.12';
const name = 'Siljangnim-0.2.12-mac-arm64.dmg';
const url = `https://github.com/okdalto/siljangnim/releases/download/${tag}/${name}`;
const release = () => ({ tag_name: tag, draft: false, prerelease: false, assets: [{ name, state: 'uploaded', size: 100, browser_download_url: url }] });
test('compares numeric versions and never offers downgrades or prereleases', () => {
  assert.equal(newerVersion('v0.2.11', '0.2.9'), true);
  assert.equal(newerVersion('v1.0.0', '0.99.99'), true);
  for (const v of ['v0.2.11','v0.2.10','v0.2.12-beta','oops']) assert.equal(newerVersion(v, '0.2.11'), false);
});
test('selects only the exact installer for this version, platform and architecture', () => {
  assert.equal(releaseInfo(release(),'0.2.11','darwin','arm64').downloadUrl,url);
  for (const [platform,arch] of [['darwin','x64'],['linux','x64'],['win32','arm64'],['win32','x64']]) assert.equal(releaseInfo(release(),'0.2.11',platform,arch).downloadUrl,null);
  const r=release();r.assets[0].name='Siljangnim-0.2.12-win-x64.exe';r.assets[0].browser_download_url=`https://github.com/okdalto/siljangnim/releases/download/${tag}/${r.assets[0].name}`;
  assert.ok(releaseInfo(r,'0.2.11','win32','x64').downloadUrl.endsWith('.exe'));
});
test('rejects draft metadata and unsafe or mismatched asset URLs', () => {
  assert.throws(()=>releaseInfo({...release(),draft:true},'0.2.11','darwin','arm64'));
  assert.throws(()=>releaseInfo({...release(),prerelease:true},'0.2.11','darwin','arm64'));
  for(const bad of ['https://evil.test/file.dmg',url+'?redirect=bad',url.replace('okdalto','other'),'file:///tmp/test']) {
    const r=release();r.assets[0].browser_download_url=bad;assert.equal(releaseInfo(r,'0.2.11','darwin','arm64').downloadUrl,null);
  }
});
test('checks once for concurrent requests and opens only the verified download', async () => {
  const opened=[];let calls=0;
  const u=createUpdates({currentVersion:'0.2.11',platform:'darwin',arch:'arm64',fetchImpl:async()=>{calls++;return {ok:true,json:async()=>release()};},openExternal:async u=>opened.push(u)});
  await assert.rejects(u.download());
  const [a,b]=await Promise.all([u.check(),u.check()]);assert.deepEqual(a,b);assert.equal(calls,1);assert.equal(a.available,true);
  await u.download();await u.releases();assert.deepEqual(opened,[url,RELEASES_URL]);
});
test('failures clear stale download state and allow retry', async () => {
  let fail=false;
  const u=createUpdates({currentVersion:'0.2.11',platform:'darwin',arch:'arm64',fetchImpl:async()=>fail?{ok:false,status:403}:{ok:true,json:async()=>release()},openExternal:async()=>{}});
  await u.check();fail=true;await assert.rejects(u.check(),/limiting/);await assert.rejects(u.download());fail=false;assert.equal((await u.check()).available,true);
});
test('offline, timeout and malformed responses never claim up to date', async () => {
  for(const fetchImpl of [async()=>{throw new Error('offline');},async()=>{throw new DOMException('timeout','TimeoutError');},async()=>({ok:true,json:async()=>({})})]) {
    const u=createUpdates({currentVersion:'0.2.11',platform:'darwin',arch:'arm64',fetchImpl,openExternal:async()=>{}});await assert.rejects(u.check());await assert.rejects(u.download());
  }
});
