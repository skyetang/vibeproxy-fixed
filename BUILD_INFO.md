# VibeProxy 打包信息

## 打包完成 ✅

**版本**: v1.5.1  
**打包时间**: 2026-02-06  
**平台**: macOS (x64)

## 生成的文件

### 1. DMG 安装包（推荐）
- **文件**: `electron-app/dist/VibeProxy-1.5.1.dmg`
- **大小**: ~116 MB
- **用途**: 标准 macOS 安装包，拖拽到 Applications 文件夹即可安装

### 2. ZIP 压缩包
- **文件**: `electron-app/dist/VibeProxy-1.5.1-mac.zip`
- **大小**: ~112 MB
- **用途**: 解压后直接运行，无需安装

## 安装方法

### 使用 DMG 文件（推荐）
1. 双击 `VibeProxy-1.5.1.dmg`
2. 将 VibeProxy 图标拖拽到 Applications 文件夹
3. 从 Applications 启动 VibeProxy
4. 首次启动需要右键点击 → 打开（绕过 Gatekeeper）

### 使用 ZIP 文件
1. 解压 `VibeProxy-1.5.1-mac.zip`
2. 将 VibeProxy.app 移动到 Applications 文件夹
3. 首次启动需要右键点击 → 打开

## 首次运行

由于应用未签名，首次运行时需要：

```bash
# 方法 1: 移除隔离属性
xattr -cr /Applications/VibeProxy.app

# 方法 2: 右键点击应用 → 打开
```

## 包含的更新

### 配置文件更新
- ✅ 更新了 `vibeproxy-models-mapping.json`
- ✅ 移除了不支持的 Gemini 2.5 模型配置错误
- ✅ 修正了 Gemini 3 模型的服务类型
- ✅ 所有模型已通过 API 验证

### 新增文档
- ✅ `MODEL_CONFIGURATION_GUIDE.md` - 模型配置参数指南
- ✅ 包含已验证的可用模型列表
- ✅ 详细的配置示例和验证方法

## 验证安装

安装后，可以通过以下方式验证：

### 1. 检查服务是否运行
```bash
lsof -i :8317
```

### 2. 查看可用模型
```bash
curl -s http://localhost:8317/v1/models \
  -H "Authorization: Bearer dummy-not-used" \
  | python3 -m json.tool
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

## 当前支持的模型

根据 CLIProxyAPIPlus API 验证，当前可用：

### Kiro 模型 (11个)
- kiro-auto
- kiro-claude-sonnet-4-5
- kiro-claude-sonnet-4
- kiro-claude-opus-4-5
- kiro-claude-haiku-4-5
- kiro-claude-sonnet-4-5-agentic
- kiro-claude-sonnet-4-agentic
- kiro-claude-opus-4-5-agentic
- kiro-claude-haiku-4-5-agentic
- kiro-claude-sonnet-4-5-thinking-* (需手动添加后缀)

### Gemini 模型 (5个)
- gemini-2.5-pro
- gemini-2.5-flash
- gemini-2.5-flash-lite
- gemini-3-pro-preview
- gemini-3-flash-preview

## 技术细节

### 打包配置
- **Electron**: v28.3.3
- **electron-builder**: v24.13.3
- **架构**: x64
- **目标格式**: DMG + ZIP

### 包含的资源
- CLIProxyAPIPlus 二进制文件 (43 MB)
- config.yaml 配置文件
- 应用图标和资源文件
- UI 界面文件

## 注意事项

⚠️ **代码签名**
- 应用未进行 Apple 开发者签名
- 首次运行需要手动允许
- 不影响功能使用

⚠️ **系统要求**
- macOS 12 (Monterey) 或更高版本
- x64 架构（Intel 芯片）

## 相关文档

- `README.md` - 项目说明
- `USAGE.md` - 使用指南
- `MODEL_CONFIGURATION_GUIDE.md` - 模型配置指南
- `CHANGELOG.md` - 版本更新记录

---

**构建成功** ✅  
如有问题，请查看日志或提交 Issue。
