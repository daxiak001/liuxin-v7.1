#!/bin/bash
# 柳芯系统自动同步到GitHub脚本
# 版本: v1.0
# 用途: 自动备份系统到GitHub并提交

set -e

REPO_URL="git@github.com:daxiak001/liuxin-v7.1.git"
REPO_DIR="/home/ubuntu/liuxin-v7.1"
SOURCE_DIR="/home/ubuntu/liuxin-system"
LOG_FILE="/home/ubuntu/liuxin-system/logs/github-sync.log"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"
echo "🔄 柳芯系统自动同步到GitHub" | tee -a "$LOG_FILE"
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"

cd /home/ubuntu

# 1. 检查仓库是否已克隆
if [ ! -d "$REPO_DIR" ]; then
    echo "📥 首次运行，正在克隆仓库..." | tee -a "$LOG_FILE"
    git clone "$REPO_URL" "$REPO_DIR" 2>&1 | tee -a "$LOG_FILE"
    echo "✅ 仓库克隆完成" | tee -a "$LOG_FILE"
else
    echo "📂 仓库已存在，更新中..." | tee -a "$LOG_FILE"
    cd "$REPO_DIR"
    git pull origin main 2>&1 | tee -a "$LOG_FILE" || git pull origin master 2>&1 | tee -a "$LOG_FILE"
    echo "✅ 仓库已更新" | tee -a "$LOG_FILE"
fi

cd "$REPO_DIR"

# 2. 同步文件到仓库（排除敏感文件和大文件）
echo "" | tee -a "$LOG_FILE"
echo "📋 正在同步系统文件..." | tee -a "$LOG_FILE"

# 创建.gitignore（如果不存在）
if [ ! -f ".gitignore" ]; then
    cat > .gitignore << 'EOF'
# Node.js
node_modules/
npm-debug.log*
package-lock.json

# 日志文件
*.log
logs/

# 数据库文件（太大）
*.db
*.db-shm
*.db-wal

# 备份文件
backups/
archives/
*.tar.gz
*.zip

# 临时文件
tmp/
temp/
.tmp/

# 敏感文件
.env
*.key
*.pem
*.ppk

# 系统文件
.DS_Store
Thumbs.db
EOF
    echo "✅ .gitignore 已创建" | tee -a "$LOG_FILE"
fi

# 同步主要文件
echo "📂 同步主MCP服务器文件..." | tee -a "$LOG_FILE"
cp -f "$SOURCE_DIR/liuxin-mcp-server.js" ./ 2>&1 | tee -a "$LOG_FILE"
cp -f "$SOURCE_DIR/l0-mcp-server-http.js" ./ 2>&1 | tee -a "$LOG_FILE"
cp -f "$SOURCE_DIR/liuxin-gui-server-enhanced.js" ./ 2>&1 | tee -a "$LOG_FILE"

echo "📂 同步MCP工具目录..." | tee -a "$LOG_FILE"
rsync -av --exclude='*.log' "$SOURCE_DIR/mcp_tools/" ./mcp_tools/ 2>&1 | tee -a "$LOG_FILE"

echo "📂 同步脚本目录..." | tee -a "$LOG_FILE"
rsync -av --exclude='*.log' "$SOURCE_DIR/scripts/" ./scripts/ 2>&1 | tee -a "$LOG_FILE"

echo "📂 同步配置文件..." | tee -a "$LOG_FILE"
cp -f "$SOURCE_DIR/package.json" ./ 2>/dev/null || echo "⚠️ package.json 不存在" | tee -a "$LOG_FILE"
cp -f "$SOURCE_DIR/.cursorrules" ./ 2>/dev/null || echo "⚠️ .cursorrules 不存在" | tee -a "$LOG_FILE"

echo "📂 同步monitoring目录（排除日志）..." | tee -a "$LOG_FILE"
rsync -av --exclude='*.log' --exclude='*.db' "$SOURCE_DIR/monitoring/" ./monitoring/ 2>&1 | tee -a "$LOG_FILE"

# 创建README.md（如果不存在）
if [ ! -f "README.md" ]; then
    cat > README.md << 'EOF'
# 柳芯系统 v7.1

云端智能MCP系统 - 完全统一架构版本

## 📋 系统概述

柳芯系统v7.1是一个云端智能MCP（Model Context Protocol）系统，采用完全统一的架构设计。

## 🏗️ 系统架构

- **MCP STDIO服务器**: `liuxin-mcp-server.js`
- **HTTP API服务器**: `l0-mcp-server-http.js`
- **GUI增强服务器**: `liuxin-gui-server-enhanced.js`
- **MCP工具模块**: `mcp_tools/`
- **系统脚本**: `scripts/`
- **监控模块**: `monitoring/`

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 启动MCP服务器

```bash
node liuxin-mcp-server.js
```

### 启动HTTP API服务器

```bash
node l0-mcp-server-http.js
```

### 启动GUI服务器

```bash
node liuxin-gui-server-enhanced.js
```

## 📊 主要功能

- ✅ 37+ MCP工具
- ✅ 云端规则引擎
- ✅ 团队模式（5个角色）
- ✅ 智能场景分析
- ✅ 代码/命令拦截器
- ✅ GUI测试拦截
- ✅ 技能学习系统
- ✅ 错误经验系统
- ✅ 项目管理
- ✅ 版本管理
- ✅ 系统监控

## 📝 版本信息

- **版本**: v7.1
- **架构**: 统一云端化架构
- **规则数**: 61条
- **MCP工具**: 37个
- **更新时间**: 2025-10-21

## 🔄 自动同步

本仓库通过自动同步脚本定期更新，保持与云端系统同步。

## 📄 许可证

MIT License

---

**注意**: 本仓库仅包含系统源码，不包含数据库文件和日志文件。
EOF
    echo "✅ README.md 已创建" | tee -a "$LOG_FILE"
fi

# 3. Git提交
echo "" | tee -a "$LOG_FILE"
echo "📝 正在提交更改..." | tee -a "$LOG_FILE"

# 添加所有文件
git add . 2>&1 | tee -a "$LOG_FILE"

# 检查是否有更改
if git diff --cached --quiet; then
    echo "ℹ️ 没有新的更改需要提交" | tee -a "$LOG_FILE"
else
    # 提交更改
    COMMIT_MSG="🔄 自动同步 $(date '+%Y-%m-%d %H:%M:%S')"
    git commit -m "$COMMIT_MSG" 2>&1 | tee -a "$LOG_FILE"
    echo "✅ 更改已提交" | tee -a "$LOG_FILE"
    
    # 推送到GitHub
    echo "📤 正在推送到GitHub..." | tee -a "$LOG_FILE"
    git push origin main 2>&1 | tee -a "$LOG_FILE" || git push origin master 2>&1 | tee -a "$LOG_FILE"
    echo "✅ 已推送到GitHub" | tee -a "$LOG_FILE"
fi

echo "" | tee -a "$LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"
echo "🎉 同步完成！" | tee -a "$LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"

