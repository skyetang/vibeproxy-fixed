const { app, BrowserWindow, Tray, Menu, nativeImage, clipboard, Notification, shell, net, session } = require('electron');
const remoteMain = require('@electron/remote/main');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');

remoteMain.initialize();

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) { app.quit(); }

// Constants
const PROXY_PORT = 8317;
const BACKEND_PORT = 8318;
const AUTH_DIR = path.join(os.homedir(), '.cli-proxy-api');
const CODEX_LOCAL_AUTH_FILE = path.join(os.homedir(), '.codex', 'auth.json');
const APP_VERSION = '1.5.1';
const CONFIG_FILE = path.join(AUTH_DIR, 'vibeproxy-config.json');

// State
let tray = null;
let settingsWindow = null;
let serverProcess = null;
let thinkingProxyServer = null;
let isServerRunning = false;
let enabledProviders = {};
let launchAtLogin = false;
let selectedAccounts = {};
let localProxyUrl = '';

// OAuth provider keys mapping (same as Swift version)
const OAUTH_PROVIDER_KEYS = {
  'claude': 'claude',
  'codex': 'codex',
  'gemini': 'gemini-cli',
  'github-copilot': 'github-copilot',
  'antigravity': 'antigravity',
  'qwen': 'qwen',
  'kiro': 'kiro',
  'zai': 'zai'
};

// ============== Utility Functions ==============

function ensureAuthDir() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }
}

function getSystemProxy() {
  try {
    const output = execSync('scutil --proxy', { encoding: 'utf8' });
    const httpEnabled = output.match(/HTTPEnable\s*:\s*1/);
    const httpProxy = output.match(/HTTPProxy\s*:\s*(\S+)/);
    const httpPort = output.match(/HTTPPort\s*:\s*(\d+)/);
    if (httpEnabled && httpProxy && httpPort) {
      return `http://${httpProxy[1]}:${httpPort[1]}`;
    }
  } catch (e) {}
  return null;
}

function getEnvProxy() {
  return process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    null;
}

function getResourcePath(filename) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, filename);
  }
  return path.join(__dirname, '..', filename);
}

function sanitizeFilenamePart(value, fallback = 'account') {
  const sanitized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || fallback;
}

function decodeJwtPayload(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
}

function readAppConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function writeAppConfig(config) {
  ensureAuthDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  try { fs.chmodSync(CONFIG_FILE, 0o600); } catch (e) {}
}

function normalizeProxyUrl(proxyUrl) {
  return String(proxyUrl || '').trim();
}

function getActiveProxyUrl() {
  return normalizeProxyUrl(localProxyUrl) || getEnvProxy() || getSystemProxy();
}

async function applyNetworkProxy() {
  if (!app.isReady()) {
    return;
  }
  
  const activeProxy = getActiveProxyUrl();
  if (activeProxy) {
    await session.defaultSession.setProxy({
      mode: 'fixed_servers',
      proxyRules: activeProxy,
      proxyBypassRules: '<local>;127.0.0.1;localhost'
    });
    console.log(`[Network] Using proxy: ${activeProxy}`);
  } else {
    await session.defaultSession.setProxy({ mode: 'direct' });
    console.log('[Network] Using direct connection');
  }
}

function saveSelectedAccounts() {
  try {
    const config = readAppConfig();
    config.launchAtLogin = launchAtLogin;
    config.selectedAccounts = selectedAccounts;
    config.localProxyUrl = localProxyUrl;
    writeAppConfig(config);
  } catch (e) {}
}

function mapAuthTypeToService(type) {
  const normalized = (type || '').toLowerCase();
  if (normalized === 'copilot') return 'github-copilot';
  if (normalized === 'gemini-cli' || normalized === 'gemini') return 'gemini';
  return normalized;
}

function readAuthFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeAuthFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  try { fs.chmodSync(filePath, 0o600); } catch (e) {}
}

function listAuthAccountEntries(serviceType = null) {
  const entries = [];
  ensureAuthDir();
  
  try {
    const files = fs.readdirSync(AUTH_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      try {
        const filePath = path.join(AUTH_DIR, file);
        const data = readAuthFile(filePath);
        const mappedType = mapAuthTypeToService(data.type);
        if (!mappedType) continue;
        if (serviceType && mappedType !== serviceType) continue;
        
        entries.push({
          id: file,
          filePath,
          type: mappedType,
          data
        });
      } catch (e) {}
    }
  } catch (e) {}
  
  return entries;
}

function getPreferredAccountId(serviceType, accounts) {
  if (serviceType !== 'codex') {
    return null;
  }
  
  const preferredId = selectedAccounts[serviceType];
  if (preferredId && accounts.some(account => account.id === preferredId)) {
    return preferredId;
  }
  
  const enabledAccounts = accounts.filter(account => !account.disabled);
  if (enabledAccounts.length === 1) {
    return enabledAccounts[0].id;
  }
  
  if (accounts.length === 1) {
    return accounts[0].id;
  }
  
  return null;
}

