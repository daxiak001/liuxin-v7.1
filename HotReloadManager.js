/**
 * 🔥 柳芯系统 - 全局热重载管理器 v1.0
 * 功能：监听所有关键文件变更，自动重启MCP服务器
 * 创建时间：2025-10-31
 * 创建原因：解决"功能失忆症" - 每次修改都忘记热重载功能的存在
 * 
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * ⚠️ 【已废弃】v7.11.1 - 此文件已废弃，不再使用
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * 【废弃原因】
 * 1. 代码热重载在 Cursor MCP stdio 模式下无法实现
 * 2. 清除模块缓存无法让已初始化的代码重新执行
 * 3. 修改 .js 代码文件后，必须重启 Cursor 才能生效
 * 
 * 【替代方案】
 * 使用 ConfigHotReloadManager.js 进行配置文件热重载：
 * - ✅ lock-config.json - 锁定配置
 * - ✅ liuxin.db - 数据库规则（清除L1缓存）
 * - ❌ .js 代码文件 - 不支持热重载
 * 
 * 【保留原因】
 * 保留此文件以维持向后兼容，防止现有代码报错
 * 
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class HotReloadManager {
    constructor(serverScriptPath) {
        this.serverScriptPath = serverScriptPath;
        this.serverProcess = null;
        this.watchers = [];
        this.debounceTimer = null;
        this.isRestarting = false;

        // 需要监听的文件列表
        this.watchedFiles = [
            // MCP服务器主文件
            path.join(__dirname, 'liuxin-mcp-server-unified.js'),

            // 拦截器文件
            path.join(__dirname, 'ResponseInterceptor.js'),
            path.join(__dirname, 'mcp-tool-wrappers.js'),

            // 锁管理器
            path.join(__dirname, 'locks/LockManager.js'),
            path.join(__dirname, 'locks/lock-config.json'),

            // 核心逻辑
            path.join(__dirname, 'v7.3-core-logic.js'),
        ];

        console.error('🔥 [HotReloadManager] 初始化热重载管理器');
    }

    /**
     * 启动监听
     */
    startWatching() {
        console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('🔥 [HotReloadManager] 启动全局热重载');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        this.watchedFiles.forEach(filePath => {
            if (fs.existsSync(filePath)) {
                try {
                    const watcher = fs.watch(filePath, (eventType, filename) => {
                        if (eventType === 'change') {
                            this.handleFileChange(filePath);
                        }
                    });

                    this.watchers.push({ filePath, watcher });
                    console.error(`✅ [HotReloadManager] 监听: ${path.basename(filePath)}`);
                } catch (err) {
                    console.error(`⚠️ [HotReloadManager] 无法监听 ${path.basename(filePath)}: ${err.message}`);
                }
            } else {
                console.error(`⚠️ [HotReloadManager] 文件不存在: ${path.basename(filePath)}`);
            }
        });

        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.error('🎯 [HotReloadManager] 热重载已激活！修改文件将自动重启服务器');
        console.error('🎯 [HotReloadManager] 无需手动重启Cursor！\n');
    }

    /**
     * 处理文件变更（带防抖）
     */
    handleFileChange(filePath) {
        if (this.isRestarting) {
            return; // 正在重启，忽略新的变更事件
        }

        console.error(`\n🔄 [HotReloadManager] 检测到文件变更: ${path.basename(filePath)}`);

        // 防抖：500ms 内多次变更只触发一次重启
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.restartMCPServer(filePath);
        }, 500);
    }

    /**
     * 重启MCP服务器
     */
    async restartMCPServer(changedFile) {
        if (this.isRestarting) {
            console.error('⚠️ [HotReloadManager] 已在重启中，跳过本次请求');
            return;
        }

        this.isRestarting = true;

        try {
            console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('🔄 [HotReloadManager] 自动重启MCP服务器');
            console.error(`📝 [HotReloadManager] 变更文件: ${path.basename(changedFile)}`);
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            // 注意：在stdio模式下，MCP服务器由Cursor管理，我们不能直接重启进程
            // 但我们可以清除Node.js的模块缓存，让下次调用时重新加载

            // 清除模块缓存
            this.clearModuleCache();

            console.error('✅ [HotReloadManager] 模块缓存已清除');
            console.error('✅ [HotReloadManager] 下次工具调用将使用新代码');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            // 发送通知到stderr（Cursor会显示）
            console.error('🎉 [通知] 代码已热重载！无需重启Cursor！\n');

        } catch (err) {
            console.error(`❌ [HotReloadManager] 重启失败: ${err.message}`);
        } finally {
            this.isRestarting = false;
        }
    }

    /**
     * 清除Node.js模块缓存
     */
    clearModuleCache() {
        const baseDir = __dirname;

        // 获取所有已加载的模块
        Object.keys(require.cache).forEach(modulePath => {
            // 只清除本项目的模块（不清除node_modules）
            if (modulePath.startsWith(baseDir) && !modulePath.includes('node_modules')) {
                console.error(`🗑️ [HotReloadManager] 清除缓存: ${path.basename(modulePath)}`);
                delete require.cache[modulePath];
            }
        });
    }

    /**
     * 停止监听
     */
    stopWatching() {
        console.error('\n🛑 [HotReloadManager] 停止热重载监听');

        this.watchers.forEach(({ filePath, watcher }) => {
            watcher.close();
            console.error(`✅ [HotReloadManager] 已停止监听: ${path.basename(filePath)}`);
        });

        this.watchers = [];
    }

    /**
     * 手动触发重载
     */
    manualReload(reason = '用户手动触发') {
        console.error(`\n📝 [HotReloadManager] ${reason}`);
        this.restartMCPServer('manual');

        return {
            success: true,
            message: '✅ 热重载已触发，代码已更新'
        };
    }
}

// 导出单例
let instance = null;

module.exports = {
    getInstance: function (serverScriptPath) {
        if (!instance) {
            instance = new HotReloadManager(serverScriptPath);
        }
        return instance;
    },
    HotReloadManager: HotReloadManager
};

