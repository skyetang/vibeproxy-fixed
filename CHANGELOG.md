# VibeProxy 更新日志

## v1.5.1 (2026-02-06)

### 🔧 Kiro Token 维护改进

**问题修复**
- 修复 Kiro token 显示过期但实际仍可用的困惑
- 改进自动同步逻辑，避免无效同步

**新功能**
- ✅ 自动同步频率从30分钟改为5分钟
- ✅ 添加手动同步按钮（设置界面）
- ✅ 同步前检查 Kiro IDE token 是否过期
- ✅ 只在 token 变化时才更新文件
- ✅ 同步后自动重载后端
- ✅ 添加 `last_synced` 时间戳
- ✅ 详细的同步日志

**UI 改进**
- Kiro "Add Account" 按钮智能显示
  - 无导入 token：显示 "Import from IDE"
  - 有导入 token：显示 "Sync from IDE"
- 同步成功后显示更新数量

**文档更新**
- 更新 `KIRO_TOKEN_MAINTENANCE.md`
- 说明后端自动刷新机制
- 添加故障排除指南

### 技术细节

**后端自动刷新机制**
- CLIProxyAPIPlus 每15分钟检查 token 状态
- 使用 `refresh_token` 自动续期
- 刷新后的 token 保存在内存中
- 文件中的 `expired` 时间可能不准确

**同步策略**
```
检查 Kiro IDE token 是否存在
    ↓
检查 Kiro IDE token 是否过期
    ↓
比较 access_token 和 refresh_token
    ↓
只在变化时更新文件
    ↓
重载后端配置
```

---

## v1.5.0 (2026-02-02)

### 🎉 首次发布

**核心功能**
- ✅ 8个AI服务支持：Antigravity, Claude, Codex, Gemini, GitHub Copilot, Kiro, Qwen, Z.AI
- ✅ ThinkingProxy (端口 8317) + Backend (端口 8318)
- ✅ Extended Thinking 支持（Claude 模型）
- ✅ 菜单栏应用
- ✅ 账号管理
- ✅ 多账号负载均衡
- ✅ 系统代理检测
- ✅ Launch at login

**Kiro 功能**
- ✅ Web 认证（Google OAuth / AWS Builder ID）
- ✅ 从 Kiro IDE 导入 token
- ✅ 包含 refresh_token 支持
- ✅ 自动同步（每30分钟）

**文档**
- ✅ API_USAGE.md
- ✅ MODELS_GUIDE.md
- ✅ KIRO_MODELS.md
- ✅ CURSOR_CONFIG_GUIDE.md
- ✅ IDE_CONFIG_GUIDE.md
- ✅ FACTORY_CONFIG_GUIDE.md
- ✅ KIRO_TOKEN_MAINTENANCE.md

**配置文件**
- ✅ cursor-custom-models.json (34 models)
- ✅ vibeproxy-models-config.json (27 models)
- ✅ factory-providers-config.json (31 models)

---

## 升级指南

### 从 v1.5.0 升级到 v1.5.1

1. **退出旧版本**
   ```bash
   # 从菜单栏退出 VibeProxy
   ```

2. **安装新版本**
   ```bash
   # 打开 DMG 并覆盖安装
   open VibeProxy-1.5.1.dmg
   ```

3. **首次运行**
   ```bash
   # 右键打开（如果提示安全警告）
   xattr -cr /Applications/VibeProxy.app
   open /Applications/VibeProxy.app
   ```

4. **验证升级**
   - 打开设置界面
   - 检查版本号：v1.5.1
   - Kiro 账号会自动保留

### 配置迁移

所有配置和账号会自动保留：
- ✅ 认证账号：`~/.cli-proxy-api/*.json`
- ✅ 启用的服务：`~/.cli-proxy-api/enabled-providers.json`
- ✅ Launch at login：`~/.cli-proxy-api/vibeproxy-config.json`

---

## 已知问题

### v1.5.1

**Kiro Token 显示过期**
- **现象**：文件中 `expired` 时间已过期
- **影响**：无影响，后端会自动刷新
- **解决**：如果真的失效，使用手动同步

**未签名警告**
- **现象**：首次运行提示"无法验证开发者"
- **解决**：右键打开或使用 `xattr -cr`

### v1.5.0

**Management UI 问题**
- **现象**：Management UI 无法正常工作
- **解决**：已在 v1.5.0 中移除该功能

---

## 路线图

### v1.6.0 (计划中)

- [ ] Token 状态指示器
- [ ] 过期提醒通知
- [ ] 批量账号管理
- [ ] 使用统计
- [ ] 自动更新检查

### v2.0.0 (未来)

- [ ] Windows 支持
- [ ] Linux 支持
- [ ] 代码签名
- [ ] 自定义模型配置
- [ ] 插件系统

---

## 反馈与支持

- **问题报告**：https://github.com/automazeio/vibeproxy/issues
- **文档**：查看项目根目录的 Markdown 文件
- **社区**：欢迎提交 PR 和建议

---

## 许可证

MIT License © 2026 Automaze, Ltd.

感谢 [CLIProxyAPIPlus](https://github.com/router-for-me/CLIProxyAPIPlus) 项目！