function parseDateValue(value) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseEpochSeconds(value) {
  const numeric = toNumber(value);
  if (numeric == null) return null;
  const date = new Date(numeric * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    if (/^-?\d+(\.\d+)?$/.test(normalized)) {
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  
  return null;
}

function normalizeLookupKey(key) {
  return String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function findFirstMatchingValue(root, keyNames) {
  const targets = new Set(keyNames.map(normalizeLookupKey));
  const visited = new Set();
  
  function walk(value) {
    if (!value || typeof value !== 'object') {
      return null;
    }
    if (visited.has(value)) {
      return null;
    }
    visited.add(value);
    
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = walk(item);
        if (found !== null) return found;
      }
      return null;
    }
    
    for (const [key, nested] of Object.entries(value)) {
      if (targets.has(normalizeLookupKey(key))) {
        return nested;
      }
    }
    
    for (const nested of Object.values(value)) {
      const found = walk(nested);
      if (found !== null) return found;
    }
    
    return null;
  }
  
  return walk(root);
}

function inferUsageCycle(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  
  const days = Math.round((end - start) / (24 * 60 * 60 * 1000));
  if (days >= 6 && days <= 8) return 'Weekly';
  if (days >= 27 && days <= 32) return 'Monthly';
  return `${days} days`;
}

function normalizeCodexUsageResponse(payload) {
  function normalizeWindow(window) {
    if (!window || typeof window !== 'object') return null;
    const usedPercent = toNumber(window.used_percent);
    return {
      usedPercent,
      remainingPercent: usedPercent == null ? null : Math.max(0, 100 - usedPercent),
      limitWindowSeconds: toNumber(window.limit_window_seconds),
      resetAfterSeconds: toNumber(window.reset_after_seconds),
      resetAt: parseEpochSeconds(window.reset_at)
    };
  }
  
  function normalizeLimit(limit) {
    if (!limit || typeof limit !== 'object') return null;
    return {
      allowed: limit.allowed !== false,
      limitReached: limit.limit_reached === true,
      primaryWindow: normalizeWindow(limit.primary_window),
      secondaryWindow: normalizeWindow(limit.secondary_window)
    };
  }
  
  const rateLimit = normalizeLimit(payload.rate_limit);
  const codeReviewRateLimit = normalizeLimit(payload.code_review_rate_limit);
  if (rateLimit || codeReviewRateLimit) {
    const primaryWindow = rateLimit && rateLimit.primaryWindow;
    const codeReviewWindow = codeReviewRateLimit && codeReviewRateLimit.primaryWindow;
    return {
      email: payload.email || null,
      accountId: payload.account_id || null,
      planType: payload.plan_type || null,
      rateLimit,
      codeReviewRateLimit,
      cycle: primaryWindow && primaryWindow.limitWindowSeconds
        ? `${Math.round(primaryWindow.limitWindowSeconds / 86400)} days`
        : null,
      usedPercent: primaryWindow ? primaryWindow.usedPercent : null,
      periodEnd: primaryWindow ? primaryWindow.resetAt : null,
      promo: payload.promo || null,
      credits: payload.credits || null,
      raw: payload
    };
  }
  
  const used = toNumber(findFirstMatchingValue(payload, [
    'currentUsageAmount',
    'usageAmount',
    'usedAmount',
    'usageUsed',
    'currentUsage',
    'totalUsage',
    'used'
  ]));
  const limit = toNumber(findFirstMatchingValue(payload, [
    'usageLimitWithPrecision',
    'usageLimit',
    'totalLimit',
    'limit',
    'quota',
    'max'
  ]));
  const remaining = toNumber(findFirstMatchingValue(payload, [
    'remainingAmount',
    'remainingUsage',
    'remaining',
    'availableAmount',
    'available',
    'left'
  ]));
  const start = parseDateValue(findFirstMatchingValue(payload, [
    'billingPeriodStart',
    'currentPeriodStart',
    'periodStart',
    'cycleStart',
    'startDate',
    'startsAt'
  ]));
  const end = parseDateValue(findFirstMatchingValue(payload, [
    'billingPeriodEnd',
    'currentPeriodEnd',
    'periodEnd',
    'cycleEnd',
    'resetDate',
    'resetAt',
    'resetsAt',
    'endDate'
  ]));
  const cycle = findFirstMatchingValue(payload, [
    'billingPeriod',
    'usagePeriod',
    'period',
    'cycle',
    'interval'
  ]);
  
  let normalizedUsed = used;
  let normalizedRemaining = remaining;
  if (normalizedUsed == null && limit != null && remaining != null) {
    normalizedUsed = Math.max(limit - remaining, 0);
  }
  if (normalizedRemaining == null && limit != null && used != null) {
    normalizedRemaining = Math.max(limit - used, 0);
  }
  
  return {
    used: normalizedUsed,
    remaining: normalizedRemaining,
    limit,
    periodStart: start,
    periodEnd: end,
    cycle: typeof cycle === 'string' && cycle.trim() ? cycle.trim() : inferUsageCycle(start, end),
    raw: payload
  };
}

function readCodexLocalAuth() {
  if (!fs.existsSync(CODEX_LOCAL_AUTH_FILE)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(CODEX_LOCAL_AUTH_FILE, 'utf8'));
}

function extractCodexLocalAuthMetadata(localAuth) {
  const tokens = localAuth && localAuth.tokens ? localAuth.tokens : {};
  const accessPayload = decodeJwtPayload(tokens.access_token);
  const idPayload = decodeJwtPayload(tokens.id_token);
  const accessAuth = accessPayload && accessPayload['https://api.openai.com/auth'];
  const accessProfile = accessPayload && accessPayload['https://api.openai.com/profile'];
  const idAuth = idPayload && idPayload['https://api.openai.com/auth'];
  
  const email = (idPayload && idPayload.email) ||
    (accessProfile && accessProfile.email) ||
    localAuth.email ||
    'codex-user';
  const accountId = tokens.account_id ||
    (accessAuth && accessAuth.chatgpt_account_id) ||
    (idAuth && idAuth.chatgpt_account_id) ||
    null;
  const expired = accessPayload && accessPayload.exp
    ? new Date(accessPayload.exp * 1000).toISOString()
    : null;
  const planType = (idAuth && idAuth.chatgpt_plan_type) ||
    (accessAuth && accessAuth.chatgpt_plan_type) ||
    'account';
  
  return {
    email,
    accountId,
    expired,
    planType
  };
}

// ============== Provider Management ==============

function loadEnabledProviders() {
  try {
    const configPath = path.join(AUTH_DIR, 'enabled-providers.json');
    if (fs.existsSync(configPath)) {
      enabledProviders = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    enabledProviders = {};
  }
}

function saveEnabledProviders() {
  try {
    ensureAuthDir();
    fs.writeFileSync(path.join(AUTH_DIR, 'enabled-providers.json'), JSON.stringify(enabledProviders, null, 2));
  } catch (e) {}
}

// ============== Launch at Login ==============

function loadLaunchAtLogin() {
  try {
    const config = readAppConfig();
    launchAtLogin = config.launchAtLogin || false;
    selectedAccounts = config.selectedAccounts || {};
    localProxyUrl = normalizeProxyUrl(config.localProxyUrl || '');
  } catch (e) {
    launchAtLogin = false;
    selectedAccounts = {};
    localProxyUrl = '';
  }
  // Sync with system
  app.setLoginItemSettings({ openAtLogin: launchAtLogin });
}

function setLaunchAtLogin(enabled) {
  launchAtLogin = enabled;
  app.setLoginItemSettings({ openAtLogin: enabled });
  // Save to config
  try {
    const config = readAppConfig();
    config.launchAtLogin = enabled;
    config.selectedAccounts = selectedAccounts;
    config.localProxyUrl = localProxyUrl;
    writeAppConfig(config);
  } catch (e) {}
  console.log(`[Config] Launch at login: ${enabled}`);
}

function getLaunchAtLogin() {
  return launchAtLogin;
}

function getLocalProxyUrl() {
  return localProxyUrl;
}

async function setLocalProxyUrl(proxyUrl) {
  try {
    localProxyUrl = normalizeProxyUrl(proxyUrl);
    const config = readAppConfig();
    config.launchAtLogin = launchAtLogin;
    config.selectedAccounts = selectedAccounts;
    config.localProxyUrl = localProxyUrl;
    writeAppConfig(config);
    await applyNetworkProxy();
    return { success: true, proxyUrl: localProxyUrl };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function isProviderEnabled(key) {
  return enabledProviders[key] !== false;
}

function setProviderEnabled(key, enabled) {
  enabledProviders[key] = enabled;
  saveEnabledProviders();
  // Regenerate config for hot reload
  getConfigPath();
  console.log(`[Config] Provider ${key} ${enabled ? 'enabled' : 'disabled'}`);
}

// ============== Kiro Token Import & Auto-Sync ==============

function checkKiroToken() {
  const kiroTokenPath = path.join(os.homedir(), '.aws/sso/cache/kiro-auth-token.json');
  return fs.existsSync(kiroTokenPath);
}

function syncKiroTokenFromIDE() {
  try {
    const kiroTokenPath = path.join(os.homedir(), '.aws/sso/cache/kiro-auth-token.json');
    
    if (!fs.existsSync(kiroTokenPath)) {
      return { success: false, error: 'Kiro IDE token not found' };
    }
    
    // Read latest token from Kiro IDE
    const kiroToken = JSON.parse(fs.readFileSync(kiroTokenPath, 'utf8'));
    
    // Check if Kiro IDE token is also expired
    const kiroExpired = new Date(kiroToken.expiresAt) < new Date();
    if (kiroExpired) {
      console.log('[Kiro] Kiro IDE token is also expired, skipping sync');
      return { success: false, error: 'Kiro IDE token expired' };
    }
    
    // Find existing Kiro auth files
    ensureAuthDir();
    const files = fs.readdirSync(AUTH_DIR);
    let updated = 0;
    
    for (const file of files) {
      if (file.startsWith('kiro-') && file.endsWith('.json')) {
        try {
          const filePath = path.join(AUTH_DIR, file);
          const authData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          
          // Only update if imported from IDE and token is different
          if (authData.imported_from === 'kiro-ide') {
            const needsUpdate = authData.access_token !== kiroToken.accessToken ||
                               authData.refresh_token !== kiroToken.refreshToken;
            
            if (needsUpdate) {
              authData.access_token = kiroToken.accessToken || kiroToken.token;
              authData.refresh_token = kiroToken.refreshToken;
              authData.expired = kiroToken.expiresAt;
              authData.last_synced = new Date().toISOString();
              
              fs.writeFileSync(filePath, JSON.stringify(authData, null, 2));
              fs.chmodSync(filePath, 0o600);
              updated++;
              console.log(`[Kiro] Synced token from IDE: ${file} (expires: ${kiroToken.expiresAt})`);
            }
          }
        } catch (e) {
          console.error(`[Kiro] Failed to sync ${file}:`, e.message);
        }
      }
    }
    
    if (updated > 0) {
      getConfigPath(); // Regenerate config
      return { success: true, updated };
    }
    
    return { success: false, error: 'No updates needed' };
  } catch (e) {
    console.error('[Kiro] Sync failed:', e);
    return { success: false, error: e.message };
  }
}

function startKiroAutoSync() {
  // Initial sync
  const initialResult = syncKiroTokenFromIDE();
  if (initialResult.success) {
    console.log(`[Kiro] Initial sync completed: ${initialResult.updated} token(s) updated`);
  } else {
    console.log(`[Kiro] Initial sync: ${initialResult.error}`);
  }
  
  // Sync every 5 minutes (more frequent to catch Kiro IDE refreshes)
  setInterval(() => {
    const result = syncKiroTokenFromIDE();
    if (result.success) {
      console.log(`[Kiro] Auto-sync completed: ${result.updated} token(s) updated`);
      // Restart server to reload tokens
      if (isServerRunning) {
        console.log('[Kiro] Reloading server with updated tokens...');
        stopBackendServer().then(() => {
          setTimeout(() => startBackendServer(), 1000);
        });
      }
    } else if (result.error !== 'No updates needed') {
      console.log(`[Kiro] Auto-sync: ${result.error}`);
    }
  }, 5 * 60 * 1000); // 5 minutes
  
  console.log('[Kiro] Auto-sync enabled (every 5 minutes)');
}

function importKiroToken() {
  try {
    const kiroTokenPath = path.join(os.homedir(), '.aws/sso/cache/kiro-auth-token.json');
    
    if (!fs.existsSync(kiroTokenPath)) {
      return { success: false, error: 'Kiro token not found. Please login to Kiro IDE first.' };
    }
    
    // Read Kiro token
    const kiroToken = JSON.parse(fs.readFileSync(kiroTokenPath, 'utf8'));
    
    // Create auth file for CLIProxyAPIPlus
    // CLIProxyAPIPlus expects 'access_token' and 'refresh_token' for auto-refresh
    ensureAuthDir();
    const filename = `kiro-${Date.now()}.json`;
    const authData = {
      type: 'kiro',
      email: kiroToken.email || 'kiro-user',
      access_token: kiroToken.accessToken || kiroToken.token,
      refresh_token: kiroToken.refreshToken,  // Add refresh token for auto-renewal
      expired: kiroToken.expiresAt,
      created: new Date().toISOString(),
      imported_from: 'kiro-ide'
    };
    
    const filePath = path.join(AUTH_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(authData, null, 2));
    fs.chmodSync(filePath, 0o600);
    
    console.log(`[Kiro] Token imported from Kiro IDE with refresh token: ${filename}`);
    
    // Regenerate config
    getConfigPath();
    
    return { success: true };
  } catch (e) {
    console.error('[Kiro] Import failed:', e);
    return { success: false, error: e.message };
  }
}

// ============== Config Management ==============

function getConfigPath() {
  const bundledConfig = getResourcePath('config.yaml');
  ensureAuthDir();
  
  // Collect Z.AI keys
  const zaiKeys = [];
  const files = fs.readdirSync(AUTH_DIR);
  for (const file of files) {
    if (file.startsWith('zai-') && file.endsWith('.json')) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, file), 'utf8'));
        if (data.api_key) zaiKeys.push(data.api_key);
      } catch (e) {}
    }
  }
  
  // Collect disabled providers
  const disabledProviders = [];
  for (const [serviceKey, oauthKey] of Object.entries(OAUTH_PROVIDER_KEYS)) {
    if (!isProviderEnabled(serviceKey)) {
      disabledProviders.push(oauthKey);
    }
  }
  
  // If no modifications needed, use bundled config
  if (zaiKeys.length === 0 && disabledProviders.length === 0) {
    return bundledConfig;
  }
  
  // Generate merged config
  let config = fs.readFileSync(bundledConfig, 'utf8');
  
  // Add disabled providers exclusion
  if (disabledProviders.length > 0) {
    config += '\n# Provider exclusions (auto-added by VibeProxy)\noauth-excluded-models:\n';
    for (const provider of disabledProviders.sort()) {
      config += `  ${provider}:\n    - "*"\n`;
    }
  }
  
  // Add Z.AI config if enabled
  if (zaiKeys.length > 0 && isProviderEnabled('zai')) {
    config += '\n# Z.AI GLM Provider (auto-added by VibeProxy)\nopenai-compatibility:\n';
    config += '  - name: "zai"\n    base-url: "https://api.z.ai/api/coding/paas/v4"\n    api-key-entries:\n';
    for (const key of zaiKeys) {
      config += `      - api-key: "${key.replace(/"/g, '\\"')}"\n`;
    }
    config += '    models:\n      - name: "glm-4.7"\n        alias: "glm-4.7"\n';
  }
  
  const mergedPath = path.join(AUTH_DIR, 'merged-config.yaml');
  fs.writeFileSync(mergedPath, config);
  fs.chmodSync(mergedPath, 0o600);
  return mergedPath;
}

