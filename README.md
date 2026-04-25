# TokenBao

> AI API Token 节省工具 - 通过代理优化减少 Token 消耗

## 简介

TokenBao 是一个 Electron 桌面应用，通过本地代理服务器优化 AI API 调用，帮助节省 Token 消耗和成本。

## 功能特性

### 核心功能

- **代理服务器**: 本地 HTTP 代理，拦截所有 AI API 请求
- **多 API 支持**: OpenAI、Anthropic 等 AI 服务商
- **实时监控**: Token 使用量、费用统计、请求历史

### 优化策略

1. **缓存策略**: 相似请求复用响应，减少重复调用
2. **压缩优化**: 移除冗余内容，减少 Token 数量
3. **智能路由**: 根据需求选择最优模型
4. **预算控制**: 设置预算上限，防止超支

### 数据安全

- API Key AES-256-GCM 加密存储
- 本地 JSON 文件持久化
- 无云端数据传输

## 安装

### macOS

1. 下载 DMG 文件：[GitHub Releases](https://github.com/Yqghlx/tokenBao/releases)
2. 双击打开 DMG
3. 拖拽到 Applications 文件夹
4. 首次运行：右键点击 → 打开（绕过未签名警告）

### Windows

1. 下载 EXE 文件：[GitHub Releases](https://github.com/Yqghlx/tokenBao/releases)
2. 双击运行安装程序
3. 按提示完成安装

## 使用方法

### 1. 配置代理

```
应用地址: http://localhost:3000
```

将 AI 应用或代码的 API 地址设置为：
- OpenAI: `http://localhost:3000/v1`
- Anthropic: `http://localhost:3000/v1`

### 2. 添加 API Key

在「API Keys」页面：
1. 点击「添加 API Key」
2. 选择服务商类型（OpenAI / Anthropic）
3. 输入 API Key
4. 保存

### 3. 启动代理

在「控制面板」页面：
1. 点击「启动代理」按钮
2. 状态变为「运行中」即成功

### 4. 查看统计

在「监控」页面查看：
- Token 使用量
- 节省比例
- 请求历史
- 费用统计

## 优化配置

在「优化配置」页面：

| 策略 | 说明 | 建议 |
|---|---|---|
| 缓存 | 相似请求复用 | 开启 |
| 压缩 | 移除冗余内容 | 开启 |
| 路由 | 模型选择优化 | 按需 |
| 批处理 | 合并多个请求 | 实验性 |

## 数据存储

数据存储位置：
```
~/Library/Application Support/tokenbao/data/
```

包含文件：
- `config.json`: 应用配置
- `apiKeys.json`: 加密的 API Key
- `history.json`: 请求历史
- `stats.json`: 统计数据
- `budget.json`: 预算设置
- `cache.json`: 缓存数据

## 开发

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发模式
npm run dev

# 运行测试
npm test

# 代码检查
npm run lint
```

### 构建

```bash
# 构建 TypeScript
npm run build

# 构建前端
npm run build:renderer

# 打包应用
npm run package
```

### 项目结构

```
tokenBao/
├── src/
│   ├── main/          # Electron 主进程
│   ├── renderer/      # React 前端
│   ├── proxy/         # 代理服务器
│   ├── optimizations/ # 优化策略
│   ├── services/      # 数据服务
│   └── utils/         # 工具模块
├── dist/              # 构建输出
├── release/           # 打包输出
└── .github/           # CI/CD 配置
```

## 测试

测试覆盖：
- 单元测试: 41 tests
- 集成测试: API 流程测试
- ESLint: 0 errors

```bash
npm test
```

## 自动更新

应用启动时自动检查 GitHub Releases 更新。发现新版本时会提示下载。

## 技术栈

- **Electron**: 桌面应用框架
- **React**: 前端框架
- **TypeScript**: 类型安全
- **Vite**: 前端构建工具
- **electron-builder**: 打包工具

## 常见问题

### macOS 无法打开

首次运行时，macOS 可能提示"无法验证开发者"。

解决方法：
1. 右键点击应用 → 打开
2. 或在系统设置 → 安全性与隐私 → 点击"仍要打开"

### 代理无法启动

检查：
1. 端口 3000 是否被占用
2. API Key 是否正确配置

### 统计不准确

- Token 估算基于算法，非精确计数
- 不同 API 计费方式不同

## 贡献

欢迎提交 Issue 和 Pull Request。

## 许可证

MIT License

## 下载

最新版本：[GitHub Releases](https://github.com/Yqghlx/tokenBao/releases)

---

**节省 Token，降低成本** 🎯