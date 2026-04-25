# TokenBao 发布指南

## 开发

```bash
# 启动开发环境
npm run dev

# 运行测试
npm test

# 代码检查
npm run lint
npm run format
```

## 构建

```bash
# 构建主进程
npm run build

# 构建前端
npm run build:renderer

# 完整检查
npm run check
```

## 打包发布

```bash
# 打包所有平台
npm run package

# 仅打包 macOS
npm run package:mac

# 仅打包 Windows
npm run package:win
```

## 发布流程

1. 更新版本号
   ```bash
   npm version patch  # 或 minor, major
   ```

2. 确保 CI 通过
   - GitHub Actions 自动运行测试
   - 检查 Actions 页面确认

3. 创建 Release
   ```bash
   git push --follow-tags
   ```
   
4. 打包上传
   - 在 GitHub Release 页面上传 DMG/NSIS 文件

## 自动更新

用户安装后，应用会自动检查 GitHub Releases 更新。

配置位置：
- `package.json` 的 `build.publish` 部分
- 需替换 `owner` 和 `repo` 为实际 GitHub 用户名和仓库

## 文件结构

```
dist/
├── main/          # 主进程代码
├── renderer/      # 前端代码
├── optimizations/ # 优化策略
├── services/      # 数据服务
└── utils/         # 工具模块

release/
├── TokenBao-{version}.dmg  # macOS 安装包
├── TokenBao Setup {version}.exe  # Windows 安装包
```

## 注意事项

- 打包前确保 `npm run build` 成功
- macOS 打包需要在 macOS 系统上执行
- Windows 打包可以在任何平台执行（需要 wine）
- 发布前更新 `package.json` 中的 GitHub 用户名