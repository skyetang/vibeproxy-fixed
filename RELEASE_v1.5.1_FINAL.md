# VibeProxy v1.5.1 最终版本发布

## 🎉 版本信息

**版本**: v1.5.1 (Final)  
**发布日期**: 2026-03-06  
**构建时间**: 16:46  
**MD5**: `a90eef5f0d65fe1688674596c5e3c50d`

## 📦 下载文件

- **DMG 安装包**: `electron-app/dist/VibeProxy-1.5.1.dmg` (117 MB)
- **ZIP 压缩包**: `electron-app/dist/VibeProxy-1.5.1-mac.zip` (113 MB)

## ✨ 本次更新内容

### 1. 升级 CLIProxyAPIPlus 到 v6.8.45-0
- 从 43 MB 升级到 47 MB
- 提交: 89c42821
- 构建时间: 2026-03-06T03:10:11Z

### 2. 新增 GPT-5.x Codex 模型支持
添加了 12 个 GPT-5.x 系列模型：
- `gpt-5.4` - 最新最强
- `gpt-5.3-codex-spark` - 快速响应
- `gpt-5.3-codex` - 高级编码
- `gpt-5.2-codex` - 稳定编码
- `gpt-5.2` - 标准版
- `gpt-5.1-codex-max` - 最大能力
- `gpt-5.1-codex` - 标准编码
- `gpt-5.1-codex-mini` - 轻量版
- `gpt-5.1` - 标准版
- `gpt-5-codex` - 基础编码
- `gpt-5-codex-mini` - 基础轻量
- `gpt-5` - 基础版

### 3. 🔧 修复 Cursor BYOK 错误
**问题**: `BYOK Error: 400 status code (no body)`

**修复**:
- ✅ 所有 GPT 模型的 `baseUrl` 改为 `http://localhost:8317/v1` (添加 `/v1` 后缀)
- ✅ 确保 GPT 模型的 `provider` 为 `"openai"`
- ✅ Kiro/Claude 模型保持 `http://localhost:8317` (不需要 `/v1`)
- ✅ 更新了配置说明

### 4. 文档更新
- ✅ `CURSOR_BYOK_FIX.md` - Cursor BYOK 错误修复指南
- ✅ 更新了 `vibeproxy-models-mapping.json` 的使用说明

## 🚀 安装步骤

### 方法 1: DMG 安装（推荐）
```bash
# 1. 打开 DMG
open electron-app/dist/VibeProxy-1.5.1.dmg

# 2. 拖拽 VibeProxy 到 Applications 文件夹

# 3. 移除隔离属性
xattr -cr /Applications/VibeProxy.app

# 4. 启动应用
open /Applications/VibeProxy.app
```

### 方法 2: ZIP 安装
```bash
# 1. 解压
unzip electron-app/dist/VibeProxy-1.5.1-mac.zip

# 2. 移动到 Applications
mv VibeProxy.app /Applications/

# 3. 移除隔离属性
xattr -cr /Applications/VibeProxy.app

# 4. 启动
open /Applications/VibeProxy.app
```

## 📝 Cursor 配置指南

### 正确的配置格式

**GPT-5.x 模型** (必须包含 `/v1`):
```json
{
  "cursor.customModels": [
    {
      "model": "gpt-5.4",
      "id": "custom:GPT-5.4-17",
      "baseUrl": "http://localhost:8317/v1",  // ⚠️ 必须有 /v1
      "apiKey": "dummy-not-used",
      "displayName": "GPT-5.4",
      "provider": "openai"  // ⚠️ 必须是 openai
    }
  ]
}
```

**Kiro/Claude 模型** (不需要 `/v1`):
```json
{
  "cursor.customModels": [
    {
      "model": "kiro-claude-sonnet-4-5",
      "id": "custom:Kiro-Sonnet-4.5-1",
      "baseUrl": "http://localhost:8317",  // ⚠️ 不需要 /v1
      "apiKey": "dummy-not-used",
      "displayName": "Kiro Claude Sonnet 4.5",
      "provider": "anthropic"  // ⚠️ 必须是 anthropic
    }
  ]
}
```

### 配置规则总结

| 模型类型 | Provider | BaseURL | 说明 |
|---------|----------|---------|------|
| GPT-5.x / GPT-4 / O1 | `openai` | `http://localhost:8317/v1` | ✅ 需要 `/v1` |
| Kiro (Claude) | `anthropic` | `http://localhost:8317` | ❌ 不需要 `/v1` |
| Gemini | `google` | `http://localhost:8317` | ❌ 不需要 `/v1` |

