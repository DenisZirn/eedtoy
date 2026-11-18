'use strict';

/**
 * EEDTOY stable-release updater. All network access and executable launching
 * belong to the Electron main process, not to the untrusted renderer.
 *
 * Only published, non-prerelease GitHub releases are considered. The installer
 * name, download origin, content length and GitHub SHA-256 digest are verified
 * before an installer path is returned.
 */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const RELEASE_API_URL = 'https://api.github.com/repos/DenisZirn/eedtoy/releases/latest';
const RELEASE_DOWNLOAD_PREFIX = 'https://github.com/DenisZirn/eedtoy/releases/download/';
const APPROVED_HOSTS = new Set([
  'api.github.com',
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
]);
const MAX_INSTALLER_BYTES = 400 * 1024 * 1024;
const CHECK_TIMEOUT_MS = 10000;
const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;

function parseVersion(input) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/i.exec(String(input || '').trim());
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) throw new Error('Ungueltige Update-Versionsnummer');
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

function approvedUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Ungueltige GitHub-Downloadadresse');
  }
  if (
    url.protocol !== 'https:' ||
    url.username || url.password ||
    !APPROVED_HOSTS.has(url.hostname.toLowerCase())
  ) {
    throw new Error('Update-Weiterleitung auf einen nicht freigegebenen Host blockiert');
  }
  return url;
}

async function fetchWithApprovedRedirects(url, { fetchImpl = globalThis.fetch, signal, headers = {} } = {}) {
  let current = String(url);
  for (let index = 0; index <= 6; index += 1) {
    approvedUrl(current);
    const response = await fetchImpl(current, {
      method: 'GET',
      headers: { 'User-Agent': 'EEDTOY-Release-Updater', ...headers },
      signal,
      redirect: 'manual',
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers?.get('location');
      if (!location) throw new Error('GitHub-Weiterleitung ohne Ziel');
      current = new URL(location, current).toString();
      await response.body?.cancel?.();
      continue;
    }
    return response;
  }
  throw new Error('Zu viele GitHub-Weiterleitungen');
}

function selectWindowsAsset(release) {
  const version = String(release?.tag_name || '').replace(/^v/i, '');
  if (!parseVersion(version) || release.draft || release.prerelease) return null;
  const name = `EEDTOY-Setup-${version}.exe`;
  const asset = (Array.isArray(release.assets) ? release.assets : [])
    .find(candidate => candidate.name === name);
  if (!asset) return null;

  const expectedUrl = RELEASE_DOWNLOAD_PREFIX + encodeURIComponent(String(release.tag_name)) + '/' + encodeURIComponent(name);
  if (asset.browser_download_url !== expectedUrl) {
    throw new Error('GitHub-Installeradresse passt nicht zum Release');
  }
  const size = Number(asset.size);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_INSTALLER_BYTES) {
    throw new Error('Ungueltige Installer-Dateigroesse');
  }
  const digest = String(asset.digest || '');
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest)) {
    throw new Error('SHA-256-Pruefsumme des Installers fehlt');
  }
  return { name, url: expectedUrl, size, digest: digest.slice(7).toLowerCase() };
}

async function checkLatestStableRelease(installedVersion, {
  platform = process.platform,
  fetchImpl = globalThis.fetch,
  timeoutMs = CHECK_TIMEOUT_MS,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithApprovedRedirects(RELEASE_API_URL, {
      fetchImpl,
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    const release = await response.json();
    const version = String(release?.tag_name || '').replace(/^v/i, '');
    if (!parseVersion(version) || release.draft || release.prerelease) {
      throw new Error('Kein gueltiges stabiles EEDTOY-Release erhalten');
    }
    const hasUpdate = compareVersions(version, installedVersion) > 0;
    return {
      hasUpdate,
      installedVersion,
      version,
      releaseUrl: release.html_url,
      asset: hasUpdate && platform === 'win32' ? selectWindowsAsset(release) : null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function downloadVerifiedInstaller(update, {
  destinationDir,
  fetchImpl = globalThis.fetch,
  onProgress = () => {},
  timeoutMs = DOWNLOAD_TIMEOUT_MS,
} = {}) {
  const asset = update?.asset;
  if (!asset || !destinationDir || !/^EEDTOY-Setup-\d+\.\d+\.\d+\.exe$/.test(asset.name)) {
    throw new Error('Kein gueltiger Windows-Installer vorhanden');
  }
  approvedUrl(asset.url);
  if (!asset.url.startsWith(RELEASE_DOWNLOAD_PREFIX)) {
    throw new Error('Installer stammt nicht aus dem EEDTOY-Repository');
  }

  const folder = path.join(destinationDir, `v${update.version}`);
  const finalPath = path.join(folder, asset.name);
  const temporaryPath = path.join(folder, `.${asset.name}.${process.pid}.partial`);
  await fsp.mkdir(folder, { recursive: true });

  try {
    const previous = await fsp.stat(finalPath);
    if (previous.size === asset.size && await sha256File(finalPath) === asset.digest) {
      onProgress(1);
      return finalPath;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let received = 0;
  const digest = createHash('sha256');
  let lastProgress = 0;

  try {
    await fsp.rm(temporaryPath, { force: true });
    const response = await fetchWithApprovedRedirects(asset.url, {
      fetchImpl,
      signal: controller.signal,
      headers: { Accept: 'application/octet-stream' },
    });
    if (!response.ok || !response.body) throw new Error(`Installer-Download: HTTP ${response.status}`);
    const contentLength = Number(response.headers?.get('content-length') || 0);
    if (contentLength && contentLength !== asset.size) throw new Error('Installer-Groesse weicht vom Release ab');

    const hasher = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        if (received > asset.size || received > MAX_INSTALLER_BYTES) {
          callback(new Error('Installer-Download ueberschreitet erwartete Groesse'));
          return;
        }
        digest.update(chunk);
        const progress = received / asset.size;
        if (progress - lastProgress >= 0.01 || received === asset.size) {
          lastProgress = progress;
          onProgress(progress);
        }
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body),
      hasher,
      fs.createWriteStream(temporaryPath, { flags: 'wx' }),
      { signal: controller.signal },
    );
    if (received !== asset.size || digest.digest('hex') !== asset.digest) {
      throw new Error('SHA-256/Dateigroesse des Installers stimmt nicht mit GitHub ueberein');
    }
    await fsp.rm(finalPath, { force: true });
    await fsp.rename(temporaryPath, finalPath);
    onProgress(1);
    return finalPath;
  } catch (error) {
    await fsp.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  RELEASE_API_URL,
  MAX_INSTALLER_BYTES,
  parseVersion,
  compareVersions,
  approvedUrl,
  selectWindowsAsset,
  checkLatestStableRelease,
  downloadVerifiedInstaller,
  fetchWithApprovedRedirects,
};
