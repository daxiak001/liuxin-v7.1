/**
 * 🔒 柳芯系统 - 模块注册器
 * 版本: v1.0
 * 功能: 自动注册新功能模块到锁定系统
 */

const fs = require('fs');
const path = require('path');
const { LockManager } = require('./LockManager');

class ModuleRegistrar {
    constructor() {
        this.lockManager = new (LockManager)();
        this.rootDir = path.join(__dirname, '..');
    }

    /**
     * 扫描新模块
     */
    scanNewModules() {
        const config = this.lockManager.config.auto_register_rules;
        if (!config.enabled) {
            return [];
        }

        const patterns = config.watch_patterns;
        const newModules = [];

        // 扫描匹配的文件
        patterns.forEach(pattern => {
            const files = this.findFilesByPattern(this.rootDir, pattern);
            files.forEach(file => {
                // 检查是否已注册
                if (!this.isModuleRegistered(file)) {
                    newModules.push(file);
                }
            });
        });

        return newModules;
    }

    /**
     * 查找匹配模式的文件
     */
    findFilesByPattern(dir, pattern) {
        const results = [];

        try {
            const files = fs.readdirSync(dir);

            files.forEach(file => {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);

                if (stat.isDirectory() && file !== 'node_modules' && file !== '.git') {
                    results.push(...this.findFilesByPattern(filePath, pattern));
                } else if (stat.isFile()) {
                    if (this.matchPattern(file, pattern)) {
                        results.push(filePath);
                    }
                }
            });
        } catch (err) {
            // 忽略无法访问的目录
        }

        return results;
    }

    /**
     * 匹配文件名模式
     */
    matchPattern(filename, pattern) {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return regex.test(filename);
    }

    /**
     * 检查模块是否已注册
     */
    isModuleRegistered(filePath) {
        const filename = path.basename(filePath);
        const modules = this.lockManager.config.modules;

        for (const module of Object.values(modules)) {
            const allFiles = [...(module.mcp_files || []), ...(module.liuxin_files || [])];
            if (allFiles.some(f => f.includes(filename))) {
                return true;
            }
        }

        return false;
    }

    /**
     * 自动生成模块配置
     */
    generateModuleConfig(filePath) {
        const filename = path.basename(filePath);
        const moduleName = this.extractModuleName(filename);
        const moduleId = moduleName.toLowerCase().replace(/\s+/g, '_');

        // 判断文件类型
        const isLiuxinFile = filePath.includes('ResponseInterceptor') ||
            filePath.includes('Liuxin');
        const isMCPFile = filePath.includes('mcp-server') ||
            filePath.includes('Interceptor');

        return {
            id: moduleId,
            name: moduleName,
            locked: false,  // 新模块默认解锁
            mcp_files: isMCPFile ? [filename] : [],
            liuxin_files: isLiuxinFile ? [filename] : [],
            functions: this.extractFunctions(filePath),
            unlock_command: `解锁${moduleName}`,
            lock_command: `锁定${moduleName}`,
            auto_registered: true
        };
    }

    /**
     * 提取模块名称
     */
    extractModuleName(filename) {
        // 移除扩展名
        let name = filename.replace(/\.(js|ts)$/, '');

        // 移除常见后缀
        name = name.replace(/(Interceptor|Manager|Engine|Handler)$/, '');

        // 转换驼峰为空格
        name = name.replace(/([A-Z])/g, ' $1').trim();

        return name || filename;
    }

    /**
     * 提取文件中的函数
     */
    extractFunctions(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const functions = [];

            // 匹配函数定义
            const functionRegex = /(async\s+)?(\w+)\s*\([^)]*\)\s*{/g;
            let match;

            while ((match = functionRegex.exec(content)) !== null) {
                const funcName = match[2];
                if (funcName && !['if', 'for', 'while', 'switch'].includes(funcName)) {
                    functions.push(funcName);
                }
            }

            return functions.slice(0, 5);  // 只返回前5个
        } catch (err) {
            return [];
        }
    }

    /**
     * 注册模块
     */
    registerModule(moduleConfig) {
        return this.lockManager.registerModule(moduleConfig);
    }

    /**
     * 生成锁定检查代码
     */
    generateLockCheckCode(moduleId) {
        return `
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔒 自动生成的锁定检查代码
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const { getInstance: getLockManager } = require('./locks/LockManager');

function checkModuleLock_${moduleId}() {
    const lockManager = getLockManager();
    const lockStatus = lockManager.check('${moduleId}');
    
    if (lockStatus.isLocked) {
        lockManager.showFeedback('${moduleId}');
        throw new Error('MODULE_LOCKED: ${moduleId}');
    }
}

// 在关键函数执行前调用此检查
// 示例: checkModuleLock_${moduleId}();
`;
    }

    /**
     * 自动注册新发现的模块
     */
    autoRegisterNewModules() {
        const newModules = this.scanNewModules();
        const registered = [];

        newModules.forEach(filePath => {
            try {
                const config = this.generateModuleConfig(filePath);
                const moduleId = this.registerModule(config);
                registered.push({
                    moduleId: moduleId,
                    name: config.name,
                    file: path.basename(filePath)
                });
            } catch (err) {
                console.error(`⚠️ 注册模块失败 ${filePath}:`, err.message);
            }
        });

        return registered;
    }
}

module.exports = ModuleRegistrar;





