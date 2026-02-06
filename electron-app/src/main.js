const { app, BrowserWindow, Tray, Menu, nativeImage, clipboard, Notification, shell } = require('electron');
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

function getResourcePath(filename) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, filename);
  }
  return path.join(__dirname, '..', filename);
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
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      launchAtLogin = config.launchAtLogin || false;
    }
  } catch (e) {
    launchAtLogin = false;
  }
  // Sync with system
  app.setLoginItemSettings({ openAtLogin: launchAtLogin });
}

function setLaunchAtLogin(enabled) {
  launchAtLogin = enabled;
  app.setLoginItemSettings({ openAtLogin: enabled });
  // Save to config
  try {
    ensureAuthDir();
    let config = {};
    if (fs.existsSync(CONFIG_FILE)) {
      config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
    config.launchAtLogin = enabled;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {}
  console.log(`[Config] Launch at login: ${enabled}`);
}

function getLaunchAtLogin() {
  return launchAtLogin;
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
  ensureAuthDir();
  
  try {
    const files = fs.readdirSync(AUTH_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      try {
        const filePath = path.join(AUTH_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const type = (data.type || '').toLowerCase();
        
        // Map type to service key
        let serviceType = type;
        if (type === 'copilot') serviceType = 'github-copilot';
        if (type === 'gemini-cli' || type === 'gemini') serviceType = 'gemini';
        
        // Parse expiration date
        let expired = false;
        if (data.expired) {
          try {
            const expDate = new Date(data.expired);
            expired = expDate < new Date();
          } catch (e) {}
        }
        
        accounts.push({
          id: file,
          type: serviceType,
          email: data.email || data.login || file,
          login: data.login,
          expired: expired,
          expiredDate: data.expired,
          path: filePath
        });
      } catch (e) {}
    }
  } catch (e) {}
  
  return accounts;
}

function deleteAccount(filePath) {
  try {
    fs.unlinkSync(filePath);
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

// ============== Thinking Proxy ==============

function startThinkingProxy() {
  return new Promise((resolve) => {
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
    
    thinkingProxyServer.listen(PROXY_PORT, '127.0.0.1', () => {
      console.log(`[Proxy] Listening on port ${PROXY_PORT}`);
      resolve();
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
    const proxyUrl = getSystemProxy();
    if (proxyUrl) {
      env.HTTP_PROXY = proxyUrl;
      env.HTTPS_PROXY = proxyUrl;
      env.http_proxy = proxyUrl;
      env.https_proxy = proxyUrl;
      console.log(`[Backend] Using system proxy: ${proxyUrl}`);
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
    const proxyUrl = getSystemProxy();
    if (proxyUrl) {
      env.HTTP_PROXY = proxyUrl;
      env.HTTPS_PROXY = proxyUrl;
      env.http_proxy = proxyUrl;
      env.https_proxy = proxyUrl;
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

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
  
  loadEnabledProviders();
  loadLaunchAtLogin();
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
  runAuthCommand,
  saveZaiApiKey,
  
  // Kiro
  checkKiroToken,
  importKiroToken,
  syncKiroTokenFromIDE,
  
  // Launch at login
  getLaunchAtLogin,
  setLaunchAtLogin,
  
  // Utility
  openAuthFolder: () => {
    ensureAuthDir();
    shell.openPath(AUTH_DIR);
  },
  getVersion: () => APP_VERSION
};
