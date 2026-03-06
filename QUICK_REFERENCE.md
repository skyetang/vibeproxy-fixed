# VibeProxy v1.5.1 快速参考

## 📦 安装
```bash
xattr -cr /Applications/VibeProxy.app
open /Applications/VibeProxy.app
```

## 🔧 Cursor 配置关键点

### ✅ GPT 模型（正确）
```json
{
  "model": "gpt-5.4",
  "baseUrl": "http://localhost:8317/v1",  // 有 /v1
  "provider": "openai"
}
```

### ❌ GPT 模型（错误）
```json
{
  "model": "gpt-5.4",
  "baseUrl": "http://localhost:8317",  // 缺少 /v1 ❌
  "provider": "openai"
}
```

### ✅ Kiro/Claude 模型（正确）
```json
{
  "model": "kiro-claude-sonnet-4-5",
  "baseUrl": "http://localhost:8317",  // 不需要 /v1
  "provider": "anthropic"
}
```

## 📋 配置规则

| 模型 | Provider | BaseURL |
|------|----------|---------|
| GPT-5.x | `openai` | `http://localhost:8317/v1` ✅ |
| Kiro | `anthropic` | `http://localhost:8317` ✅ |
| Gemini | `google` | `http://localhost:8317` ✅ |

## 🔍 快速验证

```bash
# 检查服务
lsof -i :8317

# 测试 GPT-5.4
curl http://localhost:8317/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dummy-not-used" \
  -d '{"model":"gpt-5.4","messages":[{"role":"user","content":"test"}]}'
```

## 🐛 遇到 BYOK Error 400？

1. 检查 baseUrl 是否有 `/v1` (GPT 模型)
2. 检查 provider 是否为 `"openai"` (GPT 模型)
3. 重启 Cursor
4. 查看 `CURSOR_BYOK_FIX.md`

## 📚 文档

- `CURSOR_BYOK_FIX.md` - 详细修复指南
- `RELEASE_v1.5.1_FINAL.md` - 完整发布说明
- `vibeproxy-models-mapping.json` - 模型配置

## 🎯 推荐模型

- **最新**: `gpt-5.4`
- **快速**: `gpt-5.3-codex-spark`
- **稳定**: `gpt-5.2-codex`
- **强大**: `gpt-5.1-codex-max`

---

**MD5**: `a90eef5f0d65fe1688674596c5e3c50d`  
**版本**: v1.5.1 Final  
**日期**: 2026-03-06
