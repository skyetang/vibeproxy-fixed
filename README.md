# VibeProxy

<p align="center">
  <img src="icon.png" width="128" height="128" alt="VibeProxy Icon">
</p>

<p align="center">
<a href="https://automaze.io" rel="nofollow"><img alt="Automaze" src="https://img.shields.io/badge/By-automaze.io-4b3baf" style="max-width: 100%;"></a>
<a href="https://github.com/automazeio/vibeproxy/blob/main/LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-28a745" style="max-width: 100%;"></a>
<a href="http://x.com/intent/follow?screen_name=aroussi" rel="nofollow"><img alt="Follow on 𝕏" src="https://img.shields.io/badge/Follow-%F0%9D%95%8F/@aroussi-1c9bf0" style="max-width: 100%;"></a>
<a href="https://github.com/automazeio/vibeproxy"><img alt="Star this repo" src="https://img.shields.io/github/stars/automazeio/vibeproxy.svg?style=social&amp;label=Star%20this%20repo&amp;maxAge=60" style="max-width: 100%;"></a>
</p>

**Stop paying twice for AI.** VibeProxy is a native macOS menu bar app that lets you use your existing AI subscriptions (Claude Code, GitHub Copilot, Gemini, Kiro, Qwen, Antigravity, Z.AI) with powerful AI coding tools like Cursor, Continue, and Cline – no separate API keys required.

Built on [CLIProxyAPIPlus](https://github.com/router-for-me/CLIProxyAPIPlus), it handles OAuth authentication, token management, and API routing automatically. One click to authenticate, zero friction to code.

---

## ✨ Features

- 🎯 **Native macOS Menu Bar App** - Clean Electron interface that stays out of your way
- 🚀 **One-Click Server Management** - Start/stop the proxy server from your menu bar
- 🔐 **Easy Authentication** - OAuth authentication for 8 AI services
- 👥 **Multi-Account Support** - Multiple accounts per provider with automatic load balancing
- 🎚️ **Provider Control** - Enable/disable providers on the fly
- 🔄 **Extended Thinking** - Deep reasoning support for Claude models
- 🌐 **System Proxy Detection** - Automatic proxy configuration
- 🚀 **Launch at Login** - Start automatically with macOS
- 💾 **Self-Contained** - Everything bundled inside the app

## 🎯 Supported Services

| Service | Models | Authentication |
|---------|--------|----------------|
| **Kiro (AWS)** | Claude Sonnet 4.5, Opus 4.5, Haiku 4.5 | Web Auth / Import from IDE |
| **Claude Code** | Claude 3.5 Sonnet, Haiku, Opus | OAuth |
| **GitHub Copilot** | GPT-4o, O1, Claude 3.5 | OAuth |
| **Gemini** | Gemini 3 Pro, 2.5 Pro/Flash | OAuth |
| **Antigravity** | Claude 4.5, Gemini 3 | OAuth |
| **Qwen** | Qwen Max, Plus, Turbo | Email Login |
| **Codex** | GPT-4 Turbo | OAuth |
| **Z.AI** | GLM-4.7, GLM-4 Plus | API Key |

## 📦 Installation

**Requirements:** macOS 12+ (Monterey or later)

### Download

1. Download `VibeProxy-1.5.1.dmg` from [Releases](https://github.com/automazeio/vibeproxy/releases)
2. Open the DMG and drag VibeProxy to Applications
3. Launch VibeProxy

**First Launch:**
- Right-click VibeProxy.app → Open (to bypass Gatekeeper)
- Or run: `xattr -cr /Applications/VibeProxy.app`

## 🚀 Quick Start

### 1. Launch VibeProxy

The menu bar icon appears when the app starts.

### 2. Add Services

Click menu bar icon → Open Settings → Add accounts for services you want to use.

### 3. Configure Cursor

Copy `cursor-custom-models.json` content to Cursor settings:
1. Open Cursor settings (`Cmd + ,`)
2. Search "Custom Models"
3. Click "Edit in settings.json"
4. Paste the configuration
5. Restart Cursor

### 4. Start Coding

Use `Cmd + K` in Cursor to select your models!

## 📚 Documentation

- **[USAGE.md](USAGE.md)** - Complete usage guide
- **[KIRO_TOKEN_MAINTENANCE.md](KIRO_TOKEN_MAINTENANCE.md)** - Kiro token management
- **[CHANGELOG.md](CHANGELOG.md)** - Version history

## 🔧 Configuration

### Cursor Configuration

The `cursor-custom-models.json` file contains all available models based on your enabled services.

**Format:**
```json
{
  "customModels": [
    {
      "model": "kiro-claude-sonnet-4-5",
      "baseUrl": "http://localhost:8317",
      "apiKey": "dummy-not-used",
      "displayName": "Kiro Claude Sonnet 4.5",
      "provider": "anthropic"
    }
  ]
}
```

### View Available Models

```bash
curl -s http://localhost:8317/v1/models \
  -H "Authorization: Bearer dummy-not-used"
```

## 🎨 Extended Thinking

Claude models support deep reasoning with Extended Thinking:

```
-thinking-32000  # Deep thinking (complex problems)
-thinking-10000  # Medium thinking (code refactoring)
-thinking-4000   # Light thinking (quick optimization)
```

**Example:** `kiro-claude-sonnet-4-5-thinking-10000`

## 🏗️ Architecture

```
ThinkingProxy (8317) → Backend (8318) → AI Services
         ↓
    Cursor/IDE
```

- **Port 8317**: ThinkingProxy with Extended Thinking support
- **Port 8318**: CLIProxyAPIPlus backend
- **Auth**: `~/.cli-proxy-api/*.json`

## 🛠️ Development

### Project Structure

```
electron-app/
├── src/
│   └── main.js           # Main process
├── ui/
│   └── settings.html     # Settings UI
├── assets/               # Icons
├── cli-proxy-api-plus    # Backend binary
├── config.yaml           # Backend config
└── package.json          # Electron config
```

### Build

```bash
cd electron-app
npm install
npm run build:mac
```

Output: `dist/VibeProxy-1.5.1.dmg`

## 🐛 Troubleshooting

### Kiro Token Issues

See [KIRO_TOKEN_MAINTENANCE.md](KIRO_TOKEN_MAINTENANCE.md) for detailed troubleshooting.

**Quick fix:**
1. Open Settings → Kiro → Add Account
2. Click "Sync from IDE"

### Connection Issues

```bash
# Check if server is running
lsof -i :8317

# Test connection
curl http://localhost:8317/v1/models \
  -H "Authorization: Bearer dummy-not-used"
```

### Model Not Available

1. Enable the service in VibeProxy settings
2. Add an account for that service
3. Restart VibeProxy
4. Update `cursor-custom-models.json`

## 📝 Credits

VibeProxy is built on [CLIProxyAPIPlus](https://github.com/router-for-me/CLIProxyAPIPlus), an excellent unified proxy server for AI services.

Special thanks to the CLIProxyAPIPlus project for making this possible.

## 📄 License

MIT License © 2026 [Automaze, Ltd.](https://automaze.io)

See [LICENSE](LICENSE) file for details.

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/automazeio/vibeproxy/issues)
- **Website**: [automaze.io](https://automaze.io)

---

**Current Version:** v1.5.1

**Latest Updates:**
- ✅ Kiro token auto-sync (every 5 minutes)
- ✅ Manual sync button
- ✅ Improved token maintenance
- ✅ Better error handling

See [CHANGELOG.md](CHANGELOG.md) for full history.
