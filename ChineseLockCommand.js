/**
 * 🔓 中文解锁/锁定命令处理器
 * v7.10.3 - 独立工具，不依赖其他模块
 */

const path = require('path');

class ChineseLockCommand {
    constructor() {
        this.LockManager = null;
        this.init();
    }

    init() {
        try {
            const { getInstance } = require('./locks/LockManager');
            this.LockManager = getInstance();
            console.error('✅ 中文命令处理器已初始化');
        } catch (err) {
            console.error('❌ 无法加载 LockManager:', err.message);
        }
    }

    /**
     * 🔥 处理用户的中文命令
     * @param {string} command - 用户输入（如："解锁统计"）
     * @returns {object}
     */
    handleCommand(command) {
        if (!this.LockManager) {
            return {
                success: false,
                message: '❌ 锁管理器未加载'
            };
        }

        const cmd = command.trim();

        // 定义命令映射表
        const commandMap = {
            '解锁统计': { action: 'unlock', module: 'statistics', name: '统计模块' },
            '锁定统计': { action: 'lock', module: 'statistics', name: '统计模块' },
            '解锁团队模式': { action: 'unlock', module: 'team_mode', name: '团队模式' },
            '锁定团队模式': { action: 'lock', module: 'team_mode', name: '团队模式' },
            '解锁复述': { action: 'unlock', module: 'rephrase', name: '复述检测' },
            '锁定复述': { action: 'lock', module: 'rephrase', name: '复述检测' },
            '解锁MCP拦截器': { action: 'unlock', module: 'mcp_interceptor', name: 'MCP拦截器核心' },
            '锁定MCP拦截器': { action: 'lock', module: 'mcp_interceptor', name: 'MCP拦截器核心' },
            '解锁锁管理器': { action: 'unlock', module: 'lock_manager', name: '锁管理器自身' },
            '锁定锁管理器': { action: 'lock', module: 'lock_manager', name: '锁管理器自身' },
        };

        // 查找匹配的命令
        const cmdInfo = commandMap[cmd];
        if (!cmdInfo) {
            return {
                success: false,
                message: `❌ 未识别的命令: "${cmd}"\n\n可用命令:\n${this.getAvailableCommands()}`
            };
        }

        // 执行操作
        try {
            if (cmdInfo.action === 'unlock') {
                this.LockManager.unlock(cmdInfo.module, '用户通过中文指令解锁');
                return {
                    success: true,
                    message: `✅ ${cmdInfo.name}已解锁\n\n⚠️ 请重启 Cursor 使配置生效`,
                    action: 'unlock',
                    moduleId: cmdInfo.module,
                    moduleName: cmdInfo.name,
                    needRestart: true
                };
            } else {
                this.LockManager.lock(cmdInfo.module, '用户通过中文指令锁定');
                return {
                    success: true,
                    message: `✅ ${cmdInfo.name}已锁定\n\n⚠️ 请重启 Cursor 使配置生效`,
                    action: 'lock',
                    moduleId: cmdInfo.module,
                    moduleName: cmdInfo.name,
                    needRestart: true
                };
            }
        } catch (err) {
            return {
                success: false,
                message: `❌ 操作失败: ${err.message}`,
                action: cmdInfo.action,
                moduleId: cmdInfo.module
            };
        }
    }

    /**
     * 获取所有可用命令列表
     * @returns {string}
     */
    getAvailableCommands() {
        return `
解锁命令：
  - 解锁统计
  - 解锁团队模式
  - 解锁复述
  - 解锁MCP拦截器
  - 解锁锁管理器

锁定命令：
  - 锁定统计
  - 锁定团队模式
  - 锁定复述
  - 锁定MCP拦截器
  - 锁定锁管理器

⚠️ 注意：所有锁定/解锁操作后都需要重启 Cursor 才能生效
        `.trim();
    }

    /**
     * 检查命令是否是锁定相关指令
     * @param {string} text - 用户输入
     * @returns {boolean}
     */
    isLockCommand(text) {
        const cmd = text.trim();
        return cmd.startsWith('解锁') || cmd.startsWith('锁定');
    }
}

// 导出单例
let instance = null;
function getInstance() {
    if (!instance) {
        instance = new ChineseLockCommand();
    }
    return instance;
}

module.exports = { getInstance, ChineseLockCommand };