// ============== Auth Account Management ==============

function getAuthAccounts() {
  const accounts = [];
  
  for (const entry of listAuthAccountEntries()) {
    const data = entry.data;
    
    let expired = false;
    if (data.expired) {
      try {
        const expDate = new Date(data.expired);
        expired = expDate < new Date();
      } catch (e) {}
    }
    
    accounts.push({
      id: entry.id,
      type: entry.type,
      email: data.email || data.login || entry.id,
      login: data.login,
      expired,
      expiredDate: data.expired,
      disabled: data.disabled === true,
      selected: false,
      path: entry.filePath
    });
  }
  
  const serviceTypes = [...new Set(accounts.map(account => account.type))];
  for (const serviceType of serviceTypes) {
    const serviceAccounts = accounts.filter(account => account.type === serviceType);
    const selectedId = getPreferredAccountId(serviceType, serviceAccounts);
    for (const account of serviceAccounts) {
      account.selected = account.id === selectedId;
    }
  }
  
  return accounts;
}

function deleteAccount(filePath) {
  try {
    const filename = path.basename(filePath);
    let deletedType = null;
    
    try {
      deletedType = mapAuthTypeToService(readAuthFile(filePath).type);
    } catch (e) {}
    
    fs.unlinkSync(filePath);
    
    if (deletedType === 'codex' && selectedAccounts.codex === filename) {
      const remaining = listAuthAccountEntries('codex');
      if (remaining.length > 0) {
        const fallback = remaining.find(entry => entry.data.disabled !== true) || remaining[0];
        selectedAccounts.codex = fallback.id;
        for (const entry of remaining) {
          entry.data.disabled = entry.id !== fallback.id;
          writeAuthFile(entry.filePath, entry.data);
        }
      } else {
        delete selectedAccounts.codex;
      }
      saveSelectedAccounts();
      getConfigPath();
    }
    
    return true;
  } catch (e) {
    return false;
  }
}

