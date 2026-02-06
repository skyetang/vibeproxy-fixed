# VibeProxy (Electron)

AI Proxy for Claude, Codex, Gemini, GitHub Copilot and more.

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm start
```

## Build

```bash
# Build for current platform
npm run build

# Build for specific platform
npm run build:mac
npm run build:win
npm run build:linux
```

## Requirements

- Node.js 18+
- The `cli-proxy-api-plus` binary must be present in `../src/Sources/Resources/`

## How it works

1. **ThinkingProxy** (port 8317) - Intercepts requests, adds thinking parameters for Claude models
2. **Backend** (port 8318) - The `cli-proxy-api-plus` binary handles actual API proxying

Clients connect to port 8317, requests are processed and forwarded to 8318.
