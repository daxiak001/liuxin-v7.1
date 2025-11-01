/**
 * 🔒 柳芯系统 - 中央锁管理器
 * 版本: v1.0
 * 功能: 统一管理所有功能模块的锁定状态
 */

const fs = require('fs');
const path = require('path');

class LockManager {
    constructor() {
        this.configPath = path.join(__dirname, 'lock-config.json');
        this.config = this.loadConfig();

        // 🔥 v7.10.5: 启动热重载
        // v7.11.1: 迁移到统一配置热重载管理器
        this.startHotReload();
    }

    /**
     * 加载锁定配置
     */
    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                console.error(`🔒 [LockManager] 正在加载配置文件: ${this.configPath}`);
                const data = fs.readFileSync(this.configPath, 'utf-8');
                const config = JSON.parse(data);

                // 统计锁定模块
                const lockedModules = Object.entries(config.modules || {})
                    .filter(([_, module]) => module.locked)
                    .map(([id, module]) => `${module.name}(${id})`);

                if (lockedModules.length > 0) {
                    console.error(`🔒 [LockManager] ✅ 配置加载成功！已锁定模块：${lockedModules.join(', ')}`);
                } else {
                    console.error(`🔒 [LockManager] ✅ 配置加载成功！当前无锁定模块`);
                }

