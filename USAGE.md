# VibeProxy 使用指南

## 快速开始

### 1. 启动 VibeProxy

双击应用图标或从 Applications 启动，菜单栏会出现图标。

### 2. 添加服务账号

点击菜单栏图标 → Open Settings，然后添加你需要的服务：

- **Kiro**: Web Auth 或 Import from IDE
- **Gemini**: 浏览器 OAuth 登录
- **Claude Code**: 浏览器 OAuth 登录
- **GitHub Copilot**: 浏览器 OAuth 登录
- **Qwen**: 输入邮箱登录
- **Z.AI**: 输入 API Key
- **Antigravity**: 浏览器 OAuth 登录

### 3. 配置 Cursor

打开 Cursor 设置 (`Cmd + ,`)，搜索 "Custom Models"，点击 "Edit in settings.json"，复制 `cursor-custom-models.json` 的内容粘贴进去。

### 4. 开始使用

在 Cursor 中按 `Cmd + K`，选择配置的模型即可使用。

---

## 配置文件

### cursor-custom-models.json

Cursor IDE 专用配置，包含当前可用的所有模型。

**使用方法**:
1. 复制文件内容
2. 打开 Cursor 设置 → Custom Models → Edit in settings.json
3. 粘贴到 `cursor.customModels` 字段
4. 保存并重启 Cursor

**注意**: 配置文件中的模型基于你启用的服务。添加新服务后需要更新配置。

---

## 查看可用模型

```bash
curl -s http://localhost:8317/v1/models \
  -H "Authorization: Bearer dummy-not-used" \
  | python3 -m json.tool
```

---

## Kiro Token 维护

### 自动维护（推荐）

保持 Kiro IDE 运行，VibeProxy 每5分钟自动同步 token。

### 手动同步

设置界面 → Kiro → Add Account → "Sync from IDE"

### 使用 Web 认证（最稳定）

设置界面 → Kiro → Add Account → "Web Auth"

详细说明请查看 `KIRO_TOKEN_MAINTENANCE.md`

---

## Extended Thinking

Claude 模型支持深度思考功能，在模型名称后添加 `-thinking-N`：

- `-thinking-32000` - 深度思考（复杂问题）
- `-thinking-10000` - 中度思考（代码重构）
- `-thinking-4000` - 轻度思考（快速优化）

**示例**:
- `kiro-claude-sonnet-4-5-thinking-10000`
- `claude-3-5-sonnet-20241022-thinking-32000`

---

## 常见问题

### Q: 为什么有些模型不可用？

A: 需要在 VibeProxy 设置中启用对应服务并添加账号。

### Q: Kiro token 频繁失效？

A: 保持 Kiro IDE 运行，或使用 Web 认证方式。详见 `KIRO_TOKEN_MAINTENANCE.md`

### Q: 如何添加更多模型？

A: 
1. 在 VibeProxy 设置中添加新服务的账号
2. 运行 `curl http://localhost:8317/v1/models` 查看新模型
3. 更新 `cursor-custom-models.json`

### Q: API Key 填什么？

A: 填写 `dummy-not-used` 或任意字符串，VibeProxy 不验证 API Key。

### Q: baseURL 是什么？

A: 
- Cursor: `http://localhost:8317`（不需要 `/v1`）
- 其他 IDE: `http://localhost:8317/v1`

---

## 文档

- `README.md` - 项目说明
- `KIRO_TOKEN_MAINTENANCE.md` - Kiro token 维护详细指南
- `CHANGELOG.md` - 版本更新记录

---

## 技术支持

- 问题报告: https://github.com/automazeio/vibeproxy/issues
- CLIProxyAPIPlus: https://github.com/router-for-me/CLIProxyAPIPlus

---

## 许可证

MIT License © 2026 Automaze, Ltd.
