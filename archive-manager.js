/**
 * 归档管理器 v1.0.0
 * 功能：聊天记录、Bug修复、项目快照的永久存储和查询
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class ArchiveManager {
    constructor(baseDir = './archives') {
        this.baseDir = baseDir;
        this.dbPath = './liuxin.db';
        this.db = null;

        // 初始化数据库连接
        try {
            this.db = new Database(this.dbPath);
            console.log('✅ 归档管理器已连接到数据库');
        } catch (err) {
            console.error('⚠️ 数据库连接失败:', err.message);
        }
    }

    // ============================================================
    // 核心功能1: 保存聊天记录
    // ============================================================

    /**
     * 保存聊天记录
     * @param {string} userQuery - 用户消息
     * @param {string} aiResponse - AI回复
     * @param {object} metadata - 元数据（标签、关键词等）
     */
    async saveChat(userQuery, aiResponse, metadata = {}) {
        try {
            const timestamp = new Date();
            const id = this.generateChatId(timestamp);

            // 格式化聊天记录
            const content = this.formatChatRecord({
                userQuery,
                aiResponse,
                timestamp,
                id,
                ...metadata
            });

            // 生成文件路径
            const filePath = this.getChatFilePath(timestamp, id);

            // 确保目录存在
            await this.ensureDir(path.dirname(filePath));

            // 写入文件
            await fs.writeFile(filePath, content, 'utf-8');

            // 更新索引
            await this.updateIndex('chat', {
                id,
                date: this.formatDate(timestamp),
                time: this.formatTime(timestamp),
                file: filePath,
                summary: metadata.summary || this.generateSummary(userQuery),
                keywords: metadata.keywords || this.extractKeywords(userQuery),
                tags: metadata.tags || [],
                generated_files: metadata.generated_files || []
            });

            console.log(`✅ 聊天记录已保存: ${filePath}`);
            return { success: true, id, filePath };

        } catch (err) {
            console.error('❌ 保存聊天记录失败:', err.message);
            await this.logError('saveChat', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * 格式化聊天记录
     */
    formatChatRecord(data) {
        const { userQuery, aiResponse, timestamp, id, summary, keywords, tags, generated_files } = data;

        return `# 聊天记录

**日期**: ${this.formatDate(timestamp)}  
**时间**: ${this.formatTime(timestamp)}  
**序号**: ${id}  
**标签**: [${(tags || []).join(', ')}]  
**关键词**: ${(keywords || []).join(', ')}  

---

## 对话摘要

${summary || '无'}

---

## 用户消息

${userQuery}

---

## AI回复

${aiResponse}

---

## 生成的文件

${(generated_files || []).map(f => `- ${f}`).join('\n') || '无'}

---

**归档时间**: ${timestamp.toISOString()}  
**归档系统版本**: v1.0.0  
`;
    }

    // ============================================================
    // 核心功能2: 保存Bug修复记录
    // ============================================================

    /**
     * 保存Bug修复记录
     */
    async saveBugFix(bugData) {
        try {
            const {
                title,
                description,
                rootCause,
                solution,
                severity = 'MEDIUM',
                status = '已修复',
                relatedChats = [],
                relatedFiles = []
            } = bugData;

            const timestamp = new Date();
            const id = this.generateBugId(timestamp);

            // 格式化Bug记录
            const content = this.formatBugRecord({
                id,
                title,
                description,
                rootCause,
                solution,
                severity,
                status,
                relatedChats,
                relatedFiles,
                timestamp
            });

            // 生成文件路径
            const filePath = this.getBugFilePath(timestamp, id, title);

            // 确保目录存在
            await this.ensureDir(path.dirname(filePath));

            // 写入文件
            await fs.writeFile(filePath, content, 'utf-8');

            // 更新索引
            await this.updateIndex('bug', {
                id,
                date: this.formatDate(timestamp),
                title,
                severity,
                status,
                file: filePath
            });

            console.log(`✅ Bug修复记录已保存: ${filePath}`);
            return { success: true, id, filePath };

        } catch (err) {
            console.error('❌ 保存Bug记录失败:', err.message);
            await this.logError('saveBugFix', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * 格式化Bug修复记录
     */
    formatBugRecord(data) {
        const { id, title, description, rootCause, solution, severity, status, relatedChats, relatedFiles, timestamp } = data;

        return `# Bug修复记录

**Bug ID**: ${id}  
**标题**: ${title}  
**发现日期**: ${this.formatDate(timestamp)}  
**修复日期**: ${this.formatDate(timestamp)}  
**严重性**: ${this.getSeverityIcon(severity)} ${severity}  
**状态**: ${status === '已修复' ? '✅' : '⚠️'} ${status}  

---

## 问题描述

${description}

---

## 根本原因

${rootCause}

---

## 解决方案

${solution}

---

## 相关聊天记录

${relatedChats.map(chat => `- ${chat}`).join('\n') || '无'}

---

## 相关文件

${relatedFiles.map(file => `- ${file}`).join('\n') || '无'}

---

**归档时间**: ${timestamp.toISOString()}  
**归档系统版本**: v1.0.0  
`;
    }

    // ============================================================
    // 核心功能3: 创建项目快照
    // ============================================================

    /**
     * 创建项目快照
     */
    async createSnapshot() {
        try {
            const timestamp = new Date();
            const snapshot = await this.collectSystemState();

            const filePath = this.getSnapshotFilePath(timestamp);
            await this.ensureDir(path.dirname(filePath));

            await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');

            console.log(`✅ 项目快照已创建: ${filePath}`);
            return { success: true, timestamp, filePath };

        } catch (err) {
            console.error('❌ 创建快照失败:', err.message);
            await this.logError('createSnapshot', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * 收集系统状态
     */
    async collectSystemState() {
        const timestamp = new Date();

        // 收集系统信息
        const systemInfo = {
            version: 'v7.10.7',
            timestamp: timestamp.toISOString(),
            date: this.formatDate(timestamp)
        };

        // 收集数据库统计
        const dbStats = this.db ? {
            tables: this.db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get().count,
            rules: this.db.prepare("SELECT COUNT(*) as count FROM liuxin_mcp_interceptor_rules").get().count,
            skills: this.db.prepare("SELECT COUNT(*) as count FROM skills").get().count,
            experiences: this.db.prepare("SELECT COUNT(*) as count FROM experiences").get().count
        } : null;

        // 收集文件统计
        const fileStats = await this.collectFileStats();

        return {
            system: systemInfo,
            database: dbStats,
            files: fileStats
        };
    }

    /**
     * 收集文件统计
     */
    async collectFileStats() {
        try {
            const files = await fs.readdir('.');
            return {
                total: files.length,
                js_files: files.filter(f => f.endsWith('.js')).length,
                md_files: files.filter(f => f.endsWith('.md')).length,
                json_files: files.filter(f => f.endsWith('.json')).length
            };
        } catch (err) {
            return { error: err.message };
        }
    }

    // ============================================================
    // 核心功能4: 索引管理
    // ============================================================

    /**
     * 更新索引
     */
    async updateIndex(type, data) {
        try {
            // 加载主索引
            const masterIndexPath = path.join(this.baseDir, 'master-index.json');
            let masterIndex = await this.loadIndex(masterIndexPath);

            if (!masterIndex) {
                masterIndex = this.createEmptyMasterIndex();
            }

            // 更新统计
            if (type === 'chat') {
                masterIndex.total_chats++;
                masterIndex.recent.unshift(data);
                masterIndex.recent = masterIndex.recent.slice(0, 20); // 只保留最近20条

                // 更新快速搜索
                const date = data.date;
                if (!masterIndex.quick_search.by_date[date]) {
                    masterIndex.quick_search.by_date[date] = [];
                }
                masterIndex.quick_search.by_date[date].push(data.id);

                // 更新关键词索引
                (data.keywords || []).forEach(keyword => {
                    if (!masterIndex.quick_search.by_keyword[keyword]) {
                        masterIndex.quick_search.by_keyword[keyword] = [];
                    }
                    masterIndex.quick_search.by_keyword[keyword].push(data.id);
                });

            } else if (type === 'bug') {
                masterIndex.total_bugs++;
            } else if (type === 'snapshot') {
                masterIndex.total_snapshots++;
            }

            masterIndex.last_updated = new Date().toISOString();

            // 保存主索引
            await fs.writeFile(masterIndexPath, JSON.stringify(masterIndex, null, 2), 'utf-8');

            // 更新月度索引
            await this.updateMonthlyIndex(type, data);

        } catch (err) {
            console.error('❌ 更新索引失败:', err.message);
        }
    }

    /**
     * 更新月度索引
     */
    async updateMonthlyIndex(type, data) {
        try {
            const date = new Date();
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');

            const monthlyIndexPath = path.join(
                this.baseDir,
                `${type === 'chat' ? 'chat-history' : 'bug-fixes'}`,
                String(year),
                `index-${year}-${month}.json`
            );

            let monthlyIndex = await this.loadIndex(monthlyIndexPath);

            if (!monthlyIndex) {
                monthlyIndex = {
                    year,
                    month: parseInt(month),
                    total_chats: 0,
                    total_bugs: 0,
                    chats: [],
                    bugs: []
                };
            }

            if (type === 'chat') {
                monthlyIndex.total_chats++;
                monthlyIndex.chats.push(data);
            } else if (type === 'bug') {
                monthlyIndex.total_bugs++;
                monthlyIndex.bugs.push(data);
            }

            await this.ensureDir(path.dirname(monthlyIndexPath));
            await fs.writeFile(monthlyIndexPath, JSON.stringify(monthlyIndex, null, 2), 'utf-8');

        } catch (err) {
            console.error('❌ 更新月度索引失败:', err.message);
        }
    }

    /**
     * 加载索引
     */
    async loadIndex(indexPath) {
        try {
            const content = await fs.readFile(indexPath, 'utf-8');
            return JSON.parse(content);
        } catch (err) {
            return null;
        }
    }

    /**
     * 创建空的主索引
     */
    createEmptyMasterIndex() {
        return {
            version: '1.0.0',
            last_updated: new Date().toISOString(),
            total_chats: 0,
            total_bugs: 0,
            total_snapshots: 0,
            quick_search: {
                by_date: {},
                by_keyword: {},
                by_tag: {}
            },
            recent: []
        };
    }

    // ============================================================
    // 辅助函数
    // ============================================================

    /**
     * 生成聊天ID
     */
    generateChatId(timestamp) {
        const date = this.formatDate(timestamp).replace(/-/g, '');
        const time = this.formatTime(timestamp).replace(/:/g, '');

        // 生成今天的序号
        const todayDir = path.join(
            this.baseDir,
            'chat-history',
            String(timestamp.getFullYear()),
            `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}`,
            this.formatDate(timestamp)
        );

        try {
            if (fsSync.existsSync(todayDir)) {
                const files = fsSync.readdirSync(todayDir);
                const chatFiles = files.filter(f => f.startsWith('chat-'));
                return `chat-${String(chatFiles.length + 1).padStart(3, '0')}-${time}`;
            }
        } catch (err) {
            // 忽略错误
        }

        return `chat-001-${time}`;
    }

    /**
     * 生成Bug ID
     */
    generateBugId(timestamp) {
        const year = timestamp.getFullYear();
        const month = String(timestamp.getMonth() + 1).padStart(2, '0');
        const day = String(timestamp.getDate()).padStart(2, '0');

        // 生成今天的序号
        const todayDir = path.join(
            this.baseDir,
            'bug-fixes',
            String(year),
            `${year}-${month}`
        );

        try {
            if (fsSync.existsSync(todayDir)) {
                const files = fsSync.readdirSync(todayDir);
                const bugFiles = files.filter(f => f.startsWith('bug-'));
                const seq = String(bugFiles.length + 1).padStart(3, '0');
                return `BUG-${year}-${month}-${seq}`;
            }
        } catch (err) {
            // 忽略错误
        }

        return `BUG-${year}-${month}-001`;
    }

    /**
     * 获取聊天文件路径
     */
    getChatFilePath(timestamp, id) {
        const year = timestamp.getFullYear();
        const month = String(timestamp.getMonth() + 1).padStart(2, '0');
        const date = this.formatDate(timestamp);

        return path.join(
            this.baseDir,
            'chat-history',
            String(year),
            `${year}-${month}`,
            date,
            `${id}.md`
        );
    }

    /**
     * 获取Bug文件路径
     */
    getBugFilePath(timestamp, id, title) {
        const year = timestamp.getFullYear();
        const month = String(timestamp.getMonth() + 1).padStart(2, '0');

        // 清理标题，用作文件名
        const cleanTitle = title
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
            .substring(0, 50);

        return path.join(
            this.baseDir,
            'bug-fixes',
            String(year),
            `${year}-${month}`,
            `${id.toLowerCase()}-${cleanTitle}.md`
        );
    }

    /**
     * 获取快照文件路径
     */
    getSnapshotFilePath(timestamp) {
        const date = this.formatDate(timestamp);
        const version = 'v7.10.7';

        return path.join(
            this.baseDir,
            'project-snapshots',
            `snapshot-${date}-${version}.json`
        );
    }

    /**
     * 确保目录存在
     */
    async ensureDir(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (err) {
            // 目录已存在，忽略错误
        }
    }

    /**
     * 记录错误日志
     */
    async logError(operation, error) {
        try {
            const logPath = path.join(this.baseDir, 'system-logs', 'errors.log');
            await this.ensureDir(path.dirname(logPath));

            const logEntry = `[${new Date().toISOString()}] ${operation}: ${error.message}\n`;
            await fs.appendFile(logPath, logEntry, 'utf-8');
        } catch (err) {
            console.error('无法写入错误日志:', err.message);
        }
    }

    /**
     * 格式化日期
     */
    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * 格式化时间
     */
    formatTime(date) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    /**
     * 生成摘要
     */
    generateSummary(text) {
        // 简单实现：取前100字符
        return text.substring(0, 100) + (text.length > 100 ? '...' : '');
    }

    /**
     * 提取关键词
     */
    extractKeywords(text) {
        // 简单实现：提取常见技术关键词
        const keywords = [];
        const patterns = [
            '团队模式', '预加载', '角色', '断链', '分裂', '修复', 'Bug', '诊断',
            '统计', '锁定', '热重载', 'MCP', 'HTTP', '数据库'
        ];

        patterns.forEach(pattern => {
            if (text.includes(pattern)) {
                keywords.push(pattern);
            }
        });

        return keywords;
    }

    /**
     * 获取严重性图标
     */
    getSeverityIcon(severity) {
        const icons = {
            'LOW': '🟢',
            'MEDIUM': '🟡',
            'HIGH': '🔴',
            'CRITICAL': '🔥'
        };
        return icons[severity] || '⚪';
    }

    /**
     * 关闭数据库连接
     */
    // ============================================================
    // 新增功能: 自动同步系统文档
    // ============================================================

    /**
     * 同步系统文档
     * @param {string} reason - 同步原因（如："修复Bug"、"新增功能"、"修改规则"）
     * @returns {boolean} 是否同步成功
     */
    async syncSystemDoc(reason = '系统更新') {
        try {
            console.log(`\n🔄 [文档同步] 开始同步系统文档...`);
            console.log(`   原因: ${reason}`);

            // 运行文档生成脚本
            const { stdout, stderr } = await execPromise('node generate-system-doc.js', {
                cwd: __dirname
            });

            // 检查是否成功
            if (stdout.includes('✅ 文档生成成功')) {
                console.log('✅ [文档同步] 系统文档已更新');
                return true;
            } else {
                console.error('❌ [文档同步] 文档生成失败');
                console.error(stderr);
                return false;
            }
        } catch (error) {
            console.error('❌ [文档同步] 同步失败:', error.message);
            return false;
        }
    }

    /**
     * 检测是否需要同步文档
     * @param {Array<string>} modifiedFiles - 修改的文件列表
     * @returns {boolean} 是否需要同步
     */
    shouldSyncDoc(modifiedFiles = []) {
        // 关键文件变更，需要同步文档
        const criticalFiles = [
            'liuxin-mcp-server-unified.js',
            'ResponseInterceptor.js',
            'v7.3-core-logic.js',
            'fusion-phase2-memory-loader.js',
            'locks/LockManager.js',
            'locks/lock-config.json',
            '.cursorrules',
            'liuxin.db'
        ];

        return modifiedFiles.some(file =>
            criticalFiles.some(critical => file.includes(critical))
        );
    }

    /**
     * 保存聊天记录并自动同步文档（增强版）
     */
    async saveChatWithSync(userQuery, aiResponse, metadata = {}) {
        // 先保存聊天记录
        await this.saveChat(userQuery, aiResponse, metadata);

        // 检查是否需要同步文档
        const modifiedFiles = metadata.modifiedFiles || [];
        const isBugFix = metadata.isBugFix || false;
        const isFeatureAdd = metadata.isFeatureAdd || false;

        if (this.shouldSyncDoc(modifiedFiles) || isBugFix || isFeatureAdd) {
            const reason = isBugFix ? '修复Bug' : isFeatureAdd ? '新增功能' : '系统更新';
            await this.syncSystemDoc(reason);
        }
    }

    /**
     * 保存Bug修复并自动同步文档（增强版）
     */
    async saveBugFixWithSync(bugData) {
        // 先保存Bug修复记录
        await this.saveBugFix(bugData);

        // 自动同步文档
        await this.syncSystemDoc(`修复Bug: ${bugData.title}`);
    }

    close() {
        if (this.db) {
            this.db.close();
            console.log('✅ 归档管理器已关闭数据库连接');
        }
    }
}

// 导出
module.exports = ArchiveManager;

// 命令行使用
if (require.main === module) {
    const manager = new ArchiveManager();

    console.log('\n📁 归档管理器 v1.0.0\n');
    console.log('使用示例:');
    console.log('  const ArchiveManager = require(\'./archive-manager.js\');');
    console.log('  const manager = new ArchiveManager();');
    console.log('  await manager.saveChat(userQuery, aiResponse, metadata);');
    console.log('');

    manager.close();
}