                return config;
            } else {
                console.error(`🔒 [LockManager] ⚠️ 配置文件不存在: ${this.configPath}`);
            }
        } catch (err) {
            console.error('🔒 [LockManager] ❌ 无法加载锁定配置:', err.message);
        }
        return { modules: {}, auto_register_rules: { enabled: true } };
    }

    /**
     * 保存锁定配置
     */
    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
        } catch (err) {
            console.error('⚠️ 无法保存锁定配置:', err.message);
        }
    }

    /**
     * 检查模块是否被锁定
     * @param {string} moduleId - 模块ID
     * @returns {object} { isLocked: boolean, module: object }
     */
    check(moduleId) {
        const module = this.config.modules[moduleId];
        if (!module) {
            return { isLocked: false, module: null, exists: false };
        }
        return {
            isLocked: module.locked === true,
            module: module,
            exists: true
        };
    }

    /**
     * 检查是否有权限访问模块
     * @param {string} moduleId - 模块ID
     * @param {string} operation - 操作类型 (read/write/delete)
     * @returns {object} { allowed: boolean, reason: string }
     */
    checkAccess(moduleId, operation = 'write') {
        const checkResult = this.check(moduleId);

        // 模块不存在，允许访问（可能是新模块）
        if (!checkResult.exists) {
            return {
                allowed: true,
                reason: '模块不存在，允许创建'
            };
        }

        // 模块未锁定，允许访问
        if (!checkResult.isLocked) {
            return {
                allowed: true,
                reason: '模块未锁定'
            };
        }

        // 模块已锁定
        if (operation === 'read') {
            // 读取操作始终允许
            return {
                allowed: true,
                reason: '读取操作允许'
            };
        }

        // 写入和删除操作被拒绝
        return {
            allowed: false,
            reason: `模块【${checkResult.module.name || moduleId}】已锁定，禁止${operation === 'delete' ? '删除' : '修改'}`,
            module: checkResult.module
        };
    }

    /**
     * 🔥 核心方法：检查工具调用是否涉及锁定模块
     * @param {string} toolName - 工具名称
     * @param {object} args - 工具参数
     * @returns {object} { blocked, message, feedback, module }
     */
    checkToolCall(toolName, args) {
        // 1. 提取文件路径
        const filePath = this.extractFilePath(toolName, args);
        if (!filePath) {
            console.error(`🔒 [LockManager] 工具 ${toolName} 未涉及文件操作，跳过检查`);
            return { blocked: false };
        }

        // 🎯 v7.11.2: 判断操作类型（只读 vs 修改）
        const operation = this.getOperationType(toolName);
        console.error(`🔒 [LockManager] 检查工具调用: ${toolName} (${operation}) → ${filePath}`);

        // 2. 检查文件是否在锁定模块中
        for (const [moduleId, module] of Object.entries(this.config.modules)) {
            if (!module.locked) continue;

            const protectedFiles = module.protected_files || [];
            const isProtected = protectedFiles.some(f => {
                // 支持完整路径匹配和文件名匹配
                return filePath.includes(f) || f.includes(path.basename(filePath));
            });

            if (isProtected) {
                // 🎯 v7.11.2: 只读操作允许通过（用于诊断）
                if (operation === 'read') {
                    console.error(`🔒 [LockManager] ✅ 只读操作允许: ${filePath} (诊断模式)`);
                    return { blocked: false, readonly: true };
                }

                // 修改/删除操作拦截
                console.error(`🔒 [LockManager] ❌ 拦截! 模块"${module.name}"已锁定，文件"${filePath}"受保护`);
                console.error(`🔒 [LockManager] 锁定原因: ${module.locked_reason || '未记录'}`);
                console.error(`🔒 [LockManager] 锁定时间: ${module.locked_at || '未知'}`);

                return {
                    blocked: true,
                    message: `${module.name}已锁定`,
                    feedback: this.showFeedback(moduleId),
                    module: moduleId,
                    file: filePath
                };
            }
        }

        // 3. 检查代码修改是否涉及锁定函数
        if (toolName === 'mcp_search_replace' || toolName === 'search_replace') {
            console.error(`🔒 [LockManager] 检测到代码修改操作，检查函数级保护...`);
            const codeCheck = this.checkCodeChange(filePath, args.old_string || '', args.new_string || '');
            if (codeCheck.blocked) {
                console.error(`🔒 [LockManager] ❌ 拦截! 代码修改涉及受保护的函数`);
                return codeCheck;
            }
        }

        console.error(`🔒 [LockManager] ✅ 通过检查，文件"${filePath}"未被锁定`);
        return { blocked: false };
    }

    /**
     * 🎯 v7.11.2: 判断工具的操作类型
     * @param {string} toolName - 工具名称
     * @returns {string} 'read' | 'write' | 'delete'
     */
    getOperationType(toolName) {
        const readTools = [
            'mcp_read_file', 'read_file',
            'mcp_liuxin-unified_mcp_read_file',
            'mcp_grep', 'grep',
            'mcp_liuxin-unified_mcp_grep',
            'mcp_list_dir', 'list_dir',
            'mcp_liuxin-unified_mcp_list_dir',
            'mcp_glob_file_search', 'glob_file_search',
            'mcp_liuxin-unified_mcp_glob_file_search'
        ];

        const deleteTools = [
            'mcp_delete_file', 'delete_file',
            'mcp_liuxin-unified_mcp_delete_file'
        ];

        if (readTools.includes(toolName)) {
            return 'read';
        } else if (deleteTools.includes(toolName)) {
            return 'delete';
        } else {
            return 'write'; // write, search_replace, run_terminal_cmd等
        }
    }

    /**
     * 提取文件路径
     * @param {string} toolName - 工具名称
     * @param {object} args - 工具参数
     * @returns {string|null} 文件路径
     */
    extractFilePath(toolName, args) {
        if (args.file_path) return args.file_path;
        if (args.target_file) return args.target_file;
        if (toolName === 'mcp_run_terminal_cmd' || toolName === 'run_terminal_cmd') {
            // 从命令中提取文件路径
            return this.extractFileFromCommand(args.command || '');
        }
        return null;
    }

    /**
     * 检查代码修改是否涉及锁定函数
     * @param {string} filePath - 文件路径
     * @param {string} oldString - 旧代码
     * @param {string} newString - 新代码
     * @returns {object} { blocked, message, feedback, module, functions }
     */
    checkCodeChange(filePath, oldString, newString) {
        for (const [moduleId, module] of Object.entries(this.config.modules)) {
            if (!module.locked) continue;

            // 检查文件是否在保护范围内
            const protectedFiles = module.protected_files || [];
            const isProtectedFile = protectedFiles.some(f => filePath.includes(f));

            if (!isProtectedFile) continue;

            // 检查是否修改了受保护的函数
            const protectedFunctions = module.protected_functions || [];
            const touchedFunctions = protectedFunctions.filter(fn =>
                oldString.includes(fn) || newString.includes(fn)
            );

            if (touchedFunctions.length > 0) {
                return {
                    blocked: true,
                    message: `${module.name}的核心函数已锁定`,
                    feedback: `🔒 检测到修改以下锁定函数:\n${touchedFunctions.map(f => `  - ${f}`).join('\n')}\n\n${this.showFeedback(moduleId)}`,
                    module: moduleId,
                    functions: touchedFunctions,
                    file: filePath
                };
            }
        }

        return { blocked: false };
    }

    /**
     * 从命令中提取文件路径
     * @param {string} command - 命令字符串
     * @returns {string|null} 文件路径
     */
    extractFileFromCommand(command) {
        // 匹配常见的文件操作命令
        const patterns = [
            /(?:node|npm|cat|echo|rm|del|copy|move|mv|cp)\s+[^>]*?([a-zA-Z0-9_\-./\\]+\.(?:js|json|md|txt))/i,
            /(?:>|>>)\s*([a-zA-Z0-9_\-./\\]+\.(?:js|json|md|txt))/i,
            /"([^"]+\.(?:js|json|md|txt))"/i,
            /'([^']+\.(?:js|json|md|txt))'/i
        ];

        for (const pattern of patterns) {
            const match = command.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }

        return null;
    }

    /**
     * 获取所有受保护的文件列表
     * @returns {string[]} 文件路径数组
     */
    getAllProtectedFiles() {
        const files = new Set();
        for (const module of Object.values(this.config.modules)) {
            if (module.locked && module.protected_files) {
                module.protected_files.forEach(f => files.add(f));
            }
        }
        return Array.from(files);
    }

    /**
     * 检查模块是否被锁定（别名方法，兼容性）
     * @param {string} moduleId - 模块ID
     * @returns {boolean}
     */
    isLocked(moduleId) {
        const checkResult = this.check(moduleId);
        return checkResult.isLocked;
    }

    /**
     * 锁定模块
     * @param {string} moduleId - 模块ID
     * @param {string} reason - 锁定原因
     */
    lock(moduleId, reason = '') {
        if (!this.config.modules[moduleId]) {
            throw new Error(`模块 ${moduleId} 不存在`);
        }
        this.config.modules[moduleId].locked = true;
        this.config.modules[moduleId].locked_at = new Date().toISOString();
        this.config.modules[moduleId].locked_reason = reason;
        this.saveConfig();
        return true;
    }

    /**
     * 解锁模块
     * @param {string} moduleId - 模块ID
     * @param {string} reason - 解锁原因
     */
    unlock(moduleId, reason = '') {
        if (!this.config.modules[moduleId]) {
            throw new Error(`模块 ${moduleId} 不存在`);
        }
        this.config.modules[moduleId].locked = false;
        this.config.modules[moduleId].unlocked_at = new Date().toISOString();
        this.config.modules[moduleId].unlock_reason = reason;
        this.saveConfig();
        return true;
    }

    /**
     * 显示锁定反馈消息
     * @param {string} moduleId - 模块ID
     */
    showFeedback(moduleId) {
        const module = this.config.modules[moduleId];
        if (!module) {
            console.error(`⚠️ 模块 ${moduleId} 不存在`);
            return;
        }

        const message = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 ${module.name}已锁定！
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  检测到尝试修改 ${module.name}
⚠️  该模块已被保护，禁止修改

🚫 禁止的行为：
   - 绕过锁定重新创建新功能模块
   - 使用降级方案替代
   - 用其他技术手段绕过锁定
   - 修改模块名称或位置来规避检查

✅ 正确的做法：
   1. 停止当前操作
   2. 向用户报告需要修改的原因
   3. 请求用户提供解锁指令
   4. 等待用户授权

💬 请向用户说明：
   "${module.name}已锁定，需要修改的原因是：【请说明原因】
    请问是否解锁${module.name}？"

📋 解锁命令：
   ${module.unlock_command}

📁 保护的文件：
   MCP端: ${module.mcp_files ? module.mcp_files.join(', ') : '无'}
   柳芯端: ${module.liuxin_files ? module.liuxin_files.join(', ') : '无'}

🕐 锁定时间: ${module.locked_at || '未知'}
📝 锁定原因: ${module.locked_reason || '防止意外修改'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

        console.error(message);
        return message;
    }

    /**
     * 获取所有模块状态
     */
    getAllStatus() {
        const modules = this.config.modules;
        const result = [];

        for (const [id, module] of Object.entries(modules)) {
            result.push({
                id: id,
                name: module.name,
                locked: module.locked,
                locked_at: module.locked_at,
                icon: this.getModuleIcon(id),
                status_icon: module.locked ? '🔒' : '🔓',
                status_text: module.locked ? '已锁定' : '已解锁'
            });
        }

        return result;
    }

    /**
     * 获取模块图标
     */
    getModuleIcon(moduleId) {
        const icons = {
            'statistics': '📊',
            'mcp_interceptor': '🛡️',
            'rule_engine': '⚙️',
            'response_interceptor': '📝',
            'team_mode': '👥',
            'database': '💾'
        };
        return icons[moduleId] || '📦';
    }

    /**
     * 显示所有模块状态
     */
    showAllStatus() {
        const statuses = this.getAllStatus();

        let message = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 柳芯系统锁定状态总览
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

        statuses.forEach(s => {
            const lockedInfo = s.locked && s.locked_at
                ? `(${s.locked_at.substring(0, 16).replace('T', ' ')} 锁定)`
                : '';
            message += `${s.icon} ${s.name.padEnd(20)} ${s.status_icon} ${s.status_text} ${lockedInfo}\n`;
        });

        // 统计保护的文件
        const allFiles = new Set();
        Object.values(this.config.modules).forEach(m => {
            if (m.locked) {
                if (m.mcp_files) m.mcp_files.forEach(f => allFiles.add(f));
                if (m.liuxin_files) m.liuxin_files.forEach(f => allFiles.add(f));
            }
        });

        if (allFiles.size > 0) {
            message += `\n📋 当前保护的文件：\n`;
            allFiles.forEach(f => {
                message += `   - ${f}\n`;
            });
        }

        message += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

        console.log(message);
        return message;
    }

    /**
     * 锁定所有模块
     */
    lockAll(reason = '批量锁定') {
        Object.keys(this.config.modules).forEach(id => {
            this.lock(id, reason);
        });
        return true;
    }

    /**
     * 解锁所有模块
     */
    unlockAll(reason = '批量解锁') {
        Object.keys(this.config.modules).forEach(id => {
            this.unlock(id, reason);
        });
        return true;
    }

    /**
     * 注册新模块
     */
    registerModule(moduleConfig) {
        const moduleId = moduleConfig.id || moduleConfig.name.toLowerCase().replace(/\s+/g, '_');

        if (this.config.modules[moduleId]) {
            throw new Error(`模块 ${moduleId} 已存在`);
        }

        this.config.modules[moduleId] = {
            name: moduleConfig.name,
            locked: moduleConfig.locked || false,
            mcp_files: moduleConfig.mcp_files || [],
            liuxin_files: moduleConfig.liuxin_files || [],
            functions: moduleConfig.functions || [],
            unlock_command: moduleConfig.unlock_command || `解锁${moduleConfig.name}`,
            lock_command: moduleConfig.lock_command || `锁定${moduleConfig.name}`,
            created_at: new Date().toISOString(),
            auto_registered: moduleConfig.auto_registered || false
        };

        this.saveConfig();
        return moduleId;
    }

    /**
     * 🔥 启动热重载监听（v7.10.5新增）
     * v7.11.1: 迁移到统一配置热重载管理器
     */
    startHotReload() {
        if (!fs.existsSync(this.configPath)) {
            console.error('🔒 [LockManager] ⚠️ 配置文件不存在，跳过热重载');
            return;
        }

        try {
            // v7.11.1: 使用统一配置热重载管理器
            const { getInstance } = require('../ConfigHotReloadManager');
            const hotReloadManager = getInstance();

            // 注册lock-config.json的热重载
            const registered = hotReloadManager.register(
                'lock-config',
                this.configPath,
                () => this.reloadConfig()
            );

            if (registered) {
                console.error('🔥 [LockManager] 热重载已启动（通过ConfigHotReloadManager）');
            }

        } catch (err) {
            console.error('🔒 [LockManager] ❌ 启动热重载失败:', err.message);
        }
    }

    /**
     * 🔥 重新加载配置
     * v7.11.1: 优化返回值，供ConfigHotReloadManager使用
     */
    reloadConfig() {
        try {
            const oldConfig = JSON.parse(JSON.stringify(this.config)); // 深拷贝
            this.config = this.loadConfig();

            // 统计变更
            const changes = this.getConfigDiff(oldConfig, this.config);

            if (changes.total > 0) {
                return {
                    success: true,
                    message: `配置已更新！变更: ${changes.summary}`
                };
            } else {
                return {
                    success: true,
                    message: '配置无实质变更'
                };
            }

        } catch (err) {
            console.error('🔒 [LockManager] ❌ 重新加载配置失败:', err.message);
            return {
                success: false,
                message: `重新加载配置失败: ${err.message}`
            };
        }
    }

    /**
     * 🔥 计算配置差异
     */
    getConfigDiff(oldConfig, newConfig) {
        const changes = {
            locked: [],
            unlocked: [],
            added: [],
            removed: [],
            total: 0
        };

        const oldModules = oldConfig.modules || {};
        const newModules = newConfig.modules || {};

        // 检查新增、删除、变更
        Object.keys(newModules).forEach(moduleId => {
            if (!oldModules[moduleId]) {
                changes.added.push(moduleId);
                changes.total++;
            } else if (oldModules[moduleId].locked !== newModules[moduleId].locked) {
                if (newModules[moduleId].locked) {
                    changes.locked.push(moduleId);
                } else {
                    changes.unlocked.push(moduleId);
                }
                changes.total++;
            }
        });

        Object.keys(oldModules).forEach(moduleId => {
            if (!newModules[moduleId]) {
                changes.removed.push(moduleId);
                changes.total++;
            }
        });

        // 生成摘要
        const parts = [];
        if (changes.locked.length > 0) parts.push(`锁定${changes.locked.length}个`);
        if (changes.unlocked.length > 0) parts.push(`解锁${changes.unlocked.length}个`);
        if (changes.added.length > 0) parts.push(`新增${changes.added.length}个`);
        if (changes.removed.length > 0) parts.push(`删除${changes.removed.length}个`);

        changes.summary = parts.join(', ') || '无';

        return changes;
    }

    /**
     * 🔥 停止热重载
     * v7.11.1: 已迁移到ConfigHotReloadManager，此方法保留以兼容旧代码
     */
    stopHotReload() {
        console.error('🛑 [LockManager] stopHotReload() 已废弃，请使用 ConfigHotReloadManager.stopAll()');
    }

    /**
     * 🔥 手动刷新配置（用于中文命令）
     */
    refresh() {
        console.error('📝 [LockManager] 用户手动触发配置刷新');
        this.reloadConfig();
        return {
            success: true,
            message: '✅ 锁定配置已刷新，最新配置已生效'
        };
    }
}

// 导出单例
let instance = null;

module.exports = {
    getInstance: function () {
        if (!instance) {
            instance = new LockManager();
        }
        return instance;
    },
    LockManager: LockManager
};