function saveZaiApiKey(apiKey) {
  ensureAuthDir();
  const keyPreview = apiKey.substring(0, 8) + '...' + apiKey.slice(-4);
  const filename = `zai-${Date.now()}.json`;
  const data = {
    type: 'zai',
    email: keyPreview,
    api_key: apiKey,
    created: new Date().toISOString()
  };
  
  const filePath = path.join(AUTH_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  fs.chmodSync(filePath, 0o600);
  
  // Regenerate config
  getConfigPath();
  return true;
}

function checkCodexLocalAuth() {
  try {
    const localAuth = readCodexLocalAuth();
    return !!(localAuth &&
      localAuth.auth_mode === 'chatgpt' &&
      localAuth.tokens &&
      localAuth.tokens.access_token);
  } catch (e) {
    return false;
  }
}

function getCodexLocalAuthPath() {
  return CODEX_LOCAL_AUTH_FILE;
}

function importCodexLocalAuth() {
  try {
    const localAuth = readCodexLocalAuth();
    if (!localAuth) {
      return { success: false, error: 'Local Codex auth not found at ~/.codex/auth.json' };
    }
    
    if (localAuth.auth_mode !== 'chatgpt') {
      return { success: false, error: `Unsupported Codex auth mode: ${localAuth.auth_mode || 'unknown'}` };
    }
    
    if (!localAuth.tokens || !localAuth.tokens.access_token) {
      return { success: false, error: 'Local Codex auth is missing an access token' };
    }
    
    const metadata = extractCodexLocalAuthMetadata(localAuth);
    const existingCodexAccounts = listAuthAccountEntries('codex');
    const existingEntry = existingCodexAccounts.find((entry) =>
      (metadata.accountId && entry.data.account_id === metadata.accountId) ||
      (metadata.email && entry.data.email === metadata.email && entry.data.imported_from === 'codex-local')
    );
    
    const filename = existingEntry
      ? existingEntry.id
      : `codex-${sanitizeFilenamePart(metadata.accountId || Date.now(), 'local')}-${sanitizeFilenamePart(metadata.email, 'user')}-${sanitizeFilenamePart(metadata.planType, 'account')}.json`;
    const filePath = existingEntry ? existingEntry.filePath : path.join(AUTH_DIR, filename);
    const shouldSelect = existingEntry
      ? selectedAccounts.codex === existingEntry.id
      : existingCodexAccounts.length === 0;
    
    const authData = {
      type: 'codex',
      email: metadata.email,
      access_token: localAuth.tokens.access_token,
      refresh_token: localAuth.tokens.refresh_token || null,
      id_token: localAuth.tokens.id_token || null,
      account_id: metadata.accountId,
      expired: metadata.expired,
      last_refresh: localAuth.last_refresh || new Date().toISOString(),
      imported_from: 'codex-local',
      auth_source_path: CODEX_LOCAL_AUTH_FILE,
      disabled: shouldSelect ? false : (existingEntry ? existingEntry.data.disabled === true : true)
    };
    
    if (existingEntry && existingEntry.data.created) {
      authData.created = existingEntry.data.created;
    } else {
      authData.created = new Date().toISOString();
    }
    
    ensureAuthDir();
    writeAuthFile(filePath, authData);
    
    if (shouldSelect) {
      selectedAccounts.codex = filename;
      saveSelectedAccounts();
    }
    
    getConfigPath();
    
    return {
      success: true,
      account: {
        id: filename,
        email: metadata.email,
        accountId: metadata.accountId,
        selected: shouldSelect,
        updated: !!existingEntry
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function setSelectedCodexAccount(accountId) {
  try {
    const codexAccounts = listAuthAccountEntries('codex');
    if (codexAccounts.length === 0) {
      return { success: false, error: 'No Codex accounts found' };
    }
    
    const target = codexAccounts.find(account => account.id === accountId);
    if (!target) {
      return { success: false, error: 'Selected Codex account not found' };
    }
    
    for (const account of codexAccounts) {
      account.data.disabled = account.id !== accountId;
      writeAuthFile(account.filePath, account.data);
    }
    
    selectedAccounts.codex = accountId;
    saveSelectedAccounts();
    getConfigPath();
    
    return { success: true, selectedId: accountId };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getCodexUsage(accountId) {
  return new Promise((resolve) => {
    try {
      const account = listAuthAccountEntries('codex').find(entry => entry.id === accountId);
      if (!account) {
        resolve({ success: false, error: 'Codex account not found' });
        return;
      }
      
      const accessToken = account.data.access_token || account.data.token;
      if (!accessToken) {
        resolve({ success: false, error: 'This Codex account is missing an access token' });
        return;
      }
      
      const request = net.request({
        method: 'GET',
        url: 'https://chatgpt.com/backend-api/wham/usage'
      });
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };
      const timeout = setTimeout(() => {
        try { request.abort(); } catch (e) {}
        finish({ success: false, error: 'Usage query timed out' });
      }, 15000);
      
      request.setHeader('Authorization', `Bearer ${accessToken}`);
      request.setHeader('Accept', 'application/json');
      request.setHeader('User-Agent', 'ToapiProxy');
      if (account.data.account_id) {
        request.setHeader('ChatGPT-Account-Id', account.data.account_id);
      }
      
      request.on('response', (response) => {
        let body = '';
        
        response.on('data', (chunk) => {
          body += chunk.toString();
        });
        
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            finish({
              success: false,
              error: `Usage query failed with HTTP ${response.statusCode}`,
              details: body.slice(0, 500)
            });
            return;
          }
          
          try {
            const payload = JSON.parse(body || '{}');
            const usage = normalizeCodexUsageResponse(payload);
            usage.retrievedAt = new Date().toISOString();
            finish({
              success: true,
              usage
            });
          } catch (e) {
            finish({
              success: false,
              error: 'Usage response was not valid JSON',
              details: body.slice(0, 500)
            });
          }
        });
      });
      
      request.on('error', (err) => {
        finish({ success: false, error: err.message });
      });
      
      request.end();
    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
}

// ============== Thinking Proxy ==============

function startThinkingProxy() {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    
    thinkingProxyServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => {
        let modifiedBody = body;
        let thinkingEnabled = false;
        
        if (req.method === 'POST' && body) {
          const result = processThinkingParameter(body);
          if (result) {
            modifiedBody = result.body;
            thinkingEnabled = result.thinkingEnabled;
          }
        }
        
        const options = {
          hostname: '127.0.0.1',
          port: BACKEND_PORT,
          path: req.url,
          method: req.method,
          headers: { ...req.headers }
        };
        
        options.headers['content-length'] = Buffer.byteLength(modifiedBody);
        options.headers['host'] = `127.0.0.1:${BACKEND_PORT}`;
        
        if (thinkingEnabled) {
          const beta = 'interleaved-thinking-2025-05-14';
          if (options.headers['anthropic-beta']) {
            if (!options.headers['anthropic-beta'].includes(beta)) {
              options.headers['anthropic-beta'] += `,${beta}`;
            }
          } else {
            options.headers['anthropic-beta'] = beta;
          }
        }
        
        const proxyReq = http.request(options, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        });
        
        proxyReq.on('error', (err) => {
          res.writeHead(502);
          res.end('Bad Gateway');
        });
        
        proxyReq.write(modifiedBody);
        proxyReq.end();
      });
    });
    
    thinkingProxyServer.on('error', (err) => {
      thinkingProxyServer = null;
      if (err && err.code === 'EADDRINUSE') {
        finishReject(new Error(
          `Port ${PROXY_PORT} is already in use on 127.0.0.1. Another VibeProxy instance or another app is already running there. Please quit the old instance and try again.`
        ));
        return;
      }
      finishReject(err);
    });
    
    thinkingProxyServer.listen(PROXY_PORT, '127.0.0.1', () => {
      console.log(`[Proxy] Listening on port ${PROXY_PORT}`);
      finishResolve();
    });
  });
}

