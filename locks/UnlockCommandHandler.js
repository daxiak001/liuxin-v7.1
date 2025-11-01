/**
 * 🔒 柳芯系统 - 解锁指令处理器
 * 版本: v1.0
 * 功能: 识别并执行用户的锁定/解锁命令
 */

const { getInstance: getLockManager } = require('./LockManager');

class UnlockCommandHandler {
    constructor() {
        this.lockManager = getLockManager();

        // 定义指令模式
        this.commands = {
            // 解锁命令
            unlock: {
                patterns: [
                    /^解锁统计模块$/,
                    /^解锁MCP拦截器$/,
                    /^解锁规则引擎$/,
                    /^解锁Response拦截器$/,
                    /^解锁所有模块$/,
                    /^解锁(.+)$/
                ],
                action: 'unlock'
            },
            // 锁定命令
            lock: {
                patterns: [
                    /^锁定统计模块$/,
                    /^锁定MCP拦截器$/,
                    /^锁定规则引擎$/,
                    /^锁定Response拦截器$/,
                    /^锁定所有模块$/,
                    /^锁定(.+)$/
                ],
                action: 'lock'
            },
            // 查询命令
            query: {
                patterns: [
                    /^查询锁定状态$/,
                    /^锁定状态$/,
                    /^模块状态$/,
                    /^查看锁定$/
                ],
                action: 'query'
            },
            // 注册新模块命令
            register: {
                patterns: [
                    /^注册新模块\s+(.+)$/,
                    /^添加模块\s+(.+)$/
                ],
                action: 'register'
            }
        };

        // 模块ID映射
        this.moduleMapping = {
            '统计模块': 'statistics',
            'MCP拦截器': 'mcp_interceptor',
            '规则引擎': 'rule_engine',
            'Response拦截器': 'response_interceptor',
            '所有模块': 'all'
        };
    }

    /**
     * 处理用户输入
     * @param {string} userInput - 用户输入的文本
     * @returns {object} - { matched: boolean, action: string, result: any }
     */
    handle(userInput) {
        if (!userInput || typeof userInput !== 'string') {
            return { matched: false };
        }

        const input = userInput.trim();

        // 检查解锁命令
        if (this.matchesPatterns(input, this.commands.unlock.patterns)) {
            return this.handleUnlock(input);
        }

        // 检查锁定命令
        if (this.matchesPatterns(input, this.commands.lock.patterns)) {
            return this.handleLock(input);
        }

        // 检查查询命令
        if (this.matchesPatterns(input, this.commands.query.patterns)) {
            return this.handleQuery();
        }

        // 检查注册命令
        if (this.matchesPatterns(input, this.commands.register.patterns)) {
            return this.handleRegister(input);
        }

        return { matched: false };
    }

    /**
     * 匹配命令模式
     */
    matchesPatterns(input, patterns) {
        return patterns.some(pattern => pattern.test(input));
    }

    /**
     * 提取模块名称
     */
    extractModuleName(input) {
        for (const [chineseName, moduleId] of Object.entries(this.moduleMapping)) {
            if (input.includes(chineseName)) {
                return { chineseName, moduleId };
            }
        }
        return null;
    }

    /**
     * 处理解锁命令
     */
    handleUnlock(input) {
        const module = this.extractModuleName(input);

        if (!module) {
            return {
                matched: true,
                action: 'unlock',
                success: false,
                message: '❌ 无法识别模块名称'
            };
        }

        try {
            if (module.moduleId === 'all') {
                this.lockManager.unlockAll('用户授权解锁');
                return {
                    matched: true,
                    action: 'unlock',
                    success: true,
                    message: this.generateUnlockSuccessMessage('所有模块')
                };
            } else {
                this.lockManager.unlock(module.moduleId, '用户授权解锁');
                return {
                    matched: true,
                    action: 'unlock',
                    success: true,
                    message: this.generateUnlockSuccessMessage(module.chineseName)
                };
            }
        } catch (err) {
            return {
                matched: true,
                action: 'unlock',
                success: false,
                message: `❌ 解锁失败: ${err.message}`
            };
        }
    }

    /**
     * 处理锁定命令
     */
    handleLock(input) {
        const module = this.extractModuleName(input);

        if (!module) {
            return {
                matched: true,
                action: 'lock',
                success: false,
                message: '❌ 无法识别模块名称'
            };
        }

        try {
            if (module.moduleId === 'all') {
                this.lockManager.lockAll('用户授权锁定');
                return {
                    matched: true,
                    action: 'lock',
                    success: true,
                    message: this.generateLockSuccessMessage('所有模块')
                };
            } else {
                this.lockManager.lock(module.moduleId, '用户授权锁定');
                return {
                    matched: true,
                    action: 'lock',
                    success: true,
                    message: this.generateLockSuccessMessage(module.chineseName)
                };
            }
        } catch (err) {
            return {
                matched: true,
                action: 'lock',
                success: false,
                message: `❌ 锁定失败: ${err.message}`
            };
        }
    }

    /**
     * 处理查询命令
     */
    handleQuery() {
        const statusMessage = this.lockManager.showAllStatus();

        return {
            matched: true,
            action: 'query',
            success: true,
            message: statusMessage
        };
    }

    /**
     * 处理注册新模块命令
     */
    handleRegister(input) {
        const match = input.match(/(?:注册新模块|添加模块)\s+(.+)$/);
        if (!match) {
            return {
                matched: true,
                action: 'register',
                success: false,
                message: '❌ 无法识别模块名称'
            };
        }

        const moduleName = match[1].trim();

        return {
            matched: true,
            action: 'register',
            success: false,
            message: `
📋 注册新模块: ${moduleName}

请提供以下信息：
1. MCP端文件（例如：liuxin-mcp-server-unified.js）
2. 柳芯端文件（例如：ResponseInterceptor.js）
3. 默认锁定状态（锁定/解锁）

提示：此功能需要进一步开发，当前版本支持自动扫描新模块。
`
        };
    }

    /**
     * 生成解锁成功消息
     */
    generateUnlockSuccessMessage(moduleName) {
        return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔓 ${moduleName} 已解锁
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 状态: 已解锁
✅ 操作: 现在可以修改该模块
✅ 时间: ${new Date().toISOString()}

⚠️  提示: 完成修改后，请及时重新锁定该模块
         命令: 锁定${moduleName}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }

    /**
     * 生成锁定成功消息
     */
    generateLockSuccessMessage(moduleName) {
        return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 ${moduleName} 已锁定
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 状态: 已锁定
✅ 保护: 该模块受到保护，无法修改
✅ 时间: ${new Date().toISOString()}

🔐 如需修改该模块，请使用解锁命令:
    命令: 解锁${moduleName}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }
}

// 导出单例
let instance = null;

module.exports = {
    getInstance: function () {
        if (!instance) {
            instance = new UnlockCommandHandler();
        }
        return instance;
    },
    UnlockCommandHandler: UnlockCommandHandler
};





