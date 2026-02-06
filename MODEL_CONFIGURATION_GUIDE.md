# VibeProxy 模型配置参数指南

## 核心配置参数说明

当你在其他编程软件（如 Cursor、Continue、Cline 等）中配置 VibeProxy 时，需要正确设置以下关键参数：

### 1. `model` - 模型名称
这是最重要的参数，必须与 CLIProxyAPIPlus 实际支持的模型名称完全匹配。

**验证方法**：
```bash
curl -s http://localhost:8317/v1/models -H "Authorization: Bearer dummy-not-used"
```

### 2. `baseUrl` - API 端点地址
根据不同的客户端类型使用不同的 baseUrl：

- **Cursor**: `http://localhost:8317` (不需要 `/v1` 后缀)
- **OpenAI 兼容客户端**: `http://localhost:8317/v1` (需要 `/v1` 后缀)
- **Anthropic 兼容客户端**: `http://localhost:8317` (不需要 `/v1` 后缀)

### 3. `provider` - 提供商类型
根据模型的实际提供商设置：

- **Kiro 模型**: `"anthropic"` (因为 Kiro 使用 Claude 模型)
- **Gemini 模型**: `"google"`
- **GPT 模型**: `"openai"`

### 4. `apiKey` - API 密钥
VibeProxy 不验证 API Key，可以使用任意字符串：
- 推荐值: `"dummy-not-used"`
- 或任意字符串

---

## 已验证的可用模型列表

以下模型已通过 CLIProxyAPIPlus API 验证，可以直接使用：

### Kiro 服务模型 (AWS)
| 模型名称 | Provider | 说明 |
|---------|----------|------|
| `kiro-auto` | `anthropic` | 自动选择最佳 Kiro 模型 |
| `kiro-claude-sonnet-4-5` | `anthropic` | 最强大的 Kiro 模型 |
| `kiro-claude-sonnet-4` | `anthropic` | 上一代 Sonnet 模型 |
| `kiro-claude-opus-4-5` | `anthropic` | 最强大的 Opus 模型 |
| `kiro-claude-haiku-4-5` | `anthropic` | 最快的 Haiku 模型 |
| `kiro-claude-sonnet-4-5-agentic` | `anthropic` | Agent 优化版 Sonnet 4.5 |
| `kiro-claude-sonnet-4-agentic` | `anthropic` | Agent 优化版 Sonnet 4 |
| `kiro-claude-opus-4-5-agentic` | `anthropic` | Agent 优化版 Opus 4.5 |
| `kiro-claude-haiku-4-5-agentic` | `anthropic` | Agent 优化版 Haiku 4.5 |

### Extended Thinking 模型 (需要手动添加后缀)
| 模型名称 | Provider | Token Budget |
|---------|----------|--------------|
| `kiro-claude-sonnet-4-5-thinking-32000` | `anthropic` | 32000 (深度思考) |
| `kiro-claude-sonnet-4-5-thinking-10000` | `anthropic` | 10000 (中度思考) |
| `kiro-claude-sonnet-4-5-thinking-4000` | `anthropic` | 4000 (轻度思考) |

### Gemini 模型
| 模型名称 | Provider | 服务 |
|---------|----------|------|
| `gemini-2.5-pro` | `google` | Gemini 直接访问 |
| `gemini-2.5-flash` | `google` | Gemini 直接访问 |
| `gemini-2.5-flash-lite` | `google` | Gemini 直接访问 |
| `gemini-3-pro-preview` | `google` | Antigravity 代理 |
| `gemini-3-flash-preview` | `google` | Antigravity 代理 |

---

## 配置示例

### Cursor 配置示例
```json
{
  "model": "kiro-auto",
  "id": "custom:Kiro-Auto-0",
  "index": 0,
  "baseUrl": "http://localhost:8317",
  "apiKey": "dummy-not-used",
  "displayName": "Kiro Auto",
  "noImageSupport": false,
  "provider": "anthropic"
}
```

### Continue / Cline 配置示例
```json
{
  "models": [
    {
      "title": "Kiro Claude Sonnet 4.5",
      "provider": "openai",
      "model": "kiro-claude-sonnet-4-5",
      "apiBase": "http://localhost:8317/v1",
      "apiKey": "dummy-not-used"
    }
  ]
}
```

---

## 重要提示

### ✅ 正确的配置
- `model`: 必须与 API 返回的模型名称完全一致
- `baseUrl`: Cursor 不需要 `/v1`，其他客户端需要
- `provider`: 根据模型类型正确设置
- `apiKey`: 任意字符串即可

### ❌ 常见错误
- ❌ 使用不存在的模型名称
- ❌ baseUrl 后缀错误（Cursor 加了 `/v1`）
- ❌ provider 设置错误（如 Kiro 模型设置为 `google`）

---

## 验证配置是否正确

### 1. 检查服务是否运行
```bash
lsof -i :8317
```

### 2. 测试 API 连接
```bash
curl http://localhost:8317/v1/models \
  -H "Authorization: Bearer dummy-not-used"
```

### 3. 测试模型调用
```bash
curl http://localhost:8317/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dummy-not-used" \
  -d '{
    "model": "kiro-auto",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

---

## 更新日期
2026-02-06

## 数据来源
配置参数基于 CLIProxyAPIPlus `/v1/models` API 实际返回结果验证。