function processThinkingParameter(jsonString) {
  try {
    const json = JSON.parse(jsonString);
    const model = json.model;
    if (!model || (!model.startsWith('claude-') && !model.startsWith('gemini-claude-'))) {
      return null;
    }
    
    const match = model.match(/-thinking-(\d+)$/);
    if (match) {
      const budget = Math.min(parseInt(match[1]), 31999);
      const cleanModel = model.replace(/-thinking-\d+$/, '');
      json.model = cleanModel;
      json.thinking = { type: 'enabled', budget_tokens: budget };
      
      const requiredMax = budget + Math.max(1024, Math.floor(budget * 0.1));
      if (!json.max_tokens || json.max_tokens <= budget) {
        json.max_tokens = Math.min(requiredMax, 32000);
      }
      
      console.log(`[Proxy] Transformed ${model} -> ${cleanModel} with thinking budget ${budget}`);
      return { body: JSON.stringify(json), thinkingEnabled: true };
    }
    
    if (model.endsWith('-thinking')) {
      return { body: jsonString, thinkingEnabled: true };
    }
    return null;
  } catch (e) {
    return null;
  }
}

function stopThinkingProxy() {
  if (thinkingProxyServer) {
    thinkingProxyServer.close();
    thinkingProxyServer = null;
  }
}

