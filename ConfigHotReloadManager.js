/**
 * 🔥 柳芯系统 - 统一配置热重载管理器 v1.0
 * 功能：监听所有配置文件变更，自动重新加载配置
 * 创建时间：2025-10-31
 * 
 * 【重要说明】
 * 1. 只支持配置文件热重载（JSON文件）
 * 2. 不支持代码文件热重载（.js文件）- 这是Cursor MCP架构限制
 * 3. 修改代码文件必须重启Cursor才能生效
 */

const fs = require('fs');
const path = require('path');

class ConfigHotReloadManager {
    constructor() {
        this.watchers = new Map(); // 文件路径 -> { watcher, callback, debounceTimer }
        this.reloadHandlers = new Map(); // 配置类型 -> reload函数

        console.error('🔥 [ConfigHotReload] 统一配置热重载管理器初始化');
    }

    /**
     * 注册配置文件监听
     * @param {string} configType - 配置类型标识（如 'lock-config', 'db-rules'）
     * @param {string} filePath - 配置文件路径
     * @param {function} reloadCallback - 重载回调函数
     */
    register(configType, filePath, reloadCallback) {
        const absolutePath = path.resolve(filePath);

        if (!fs.existsSync(absolutePath)) {
            console.error(`⚠️ [ConfigHotReload] 配置文件不存在: ${path.basename(absolutePath)}`);
            return false;
        }

        // 检查是否已注册
        if (this.watchers.has(absolutePath)) {
            console.error(`⚠️ [ConfigHotReload] 配置已注册: ${path.basename(absolutePath)}`);
            return false;
        }

        try {
            // 启动文件监听
            const watcher = fs.watch(absolutePath, (eventType, filename) => {
                if (eventType === 'change') {
                    this.handleFileChange(configType, absolutePath);
                }
            });

            // 保存监听器
            this.watchers.set(absolutePath, {
                configType,
                watcher,
                debounceTimer: null
            });

            // 保存重载函数
            this.reloadHandlers.set(configType, reloadCallback);

            console.error(`✅ [ConfigHotReload] 已注册: [${configType}] ${path.basename(absolutePath)}`);
            return true;

        } catch (err) {
            console.error(`❌ [ConfigHotReload] 注册失败: ${err.message}`);
            return false;
        }
    }

    /**
     * 处理文件变更（带防抖）
     */
    handleFileChange(configType, filePath) {
        const watcherInfo = this.watchers.get(filePath);
        if (!watcherInfo) return;

        console.error(`\n🔄 [ConfigHotReload] 检测到配置变更: [${configType}] ${path.basename(filePath)}`);

        // 防抖：300ms 内多次变更只触发一次重载
        clearTimeout(watcherInfo.debounceTimer);
        watcherInfo.debounceTimer = setTimeout(() => {
            this.reloadConfig(configType, filePath);
        }, 300);
    }

    /**
     * 重新加载配置
     */
    reloadConfig(configType, filePath) {
        try {
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error(`🔄 [ConfigHotReload] 重新加载配置: [${configType}]`);
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            // 调用注册的重载函数
            const reloadHandler = this.reloadHandlers.get(configType);
            if (reloadHandler) {
                const result = reloadHandler(filePath);

                if (result && result.success !== false) {
                    console.error(`✅ [ConfigHotReload] 配置已更新: [${configType}]`);
                    if (result.message) {
                        console.error(`   ${result.message}`);
                    }
                } else {
                    console.error(`⚠️ [ConfigHotReload] 配置更新异常: ${result?.message || '未知错误'}`);
                }
            } else {
                console.error(`⚠️ [ConfigHotReload] 未找到重载函数: [${configType}]`);
            }

            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        } catch (err) {
            console.error(`❌ [ConfigHotReload] 重载失败: ${err.message}`);
        }
    }

    /**
     * 取消注册
     */
    unregister(filePath) {
        const absolutePath = path.resolve(filePath);
        const watcherInfo = this.watchers.get(absolutePath);

        if (watcherInfo) {
            // 清除定时器
            if (watcherInfo.debounceTimer) {
                clearTimeout(watcherInfo.debounceTimer);
            }

            // 关闭监听器
            watcherInfo.watcher.close();

            // 移除记录
            this.watchers.delete(absolutePath);
            this.reloadHandlers.delete(watcherInfo.configType);

            console.error(`✅ [ConfigHotReload] 已取消注册: ${path.basename(absolutePath)}`);
            return true;
        }

        return false;
    }

    /**
     * 停止所有监听
     */
    stopAll() {
        console.error('\n🛑 [ConfigHotReload] 停止所有配置热重载监听');

        for (const [filePath, watcherInfo] of this.watchers.entries()) {
            // 清除定时器
            if (watcherInfo.debounceTimer) {
                clearTimeout(watcherInfo.debounceTimer);
            }

            // 关闭监听器
            watcherInfo.watcher.close();

            console.error(`✅ [ConfigHotReload] 已停止: [${watcherInfo.configType}] ${path.basename(filePath)}`);
        }

        this.watchers.clear();
        this.reloadHandlers.clear();
    }

    /**
     * 手动触发重载
     */
    manualReload(configType) {
        console.error(`\n📝 [ConfigHotReload] 手动触发重载: [${configType}]`);

        // 查找对应的文件路径
        for (const [filePath, watcherInfo] of this.watchers.entries()) {
            if (watcherInfo.configType === configType) {
                this.reloadConfig(configType, filePath);
                return { success: true, message: `✅ [${configType}] 已重载` };
            }
        }

        return { success: false, message: `❌ 未找到配置类型: [${configType}]` };
    }

    /**
     * 获取所有监听状态
     */
    getStatus() {
        const status = [];

        for (const [filePath, watcherInfo] of this.watchers.entries()) {
            status.push({
                configType: watcherInfo.configType,
                filePath: path.basename(filePath),
                watching: true
            });
        }

        return status;
    }

    /**
     * 显示所有监听状态
     */
    showStatus() {
        console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('🔥 配置热重载状态');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const status = this.getStatus();

        if (status.length === 0) {
            console.error('⚠️ 当前无监听的配置文件');
        } else {
            status.forEach(s => {
                console.error(`✅ [${s.configType}] ${s.filePath}`);
            });
        }

        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        return status;
    }
}

// 导出单例
let instance = null;

module.exports = {
    getInstance: function () {
        if (!instance) {
            instance = new ConfigHotReloadManager();
        }
        return instance;
    },
    ConfigHotReloadManager: ConfigHotReloadManager
};