## 🔍 验证安装

### 1. 检查服务状态
```bash
lsof -i :8317
```
应该看到 VibeProxy 进程。

### 2. 测试 GPT-5.4 模型
```bash
curl http://localhost:8317/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dummy-not-used" \
  -d '{
    "model": "gpt-5.4",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### 3. 查看所有可用模型
```bash
curl -s http://localhost:8317/v1/models \
  -H "Authorization: Bearer dummy-not-used" \
  | python3 -m json.tool \
  | grep '"id"'
```

## ⚠️ 重要提示

### Cursor BYOK 配置
如果遇到 `BYOK Error: 400 status code (no body)` 错误：

1. **检查 baseUrl**
   - GPT 模型必须使用 `http://localhost:8317/v1`
   - Kiro/Claude 模型使用 `http://localhost:8317`

2. **检查 provider**
   - GPT 模型必须是 `"openai"`
   - Kiro/Claude 模型必须是 `"anthropic"`

3. **重启 Cursor**
   ```bash
   killall Cursor
   ```

4. **查看详细修复指南**
   参考 `CURSOR_BYOK_FIX.md`

### 认证要求
使用 GPT-5.x 模型需要：
1. 在 VibeProxy 中添加 Codex 账号
2. 完成 OAuth 认证
3. 确保账号有效且有配额

## 📊 支持的模型总览

### Kiro 模型 (12个)
- kiro-auto
- kiro-claude-sonnet-4-5 (+ thinking variants)
- kiro-claude-sonnet-4 (+ agentic)
- kiro-claude-opus-4-5 (+ agentic)
- kiro-claude-haiku-4-5 (+ agentic)

### Gemini 模型 (5个)
- gemini-3-pro-preview
- gemini-3-flash-preview
- gemini-2.5-pro
- gemini-2.5-flash
- gemini-2.5-flash-lite

### GPT-5.x Codex 模型 (12个)
- gpt-5.4
- gpt-5.3-codex-spark
- gpt-5.3-codex
- gpt-5.2-codex
- gpt-5.2
- gpt-5.1-codex-max
- gpt-5.1-codex
- gpt-5.1-codex-mini
- gpt-5.1
- gpt-5-codex
- gpt-5-codex-mini
- gpt-5

**总计**: 29+ 个可用模型

## 🐛 故障排除

### 问题 1: BYOK Error 400
**解决方案**: 查看 `CURSOR_BYOK_FIX.md`

### 问题 2: 模型不可用
**解决方案**:
1. 确认 VibeProxy 正在运行
2. 检查对应服务的认证状态
3. 查看 `~/.cli-proxy-api/` 目录

### 问题 3: 连接超时
**解决方案**:
1. 检查防火墙设置
2. 确认 localhost 可访问
3. 重启 VibeProxy

## 📚 相关文档

- `CURSOR_BYOK_FIX.md` - Cursor BYOK 错误修复详细指南
- `vibeproxy-models-mapping.json` - 完整的模型配置
- `README.md` - 项目说明

## 🔄 更新日志

### v1.5.1 (2026-03-06) - Final
- ✅ 升级 CLIProxyAPIPlus 到 v6.8.45-0
- ✅ 新增 12 个 GPT-5.x Codex 模型
- ✅ 修复 Cursor BYOK 400 错误
- ✅ 更新所有 GPT 模型的 baseUrl 配置
- ✅ 添加详细的配置文档

### v1.5.0 (2026-02-02)
- Kiro token 自动同步
- 手动同步按钮
- 改进的错误处理

## 📦 文件校验

```
文件名: VibeProxy-1.5.1.dmg
大小: 117 MB
MD5: a90eef5f0d65fe1688674596c5e3c50d
平台: macOS x64
最低系统: macOS 12 (Monterey)
```

## 💬 支持

如有问题：
1. 查看 `CURSOR_BYOK_FIX.md`
2. 检查 GitHub Issues
3. 查看项目文档

---

**安装完成后，记得：**
1. ✅ 重启 Cursor
2. ✅ 检查 baseUrl 配置
3. ✅ 验证 provider 设置
4. ✅ 测试模型调用

**发布时间**: 2026-03-06 16:46  
**状态**: ✅ 已修复 BYOK 错误，可以正常使用