// ============== Backend Server ==============

function killOrphanedProcesses() {
  try {
    execSync('pkill -9 -f cli-proxy-api-plus 2>/dev/null || true', { encoding: 'utf8' });
  } catch (e) {}
}

function startBackendServer() {
  return new Promise((resolve, reject) => {
    const binaryPath = getResourcePath('cli-proxy-api-plus');
    const configPath = getConfigPath();
    
    if (!fs.existsSync(binaryPath)) {
      reject(new Error(`Binary not found: ${binaryPath}`));
      return;
    }
    
    try { fs.chmodSync(binaryPath, 0o755); } catch (e) {}
    
    const env = { ...process.env };
    const proxyUrl = getActiveProxyUrl();
    if (proxyUrl) {
      env.HTTP_PROXY = proxyUrl;
      env.HTTPS_PROXY = proxyUrl;
      env.http_proxy = proxyUrl;
      env.https_proxy = proxyUrl;
      env.ALL_PROXY = proxyUrl;
      env.all_proxy = proxyUrl;
      console.log(`[Backend] Using proxy: ${proxyUrl}`);
    }
    
    serverProcess = spawn(binaryPath, ['-config', configPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: env
    });
    
    serverProcess.stdout.on('data', (data) => console.log(`[Backend] ${data}`));
    serverProcess.stderr.on('data', (data) => console.log(`[Backend] ${data}`));
    
    serverProcess.on('error', (err) => {
      console.error('[Backend] Failed to start:', err);
      reject(err);
    });
    
    serverProcess.on('close', (code) => {
      console.log(`[Backend] Exited with code ${code}`);
      serverProcess = null;
      isServerRunning = false;
      updateTray();
    });
    
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        resolve();
      } else {
        reject(new Error('Server failed to start'));
      }
    }, 1500);
  });
}

function stopBackendServer() {
  return new Promise((resolve) => {
    if (!serverProcess) {
      resolve();
      return;
    }
    
    const pid = serverProcess.pid;
    serverProcess.kill('SIGTERM');
    
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        try { process.kill(pid, 'SIGKILL'); } catch (e) {}
      }
      serverProcess = null;
      resolve();
    }, 2000);
  });
}

// ============== Server Control ==============

async function startServer() {
  if (isServerRunning) return;
  
  try {
    ensureAuthDir();
    killOrphanedProcesses();
    await startThinkingProxy();
    await startBackendServer();
    isServerRunning = true;
    updateTray();
    showNotification('Server Started', `VibeProxy is running on port ${PROXY_PORT}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    stopThinkingProxy();
    showNotification('Server Failed', err.message);
  }
}

async function stopServer() {
  stopThinkingProxy();
  await stopBackendServer();
  isServerRunning = false;
  updateTray();
}

// ============== Auth Commands ==============

function runAuthCommand(command, email = null) {
  return new Promise((resolve) => {
    const binaryPath = getResourcePath('cli-proxy-api-plus');
    const configPath = getResourcePath('config.yaml');
    
    const env = { ...process.env };
    const proxyUrl = getActiveProxyUrl();
    if (proxyUrl) {
      env.HTTP_PROXY = proxyUrl;
      env.HTTPS_PROXY = proxyUrl;
      env.http_proxy = proxyUrl;
      env.https_proxy = proxyUrl;
      env.ALL_PROXY = proxyUrl;
      env.all_proxy = proxyUrl;
    }
    
    const proc = spawn(binaryPath, ['--config', configPath, command], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: env
    });
    
    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
      console.log('[Auth]', data.toString());
    });
    proc.stderr.on('data', (data) => {
      output += data.toString();
      console.log('[Auth]', data.toString());
    });
    
    proc.on('error', (err) => resolve({ success: false, output: err.message }));
    
    // Handle special cases
    if (command === '-login') {
      setTimeout(() => { if (!proc.killed) proc.stdin.write('\n'); }, 3000);
    }
    if (command === '-codex-login') {
      setTimeout(() => { if (!proc.killed) proc.stdin.write('\n'); }, 12000);
    }
    if (command === '-qwen-login' && email) {
      setTimeout(() => { if (!proc.killed) proc.stdin.write(email + '\n'); }, 10000);
    }
    
    // For Copilot, capture device code
    if (command === '-github-copilot-login') {
      setTimeout(() => {
        const codeMatch = output.match(/enter the code:\s*([A-Z0-9-]+)/i);
        if (codeMatch) {
          clipboard.writeText(codeMatch[1]);
          resolve({
            success: true,
            output: `🌐 Browser opened for GitHub authentication.\n\n📋 Code copied to clipboard:\n\n${codeMatch[1]}\n\nJust paste it in the browser!`
          });
        } else if (!proc.killed) {
          resolve({ success: true, output: 'Browser opened for authentication.' });
        }
      }, 2500);
      return;
    }
    
    // Return early for browser-based auth
    setTimeout(() => {
      if (!proc.killed && proc.exitCode === null) {
        resolve({ success: true, output: output || 'Browser opened for authentication' });
      }
    }, 2000);
    
    proc.on('close', (code) => {
      if (output.includes('Opening browser') || output.includes('open URL')) {
        resolve({ success: true, output: 'Browser opened for authentication' });
      } else {
        resolve({ success: code === 0, output });
      }
    });
  });
}

// ============== UI ==============

function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

function createTray() {
  const iconPath = path.join(__dirname, '../assets/icon-inactive.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (process.platform === 'darwin') {
    icon = icon.resize({ width: 18, height: 18 });
    icon.setTemplateImage(true);
  }
  
  tray = new Tray(icon);
  tray.setToolTip('VibeProxy');
  updateTray();
}

function updateTray() {
  if (!tray) return;
  
  // Update icon
  const iconName = isServerRunning ? 'icon-active.png' : 'icon-inactive.png';
  const iconPath = path.join(__dirname, '../assets', iconName);
  if (fs.existsSync(iconPath)) {
    let icon = nativeImage.createFromPath(iconPath);
    if (process.platform === 'darwin') {
      icon = icon.resize({ width: 18, height: 18 });
      icon.setTemplateImage(true);
    }
    tray.setImage(icon);
  }
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isServerRunning ? `Server: Running (port ${PROXY_PORT})` : 'Server: Stopped',
      enabled: false
    },
    { type: 'separator' },
    { label: 'Open Settings', accelerator: 'CmdOrCtrl+S', click: openSettings },
    { type: 'separator' },
    {
      label: isServerRunning ? 'Stop Server' : 'Start Server',
      click: () => isServerRunning ? stopServer() : startServer()
    },
    { type: 'separator' },
    {
      label: 'Copy Server URL',
      accelerator: 'CmdOrCtrl+C',
      enabled: isServerRunning,
      click: () => {
        clipboard.writeText(`http://localhost:${PROXY_PORT}`);
        showNotification('Copied', 'Server URL copied to clipboard');
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      accelerator: 'CmdOrCtrl+Q',
      click: async () => {
        await stopServer();
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}

function openSettings() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  
  settingsWindow = new BrowserWindow({
    width: 500,
    height: 780,
    resizable: true,
    title: 'VibeProxy',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  remoteMain.enable(settingsWindow.webContents);
  settingsWindow.loadFile(path.join(__dirname, '../ui/settings.html'));
  
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ============== App Lifecycle ==============

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
  
  loadEnabledProviders();
  loadLaunchAtLogin();
  await applyNetworkProxy();
  createTray();
  startServer();
  
  // Start Kiro token auto-sync
  if (checkKiroToken()) {
    startKiroAutoSync();
  }
  
  setTimeout(openSettings, 1000);
});

app.on('window-all-closed', (e) => e.preventDefault());

app.on('before-quit', async () => {
  await stopServer();
});

app.on('second-instance', () => {
  openSettings();
});

// ============== Export for Settings Window ==============

global.vibeProxy = {
  // Server
  isServerRunning: () => isServerRunning,
  startServer,
  stopServer,
  getPort: () => PROXY_PORT,
  
  // Providers
  isProviderEnabled,
  setProviderEnabled,
  
  // Auth
  getAuthAccounts,
  deleteAccount,
  checkCodexLocalAuth,
  getCodexLocalAuthPath,
  importCodexLocalAuth,
  setSelectedCodexAccount,
  getCodexUsage,
  runAuthCommand,
  saveZaiApiKey,
  
  // Kiro
  checkKiroToken,
  importKiroToken,
  syncKiroTokenFromIDE,
  
  // Launch at login
  getLaunchAtLogin,
  setLaunchAtLogin,
  getLocalProxyUrl,
  setLocalProxyUrl,
  
  // Utility
  openAuthFolder: () => {
    ensureAuthDir();
    shell.openPath(AUTH_DIR);
  },
  getVersion: () => APP_VERSION
};
