#!/usr/bin/env node

/**
 * 柳芯统一MCP服务器 v7.9.0
 * ✅ 支持stdio (本地测试) + SSE (云端部署) 双模式
 * ✅ 集成三阶段拦截器 - 真正拦截AI工具调用
 * ✅ 自动记录所有拦截日志 (v7.6.4新增)
 * ✅ MCP工具包装器 - 100%规则强制执行 (v7.7.0新增)
 * ✅ Response拦截器 - 强制执行输出格式规则 (v7.8.0新增)
 * ✅ 统计计数器单次对话修复 (v7.8.2新增)
 * ✅ 规则完整性验证与路径修复 (v7.8.4新增)
 * ✅ RULE-002复述优化 + ResponseInterceptor智能检测 (v7.8.5新增)
 * ✅ 删除SYSTEM-INFO规则 + 70条规则智能测试 (v7.8.6新增)
 * ✅ 中央锁管理器 - 全链路模块锁定保护 (v7.9.0新增)
 * ✅ 一套代码，本地和云端都能用
 * 
 * 启动方式:
 *   本地: MCP_TRANSPORT=stdio node liuxin-mcp-server-unified.js
 *   云端: MCP_TRANSPORT=sse node liuxin-mcp-server-unified.js
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs'); // 同步版本用于日志
const { spawn, execSync } = require('child_process');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔒 中央锁管理器集成 (v7.9.0)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let LockManager = null;
try {
    const { getInstance } = require('./locks/LockManager');
    LockManager = getInstance();
    console.error('✅ 中央锁管理器已加载');
} catch (err) {
    console.error('⚠️ 无法加载锁管理器:', err.message);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🛡️ 统计守护者集成 (v7.11.0)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let StatisticsGuardian = null;
try {
    const { getGuardian } = require('./StatisticsGuardian');
    StatisticsGuardian = getGuardian();
    console.error('✅ [MCP Server] 统计守护者已加载');

    // 执行自检
    if (StatisticsGuardian) {
        const status = StatisticsGuardian.getStatus();
        console.error('📊 [MCP Server] 守护者状态:', status);
    }
} catch (err) {
    console.error('⚠️ 无法加载统计守护者:', err.message);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔥 统一配置热重载管理器集成 (v7.11.1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let ConfigHotReloadManager = null;
try {
    const { getInstance } = require('./ConfigHotReloadManager');
    ConfigHotReloadManager = getInstance();
    console.error('✅ 统一配置热重载管理器已加载');
} catch (err) {
    console.error('⚠️ 无法加载配置热重载管理器:', err.message);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔥 全局热重载管理器集成 (v7.11.0)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let HotReloadManager = null;
try {
    const { getInstance } = require('./HotReloadManager');
    HotReloadManager = getInstance(__filename);
    HotReloadManager.startWatching();
    console.error('✅ 全局热重载管理器已加载并启动');
} catch (err) {
    console.error('⚠️ 无法加载热重载管理器:', err.message);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 功能注册表集成 (v7.11.0)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let FeatureRegistry = null;
try {
    const { getInstance } = require('./SystemFeatureRegistry');
    FeatureRegistry = getInstance();
    FeatureRegistry.showFeatureReminders();
    console.error('✅ 功能注册表已加载');
} catch (err) {
    console.error('⚠️ 无法加载功能注册表:', err.message);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 团队模式智能预加载器集成 (v7.10.8)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let SmartPreloader = null;
try {
    const coreLogic = require('./v7.3-core-logic');
    SmartPreloader = coreLogic.SmartPreloader;
    console.error('✅ 团队模式SmartPreloader已加载');
} catch (err) {
    console.error('⚠️ 无法加载SmartPreloader:', err.message);
}

// 🔥 [DEBUG] 日志文件
const logFile = path.join(__dirname, 'mcp-server-debug.log');
const logStream = fsSync.createWriteStream(logFile, { flags: 'a' });
function debugLog(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    logStream.write(logMessage);
    console.error(message); // 同时输出到stderr
}

// 引入MCP工具包装器
const { wrappers: mcpWrappers, toolDefinitions: wrappedToolDefs } = require('./mcp-tool-wrappers.js');

// 引入Response拦截器 (v7.8.0)
const ResponseInterceptor = require('./ResponseInterceptor.js');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔥 MCP工具包装器基类（v7.7.0新增）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class MCPToolWrapper {
    constructor(toolName, nativeImplementation) {
        this.toolName = toolName;
        this.nativeImpl = nativeImplementation;
        this.interceptor = null;
    }

    setInterceptor(interceptor) {
        this.interceptor = interceptor;
    }

    async handle(args) {
        try {
            // 1. 前置拦截检查
            const interceptResult = await this.preCheck(args);
            if (interceptResult && interceptResult.blocked) {
                console.error(`🚫 ${this.toolName} 被拦截:`, interceptResult.message);
                throw new Error(interceptResult.message);
            }

            // 2. 执行原生操作
            const result = await this.nativeImpl(args);

            // 3. 记录执行日志
            this.logExecution(args, result);

            return result;
        } catch (error) {
            this.logError(args, error);
            throw error;
        }
    }

    async preCheck(args) {
        if (!this.interceptor) return { blocked: false };
        return await this.interceptor.preIntercept(this.toolName, args);
    }

    logExecution(args, result) {
        if (!this.interceptor) return;
        this.interceptor.logInterception(
            'TOOL-WRAPPER',
            this.toolName,
            args,
            { blocked: false, message: 'Success' },
            'pre'
        );
    }

    logError(args, error) {
        console.error(`❌ ${this.toolName} 执行失败:`, error.message);
        if (this.interceptor) {
            this.interceptor.logInterception(
                'TOOL-ERROR',
                this.toolName,
                args,
                { blocked: true, message: error.message },
                'pre'
            );
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔥 三阶段拦截器（从HTTP服务器提取）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ThreePhaseInterceptor {
    constructor(db) {
        this.db = db;
        this.violationLog = [];
        this.ruleCache = new Map(); // L1缓存
        this.cacheTTL = 60000; // 缓存有效期60秒
        this.cacheHits = 0;
        this.cacheMisses = 0;
        this.checkModuleLocks(); // v7.9.0: 检查锁定状态
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔒 v7.9.0: 检查模块锁定状态
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    checkModuleLocks() {
        if (!LockManager) return;

        // 检查MCP拦截器锁定
        const mcpLock = LockManager.check('mcp_interceptor');
        if (mcpLock.isLocked) {
            console.error('');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('🔒 MCP拦截器已锁定');
            console.error('🔒 防止拦截逻辑被绕过或修改');
            console.error('🔒 解锁命令: 解锁MCP拦截器');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('');
        }

        // 检查规则引擎锁定
        const ruleLock = LockManager.check('rule_engine');
        if (ruleLock.isLocked) {
            console.error('');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('🔒 规则引擎已锁定');
            console.error('🔒 防止规则执行逻辑被禁用或修改');
            console.error('🔒 解锁命令: 解锁规则引擎');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('');
        }
    }

    /**
     * v7.9.0: 检查拦截器模块锁定
     * 在修改拦截逻辑前调用
     */
    checkInterceptorLock(operation = '修改拦截器逻辑') {
        if (!LockManager) return;

        const lockStatus = LockManager.check('mcp_interceptor');
        if (lockStatus.isLocked) {
            LockManager.showFeedback('mcp_interceptor');
            throw new Error('MODULE_LOCKED: MCP拦截器已锁定，操作被拒绝');
        }
    }

    /**
     * v7.9.0: 检查规则引擎锁定
     * 在修改规则执行逻辑前调用
     */
    checkRuleEngineLock(operation = '修改规则引擎') {
        if (!LockManager) return;

        const lockStatus = LockManager.check('rule_engine');
        if (lockStatus.isLocked) {
            LockManager.showFeedback('rule_engine');
            throw new Error('MODULE_LOCKED: 规则引擎已锁定，操作被拒绝');
        }
    }

    // ========== 清除缓存（用于热重载） ==========
    clearCache() {
        const cacheSize = this.ruleCache.size;
        this.ruleCache.clear();
        console.error(`🔄 L1缓存已清除 (${cacheSize}条缓存)`);
        return { cleared: cacheSize, message: '缓存已清除，下次调用将从数据库重新加载规则' };
    }

    // ========== 记录拦截日志（v7.6新增） ==========
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔒🔒🔒 统计模块已锁定 - 禁止修改！🔒🔒🔒
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 
    // ⚠️  此方法负责统计计数，已被全方位锁定！
    // ⚠️  锁定版本: v7.10.8-final3
    // ⚠️  锁定时间: 2025-10-30
    // ⚠️  解锁命令: 解锁统计
    // 
    // 🚫 禁止的操作:
    //    - 修改统计计数逻辑（第225-270行）
    //    - 修改 triggerCount 或 violationCount 计算方式
    //    - 删除数据库日志记录
    //    - 删除或注释任何代码
    // 
    // ✅ 如需修改，请先获得用户授权并执行"解锁统计"命令
    // 
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    logInterception(ruleCode, toolName, args, result, phase = 'pre') {
        // v7.11.0: 使用统计守护者确保全局变量存在
        if (StatisticsGuardian) {
            StatisticsGuardian.ensureGlobalStatsExist();
        } else {
            // 兜底逻辑（v7.10.7原始逻辑）
            if (!global.currentSessionStats) {
                global.currentSessionStats = {
                    triggerCount: 0,
                    violationCount: 0,
                    triggeredRules: new Set(),
                    violatedRules: new Set()
                };
            }
        }

        // 增加触发计数
        global.currentSessionStats.triggerCount++;
        global.currentSessionStats.triggeredRules.add(ruleCode);

        // 如果被拦截（blocked），增加违规计数
        if (result.blocked) {
            global.currentSessionStats.violationCount++;
            global.currentSessionStats.violatedRules.add(ruleCode);
        }

        // 同步到全局变量（兼容旧代码）
        global.triggerCount = global.currentSessionStats.triggerCount;
        global.violationCount = global.currentSessionStats.violationCount;

        const sql = `
            INSERT INTO mcp_interceptor_logs 
            (rule_code, tool_name, tool_args, intercept_phase, intercept_result, block_reason, triggered_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        `;

        this.db.run(sql, [
            ruleCode,
            toolName,
            JSON.stringify(args).substring(0, 500), // 限制长度
            phase,
            result.blocked ? 'blocked' : 'passed',
            result.message || result.block_reason || ''
        ], (err) => {
            if (err) {
                console.error(`❌ 日志记录失败:`, err.message);
            } else {
                console.error(`📝 已记录拦截日志: ${ruleCode} → ${result.blocked ? '🚫拦截' : '✅通过'}`);
            }
        });
    }
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔒 统计模块锁定区域结束
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // ========== Phase 1: 前拦截（执行前） ==========
    async preIntercept(toolName, args) {
        console.error(`[前拦截] ${toolName}`);

        const rules = await this.loadInterceptRules(toolName, 'pre_execution');

        for (const rule of rules) {
            const result = await this.executeRule(rule, toolName, args, 'pre_execution');
            if (result.blocked) {
                console.error(`[拦截器] ❌ 阻止执行: ${result.message}`);
                this.logViolation({
                    phase: 'pre_execution',
                    tool: toolName,
                    rule_id: rule.rule_code,
                    reason: result.message
                });
                return result;
            }
        }

        return { blocked: false, message: 'OK' };
    }

    // ========== Phase 2: 中拦截（执行中） ==========
    async midIntercept(toolName, args, partialResult) {
        console.error(`[中拦截] ${toolName}`);

        const rules = await this.loadInterceptRules(toolName, 'mid_execution');

        for (const rule of rules) {
            const result = await this.executeRule(rule, toolName, args, 'mid_execution', partialResult);
            if (result.blocked) {
                console.error(`[拦截器] ⚠️ 中断执行: ${result.message}`);
                this.logViolation({
                    phase: 'mid_execution',
                    tool: toolName,
                    rule_id: rule.rule_code,
                    reason: result.message
                });
                return result;
            }
        }

        return { blocked: false, message: 'OK' };
    }

    // ========== Phase 3: 后拦截（执行后） ==========
    async postIntercept(toolName, args, result) {
        console.error(`[后拦截] ${toolName}`);

        const rules = await this.loadInterceptRules(toolName, 'post_execution');

        for (const rule of rules) {
            const checkResult = await this.executeRule(rule, toolName, args, 'post_execution', result);
            if (checkResult.blocked) {
                console.error(`[拦截器] ⚠️ 执行后检查失败: ${checkResult.message}`);
                this.logViolation({
                    phase: 'post_execution',
                    tool: toolName,
                    rule_id: rule.rule_code,
                    reason: checkResult.message
                });
                // 后拦截不阻止返回，但记录违规
            }
        }

        return { blocked: false, message: 'OK' };
    }

    // ========== 加载拦截规则（带L1缓存 - v7.6动态加载） ==========
    async loadInterceptRules(toolName, phase) {
        const cacheKey = `${phase}:${toolName}`;
        const cached = this.ruleCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
            this.cacheHits++;
            console.error(`✅ L1缓存命中: ${cacheKey}`);
            return cached.rules;
        }

        this.cacheMisses++;

        // 🔥 v7.6: 从liuxin_mcp_interceptor_rules表加载（数据库驱动）
        return new Promise((resolve) => {
            this.db.all(
                `SELECT * FROM liuxin_mcp_interceptor_rules 
                 WHERE enabled=1 
                   AND (intercept_phase=? OR intercept_phase='all')
                 ORDER BY priority DESC`,
                [phase],
                (err, rows) => {
                    if (err) {
                        console.error('❌ 加载MCP拦截规则失败:', err.message);
                        console.error('   尝试回退到liuxin_rules_unified表...');

                        // 回退到旧表（兼容性）
                        this.db.all(
                            "SELECT * FROM liuxin_rules_unified WHERE category = ? AND enabled = 1",
                            [phase],
                            (err2, rows2) => {
                                if (err2) {
                                    console.error('❌ 回退加载也失败:', err2.message);
                                    return resolve([]);
                                }

                                // 更新L1缓存
                                this.ruleCache.set(cacheKey, {
                                    rules: rows2 || [],
                                    timestamp: Date.now()
                                });

                                resolve(rows2 || []);
                            }
                        );
                        return;
                    }

                    console.error(`✅ 加载了 ${rows.length} 条MCP拦截规则（phase=${phase}）`);

                    // 更新L1缓存
                    this.ruleCache.set(cacheKey, {
                        rules: rows || [],
                        timestamp: Date.now()
                    });

                    resolve(rows || []);
                }
            );
        });
    }

    // ========== v7.6: 通用规则检查辅助函数 ==========

    checkGlobalFlag(pattern) {
        try {
            const config = typeof pattern === 'string' ? JSON.parse(pattern) : pattern;
            const flag = config.flag;
            const expected = config.expected;
            return global[flag] === expected;
        } catch (e) {
            console.error('checkGlobalFlag解析失败:', e.message);
            return false;
        }
    }

    checkToolName(toolName, pattern) {
        try {
            if (typeof pattern === 'string') {
                // 简单字符串匹配
                return toolName === pattern;
            }
            const config = typeof pattern === 'string' ? JSON.parse(pattern) : pattern;
            if (Array.isArray(config)) {
                return config.includes(toolName);
            }
            if (config.tools) {
                return config.tools.includes(toolName);
            }
            return false;
        } catch (e) {
            console.error('checkToolName解析失败:', e.message);
            return false;
        }
    }

    checkToolArgs(args, pattern) {
        try {
            const config = typeof pattern === 'string' ? JSON.parse(pattern) : pattern;

            // 检查文件数量阈值
            if (config.file_count_threshold) {
                const fileCount = this.countFilesInArgs(args);
                return fileCount > config.file_count_threshold;
            }

            // 检查禁止的路径
            if (config.forbidden_paths && Array.isArray(config.forbidden_paths)) {
                const argsStr = JSON.stringify(args).toLowerCase();
                return config.forbidden_paths.some(path => argsStr.includes(path.toLowerCase()));
            }

            // 🔥 v7.6.2: 检查交互式命令（CMD-NON-INTERACTIVE-001）
            if (config.check_interactive && args.command) {
                const command = args.command.toLowerCase();
                const interactiveCommands = config.interactive_commands || [];
                const hasInteractiveCommand = interactiveCommands.some(cmd => command.includes(cmd.toLowerCase()));

                if (hasInteractiveCommand) {
                    const requiredFlags = config.required_flags || [];
                    const hasNonInteractiveFlag = requiredFlags.some(flag => command.includes(flag));
                    return !hasNonInteractiveFlag; // 如果缺少非交互参数，返回true（违规）
                }
            }

            // 🔥 v7.6.2: 检查长时间运行命令（CMD-BACKGROUND-001）
            if (config.check_long_running && args.command) {
                const command = args.command.toLowerCase();
                const longRunningCommands = config.long_running_commands || [];
                const isLongRunning = longRunningCommands.some(cmd => command.includes(cmd.toLowerCase()));

                if (isLongRunning) {
                    // 检查是否设置了is_background=true
                    return !args.is_background; // 如果没有设置is_background，返回true（违规）
                }
            }

            return false;
        } catch (e) {
            console.error('checkToolArgs解析失败:', e.message);
            return false;
        }
    }

    countFilesInArgs(args) {
        let count = 0;
        if (args.file_path) count++;
        if (args.target_file) count++;
        if (args.files && Array.isArray(args.files)) count += args.files.length;
        return count;
    }

    checkRegex(context, pattern) {
        try {
            const regex = new RegExp(pattern, 'gim');
            const text = typeof context === 'string' ? context : JSON.stringify(context);
            return regex.test(text);
        } catch (e) {
            console.error('checkRegex解析失败:', e.message);
            return false;
        }
    }

    /**
     * v7.10.0: 检查API调用
     * @param {string} toolName - 工具名称
     * @param {object} args - 工具参数
     * @param {string} pattern - 检测模式（JSON格式）
     * @returns {boolean} - 是否违规
     */
    checkAPICall(toolName, args, pattern) {
        try {
            const config = typeof pattern === 'string' ? JSON.parse(pattern) : pattern;

            // 检查是否调用了特定的API端点
            if (config.api_endpoint) {
                // 检查工具名称是否匹配
                if (config.tool_name && toolName !== config.tool_name) {
                    return false;
                }

                // 检查参数中是否包含特定的API端点
                const argsStr = JSON.stringify(args).toLowerCase();
                const endpoint = config.api_endpoint.toLowerCase();

                if (config.match_type === 'exact') {
                    // 精确匹配
                    return argsStr.includes(endpoint);
                } else {
                    // 模糊匹配（默认）
                    return argsStr.includes(endpoint);
                }
            }

            // 检查是否调用了特定的HTTP方法
            if (config.http_method && args.method) {
                return args.method.toLowerCase() === config.http_method.toLowerCase();
            }

            // 检查是否包含特定的请求头
            if (config.required_headers && args.headers) {
                const headers = args.headers;
                return config.required_headers.every(header => {
                    return headers[header.name] &&
                        (!header.value || headers[header.name] === header.value);
                });
            }

            return false;
        } catch (e) {
            console.error('checkAPICall解析失败:', e.message);
            return false;
        }
    }

    // ========== v7.6: 动态规则执行引擎 ==========
    async executeRuleDynamic(rule, toolName, args, phase, context) {
        const detectionType = rule.detection_type;
        const pattern = rule.detection_pattern;
        const ruleCode = rule.rule_code;

        // 🔥 v7.9.3: 豁免preloader（解决所有死锁问题）
        // 豁免所有global_flag规则，防止任何规则拦截preloader
        const exemptRules = [
            'AUTO-READ-IMPORTANT-001', 'CLOUD-FORCE-RULES-005', 'CLOUD-FORCE-RULES-010',
            'CLOUD-FORCE-RULES-011', 'IR-001', 'IR-003', 'IR-042', 'MEM-001',
            'RULE-000', 'RULE-001', 'RULE-002', 'RULE-CONFLICT-CHECK-001'
        ];
        if (exemptRules.includes(ruleCode) && toolName === 'liuxin_smart_preloader') {
            console.error(`✅ [豁免] ${ruleCode} 允许调用 liuxin_smart_preloader`);
            return { blocked: false, message: 'OK - 豁免preloader' };
        }

        let violated = false;

        try {
            switch (detectionType) {
                case 'global_flag':
                    // 检查全局标志（如global.preloaderCalled）
                    violated = !this.checkGlobalFlag(pattern);
                    break;

                case 'tool_name':
                    // 检查工具名称
                    violated = this.checkToolName(toolName, pattern);
                    break;

                case 'tool_args':
                    // 检查工具参数
                    violated = this.checkToolArgs(args, pattern);
                    break;

                case 'regex':
                    // 正则匹配
                    violated = this.checkRegex(context, pattern);
                    break;

                case 'api_call':
                    // v7.10.0: API调用检查
                    violated = this.checkAPICall(toolName, args, pattern);
                    break;

                default:
                    console.error(`未知的detection_type: ${detectionType}`);
                    violated = false;
            }
        } catch (error) {
            console.error(`执行动态规则失败 (${rule.rule_code}):`, error.message);
            violated = false;
        }

        // 根据intercept_action决定是否阻止
        if (violated) {
            const action = rule.intercept_action || 'warn';

            if (action === 'block') {
                return {
                    blocked: true,
                    severity: rule.severity || 'MEDIUM',
                    message: rule.block_message || `违反规则: ${rule.rule_name}`,
                    rule_code: rule.rule_code,
                    suggestion: rule.suggestion
                };
            } else if (action === 'warn') {
                console.error(`⚠️ 规则警告 (${rule.rule_code}): ${rule.block_message}`);
                // warn不阻止执行，但记录日志
                return { blocked: false, message: 'OK (warned)' };
            } else if (action === 'log') {
                console.error(`📝 规则日志 (${rule.rule_code}): ${rule.description}`);
                return { blocked: false, message: 'OK (logged)' };
            }
        }

        return { blocked: false, message: 'OK' };
    }

    // ========== 执行规则检查（v7.6混合模式：硬编码+动态） ==========
    async executeRule(rule, toolName, args, phase, context = null) {
        const ruleCode = rule.rule_code;

        // 1. FORCE-REPHRASE-001: 强制复述用户请求（v7.10.1重命名，避免与IR-001冲突）
        if (ruleCode === 'FORCE-REPHRASE-001') {
            // 🔥 v7.10.3: 支持mcp_前缀工具名（因为实际调用是mcp_write等）
            const taskTools = [
                'run_terminal_cmd', 'mcp_run_terminal_cmd',
                'search_replace', 'mcp_search_replace',
                'write', 'mcp_write',
                'delete_file', 'mcp_delete_file'
            ];
            if (taskTools.includes(toolName) && !global.hasRepeated) {
                const result = {
                    blocked: true,
                    severity: 'HIGH',
                    message: '🚫 违反规则FORCE-REPHRASE-001！3步以上任务必须先复述用户需求',
                    rule_code: 'FORCE-REPHRASE-001',
                    suggestion: '请先复述需求，格式："我理解您的需求是：1) ... 2) ... 3) ..."'
                };
                this.logInterception(ruleCode, toolName, args, result, phase);
                return result;
            }
        }

        // 2. CLOUD-FORCE-RULES-011: 团队模式强制
        if (ruleCode === 'CLOUD-FORCE-RULES-011') {
            // 🔥 关键修复: 不拦截preloader本身的调用!
            if (toolName === 'liuxin_smart_preloader') {
                const result = { blocked: false, message: 'OK - preloader自身调用,跳过检查' };
                this.logInterception(ruleCode, toolName, args, result, phase);
                return result;
            }

            // 🔥 豁免: 允许启动HTTP服务器（解决死锁问题）
            if (toolName === 'mcp_run_terminal_cmd' && args.command) {
                const cmd = args.command.toLowerCase();
                if (cmd.includes('liuxin-mcp-http-server-full.js') &&
                    (cmd.includes('node') || cmd.includes('start'))) {
                    const result = { blocked: false, message: 'OK - 允许启动HTTP服务器' };
                    this.logInterception(ruleCode, toolName, args, result, phase);
                    return result;
                }
            }

            // 只检查其他工具调用
            if (!global.preloaderCalled) {
                // 🔥 v7.10.1: 尊重数据库配置的 intercept_action
                const shouldBlock = rule.intercept_action === 'block';
                const result = {
                    blocked: shouldBlock,  // 根据数据库配置决定是否阻止
                    severity: 'CRITICAL',
                    message: shouldBlock
                        ? '🚫 违反团队模式规则！每次回复前必须调用preloader获取角色'
                        : '⚠️ 警告：建议调用团队模式preloader',
                    rule_code: 'CLOUD-FORCE-RULES-011',
                    suggestion: '请先调用 POST /api/team-mode-enhanced'
                };
                this.logInterception(ruleCode, toolName, args, result, phase);
                return result;
            }
        }

        // 3. AUTO-READ-IMPORTANT-001: 自动读取重要文件
        if (ruleCode === 'AUTO-READ-IMPORTANT-001') {
            // 🔥 关键修复: 不拦截preloader本身（避免死锁）
            if (toolName === 'liuxin_smart_preloader') {
                const result = { blocked: false, message: 'OK - preloader豁免,不检查系统总览' };
                this.logInterception(ruleCode, toolName, args, result, phase);
                return result;
            }

            const keywords = ['系统', '架构', '全貌', '总览', '拦截', '整体', '分析', '检查'];
            const userInput = (args.user_input || args.message || global.lastUserInput || '').toLowerCase();
            const hasKeyword = keywords.some(kw => userInput.includes(kw.toLowerCase()));

            if (hasKeyword && !global.hasReadSystemOverview) {
                return {
                    blocked: true,
                    severity: 'HIGH',
                    message: '🚫 检测到系统相关关键词！必须先读取系统总览文件了解全貌',
                    rule_code: 'AUTO-READ-IMPORTANT-001',
                    required_file: '🌟柳芯系统总览.json',
                    suggestion: '请先读取系统总览文件了解系统完整架构'
                };
            }
        }

        // 4. TEST-FORCE-001: 强制真实测试验证规则 (新增)
        if (ruleCode === 'TEST-FORCE-001') {
            const completionKeywords = ['测试完成', '部署完成', '测试通过', '已验证', '测试成功', '全部通过'];
            const aiResponse = (args.text || args.response || context?.text || '').toLowerCase();

            const hasCompletionClaim = completionKeywords.some(kw => aiResponse.includes(kw));

            if (hasCompletionClaim) {
                // 查询数据库,检查是否有3次成功记录
                return new Promise((resolve) => {
                    const scenario = args.test_scenario || 'MCP拦截器-团队模式强制';
                    this.db.get(
                        "SELECT success_count, verification_status FROM test_verification_status WHERE test_scenario = ?",
                        [scenario],
                        (err, row) => {
                            if (err || !row) {
                                resolve({
                                    blocked: true,
                                    severity: 'CRITICAL',
                                    message: `🚫 TEST-FORCE-001: 未找到测试记录！
                                    
必须提供:
1. ✅ 真实Cursor环境测试截图
2. ✅ 连续3次成功的证据
3. ✅ 每次测试的时间戳
4. ✅ 用户确认

当前状态: 无测试记录`,
                                    rule_code: 'TEST-FORCE-001',
                                    current_success: 0,
                                    required_success: 3
                                });
                            } else if (row.success_count < 3) {
                                resolve({
                                    blocked: true,
                                    severity: 'CRITICAL',
                                    message: `🚫 TEST-FORCE-001: 测试验证不足！

当前进度: ${row.success_count}/3 次成功
验证状态: ${row.verification_status}

必须提供:
1. ✅ 真实Cursor环境测试截图
2. ✅ 连续3次成功的证据
3. ✅ 每次测试的时间戳
4. ✅ 用户确认

禁止:
❌ 代码审查判断成功
❌ 日志分析判断成功
❌ 理论推导判断成功

请继续测试,直到连续3次成功!`,
                                    rule_code: 'TEST-FORCE-001',
                                    current_success: row.success_count,
                                    required_success: 3
                                });
                            } else {
                                resolve({ blocked: false, message: 'OK' });
                            }
                        }
                    );
                });
            }
        }

        // 🔥 v7.6关键改进: 硬编码规则未匹配时，尝试动态执行引擎
        // 对于数据库中的其他54条规则（59-5），使用通用执行引擎
        // v7.10.1: 将 IR-001 改为 FORCE-REPHRASE-001（避免与数据库IR-001冲突）
        const hardcodedRules = ['FORCE-REPHRASE-001', 'CLOUD-FORCE-RULES-011', 'AUTO-READ-IMPORTANT-001', 'TEST-FORCE-001'];
        if (!hardcodedRules.includes(ruleCode)) {
            console.error(`[动态引擎] 执行规则: ${ruleCode}`);
            const result = await this.executeRuleDynamic(rule, toolName, args, phase, context);
            this.logInterception(ruleCode, toolName, args, result, phase);
            return result;
        }

        // 规则通过
        const result = { blocked: false, message: 'OK' };
        this.logInterception(ruleCode, toolName, args, result, phase);
        return result;
    }

    // ========== 记录违规日志 ==========
    logViolation(violation) {
        this.violationLog.push(violation);
        this.db.run(
            "INSERT INTO violation_logs (phase, tool, rule_id, reason) VALUES (?, ?, ?, ?)",
            [violation.phase, violation.tool, violation.rule_id, violation.reason]
        );
    }

    // ========== 获取违规统计 ==========
    getViolationStats() {
        return {
            total: this.violationLog.length,
            recent: this.violationLog.slice(-10)
        };
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚀 统一MCP服务器类
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class UnifiedMCPServer {
    constructor() {
        // 数据库连接
        const dbPath = process.env.XIAOLIU_DATA_DB_PATH || path.join(__dirname, 'liuxin.db');
        this.db = new sqlite3.Database(dbPath);

        // 三阶段拦截器
        this.interceptor = new ThreePhaseInterceptor(this.db);

        // v7.8.0: Response拦截器
        this.responseInterceptor = new ResponseInterceptor(this.db);

        // v7.7.0: 注入拦截器到所有包装工具
        Object.values(mcpWrappers).forEach(wrapper => {
            wrapper.setInterceptor(this.interceptor);
        });

        // MCP服务器
        this.mcpServer = new Server({
            name: 'liuxin-unified-mcp',
            version: '7.8.6'
        }, {
            capabilities: {
                tools: {}
            }
        });

        // HTTP API地址
        this.apiUrl = process.env.XIAOLIU_API_URL || 'http://localhost:3002';

        // 全局状态
        global.hasRepeated = false;
        global.preloaderCalled = false;
        global.hasReadSystemOverview = false;
        global.lastUserInput = '';
        global.currentRole = null;
        global.obey_all_rules = true;  // v7.9.1: AI必须遵守所有规则

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🔴 终极锁定警告 - 全局统计变量初始化（行889-892）
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //
        // ⚠️ 绝对禁止修改此代码块！⚠️
        //
        // 【保护范围】: 行 889-892
        // 【保护级别】: ULTIMATE
        // 【保护原因】: 服务器启动时初始化全局统计变量，所有统计的基础
        //
        // 【核心原则】:
        //    1. 初始化为0 - 每次服务器启动都重置
        //    2. 使用Set存储规则ID - 自动去重，确保不重复计数
        //    3. 全局变量 - 供所有模块访问
        //
        // 【修改风险】:
        //    ❌ 修改初始值会导致启动时统计就不是0
        //    ❌ 删除初始化会导致变量undefined崩溃
        //    ❌ 修改数据类型（如Set改Array）会导致累加逻辑失败
        //
        // 【解锁命令】:
        //    node locks/UnlockCommandHandler.js unlock statistics "修复原因"
        //
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        global.triggerCount = 0;  // v7.8.6: 统计触发规则数（不同规则）
        global.violationCount = 0; // v7.8.6: 统计违规规则数（不同规则）
        global.triggeredRules = new Set();  // v7.8.6: 追踪触发的规则
        global.violatedRules = new Set();   // v7.8.6: 追踪违规的规则

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ⚠️ 终极锁定区域结束 - 全局统计变量初始化 ⚠️
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('🔥 柳芯统一MCP服务器 v7.8.0');
        console.error('✅ 三阶段拦截器已初始化');
        console.error('✅ MCP工具包装器已加载 (8个工具)');
        console.error('✅ Response拦截器已初始化 (v7.8.0)');
        console.error(`✅ HTTP API: ${this.apiUrl}`);
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        this.setupHandlers();
    }

    // ========== 设置请求处理器 ==========
    setupHandlers() {
        // 工具列表
        this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: this.getToolDefinitions()
            };
        });

        // 工具调用（带拦截器）
        this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
            return await this.handleToolCall(request.params.name, request.params.arguments || {});
        });
    }

    // ========== 工具调用处理（核心：三阶段拦截） ==========
    async handleToolCall(toolName, args) {
        debugLog(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        debugLog(`🔧 [DEBUG] 原始工具调用: toolName="${toolName}"`);
        debugLog(`🔧 [DEBUG] 参数: ${JSON.stringify(args).substring(0, 100)}...`);
        debugLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        try {
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // ⚠️ 统计重置逻辑 - v7.10.12 修复
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            //
            // v7.10.12: 修复统计重置机制
            // 问题根因: 5秒时间间隔不合理，导致切换窗口时统计不重置
            // 正确方案: 使用30秒时间间隔 + 检测特定"对话开始"工具
            //
            // 🎯 核心原理：
            //    - 30秒无活动 = 新对话（足够长的间隔，避免误判）
            //    - 检测特定工具（如liuxin_smart_preloader）= 新对话开始
            //    - 在工具调用开始时立即重置
            //
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            // v7.11.0: 使用统计守护者初始化
            // 重置逻辑已移至ResponseInterceptor.intercept方法的末尾

            if (StatisticsGuardian) {
                // 使用守护者初始化（自带自检自愈）
                StatisticsGuardian.ensureGlobalStatsExist();
                console.error(`\n🛡️ [MCP Server] 统计守护者已初始化全局变量\n`);
            } else {
                // 兜底逻辑（v7.10.13原始逻辑）
                if (!global.currentSessionStats) {
                    console.error(`\n🆕 [统计初始化] 首次初始化统计系统（原始逻辑）`);
                    global.currentSessionStats = {
                        triggerCount: 0,
                        violationCount: 0,
                        triggeredRules: new Set(),
                        violatedRules: new Set(),
                        sessionId: Date.now(),
                        lastResetTime: Date.now()
                    };
                    global.triggerCount = 0;
                    global.violationCount = 0;
                    global.triggeredRules = new Set();
                    global.violatedRules = new Set();
                    console.error(`  初始化完成: 触发0条规则, 违规0条\n`);
                }
            }

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // ⚠️ 统计重置区域结束 ⚠️
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            // v7.9.1: 移除自动重置逻辑，避免重复拦截
            // 全局标志在整个MCP会话期间保持，只在MCP服务器重启时重置
            // 这样可以确保：拦截一次提示后，AI执行了就不再重复拦截

            // 🔒 Phase 0: 锁定检查（v7.10.2 新增 - 最高优先级）
            if (LockManager) {
                debugLog(`🔒 [Phase 0] 锁定检查: toolName="${toolName}"`);
                const lockCheck = LockManager.checkToolCall(toolName, args);

                if (lockCheck.blocked) {
                    // 详细日志记录
                    debugLog(`🔒 [Phase 0] ❌ 拦截成功!`);
                    debugLog(`🔒 [Phase 0] 模块: ${lockCheck.module || 'unknown'}`);
                    debugLog(`🔒 [Phase 0] 文件: ${lockCheck.file || 'unknown'}`);
                    debugLog(`🔒 [Phase 0] 原因: ${lockCheck.message}`);

                    console.error(`🔒 锁定拦截: ${lockCheck.message} - 文件: ${lockCheck.file || 'unknown'}`);

                    // 优化拦截消息，提醒用户配置修改需要重启
                    const restartHint = '\n\n⚠️ **注意**: 如果您刚刚修改了锁定配置，请重启 Cursor 使配置生效。\n或使用中文命令"解锁复述"来解锁模块。';

                    return {
                        content: [{
                            type: 'text',
                            text: `🔒 拦截: ${lockCheck.message}\n\n${lockCheck.feedback}${restartHint}`
                        }],
                        isError: true
                    };
                } else {
                    debugLog(`🔒 [Phase 0] ✅ 通过检查（未锁定或非保护文件）`);
                }
            } else {
                debugLog(`🔒 [Phase 0] ⚠️ LockManager 未加载，跳过锁定检查`);
            }

            // 🔥 Phase 1: 前拦截
            const preResult = await this.interceptor.preIntercept(toolName, args);
            if (preResult.blocked) {
                return {
                    content: [{
                        type: 'text',
                        text: `🚫 拦截: ${preResult.message}\n\n建议: ${preResult.suggestion || '请检查操作是否符合规则'}`
                    }],
                    isError: true
                };
            }

            // 🔥 执行工具
            let result = await this.executeToolCall(toolName, args);

            // 🔥 v7.10.1: 标准化result格式（确保ResponseInterceptor能够触发）
            if (!result.content || !result.content[0] || result.content[0].type !== 'text') {
                console.error(`⚠️ 工具 ${toolName} 返回非标准格式，正在标准化...`);
                result = {
                    content: [{
                        type: 'text',
                        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                    }],
                    isError: result.isError || false
                };
            }

            // 🔥 Phase 3: 后拦截
            await this.interceptor.postIntercept(toolName, args, result);

            // 🔥 v7.8.0: Response拦截器（检查并修正输出内容）
            // 🔥 v7.11.0: 只对非基础MCP工具的输出进行拦截包装
            const isBasicMCPTool = toolName.startsWith('mcp_');

            if (!isBasicMCPTool && result.content && result.content[0] && result.content[0].type === 'text') {
                const responseText = result.content[0].text;

                const interceptResult = await this.responseInterceptor.intercept(responseText, {
                    toolName,
                    args,
                    trigger_count: global.triggerCount,
                    violation_count: global.violationCount
                });

                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // 🔴 终极锁定警告 - Response拦截后的统计更新（行1086-1100）
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                //
                // ⚠️ 绝对禁止修改此代码块！⚠️
                //
                // 【保护范围】: 行 1086-1100
                // 【保护级别】: ULTIMATE
                // 【保护原因】: Response拦截结果的统计更新，与MCP服务器配合累加
                //
                // 【核心原则】:
                //    1. 使用Set去重 - triggeredRules.add()自动去重
                //    2. 先记录规则ID到Set，再从Set.size获取计数
                //    3. 这是MCP服务器唯一的统计更新点（Response部分）
                //
                // 【修改风险】:
                //    ❌ 修改累加逻辑会导致统计错误
                //    ❌ 删除Set.add()会导致规则不被统计
                //    ❌ 修改计数方式(如直接++)会导致重复计数
                //
                // 【解锁命令】:
                //    node locks/UnlockCommandHandler.js unlock statistics "修复原因"
                //
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                // v7.8.6: 记录触发和违规的规则（去重）
                if (interceptResult.checked_rules && interceptResult.checked_rules.length > 0) {
                    interceptResult.checked_rules.forEach(code => global.triggeredRules.add(code));
                }

                if (interceptResult.violations.length > 0) {
                    console.error(`⚠️ Response检查到 ${interceptResult.violations.length} 个违规`);
                    interceptResult.violations.forEach(v => {
                        console.error(`   - ${v.rule_code}: ${v.rule_name}`);
                        global.violatedRules.add(v.rule_code);  // v7.8.6: 记录违规规则（去重）
                    });
                }

                // v7.8.6: 更新计数（基于不同规则数）
                global.triggerCount = global.triggeredRules.size;
                global.violationCount = global.violatedRules.size;

                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // ⚠️ 终极锁定区域结束 - Response拦截统计更新 ⚠️
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                if (interceptResult.had_corrections) {
                    console.error(`✅ Response已自动修正`);
                    result.content[0].text = interceptResult.corrected_response;
                }
            }

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 🔥 v7.12.0: 强制统计显示提醒 (通过MCP实现，不依赖.cursorrules)
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            //
            // 📌 目的: 确保所有对话框（包括无工具调用的）都显示统计
            // 📌 实现: 在每个MCP工具返回的末尾添加统计提醒标记
            // 📌 原理: AI看到这个标记后，会在自己的回复末尾添加统计信息
            //
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            if (result.content && result.content[0] && result.content[0].type === 'text') {
                const currentStats = {
                    triggered: global.currentSessionStats?.triggeredRules?.size || 0,
                    violated: global.currentSessionStats?.violatedRules?.size || 0
                };

                // 添加统计提醒（对AI可见，但不会显示给用户）
                const statsReminder = `\n\n[SYSTEM_STATS: ${currentStats.triggered}/350触发, ${currentStats.violated}违规 - AI必须在回复末尾显示: 📊 统计：触发 ${currentStats.triggered}/350条  违规 ${currentStats.violated}条]`;

                result.content[0].text += statsReminder;

                console.error(`📊 [MCP] 已注入统计提醒: 触发${currentStats.triggered}/350条, 违规${currentStats.violated}条`);
            }

            return result;

        } catch (error) {
            console.error(`❌ 工具调用失败: ${error.message}`);
            return {
                content: [{
                    type: 'text',
                    text: `❌ 错误: ${error.message}`
                }],
                isError: true
            };
        }
    }

    // ========== 执行具体工具调用 ==========
    async executeToolCall(toolName, args) {
        // v7.7.0: 优先检查是否为包装工具
        debugLog(`🔍 [DEBUG] 检查包装工具: toolName="${toolName}"`);
        debugLog(`🔍 [DEBUG] mcpWrappers可用键: ${Object.keys(mcpWrappers).join(', ')}`);
        debugLog(`🔍 [DEBUG] mcpWrappers[toolName]存在吗? ${!!mcpWrappers[toolName]}`);

        if (mcpWrappers[toolName]) {
            debugLog(`✅ [DEBUG] 使用包装工具: ${toolName}`);
            try {
                const result = await mcpWrappers[toolName].handle(args);
                return {
                    content: [{
                        type: 'text',
                        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: 'text',
                        text: `❌ 执行失败: ${error.message}`
                    }],
                    isError: true
                };
            }
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🎯 特殊处理: liuxin_smart_preloader 直接调用 (v7.10.8修复+完整预加载)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (toolName === 'liuxin_smart_preloader' && SmartPreloader) {
            try {
                const userInput = args.user_input || args.message || '';

                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // 🔒 统计模块锁定区域 - v7.10.9 (新对话检测+重置)
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // 
                // 📌 功能: 检测新用户输入，自动重置统计计数器
                // 
                // 🚫 禁止修改以下代码：
                //    - 删除或注释用户输入检测逻辑
                //    - 修改 lastUserInput 比较逻辑
                //    - 删除统计重置代码
                //    - 修改重置条件
                // 
                // ✅ 如需修改，请先获得用户授权并执行"解锁统计"命令
                // 
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                // v7.10.9: 检测新用户输入，重置统计
                const isNewUserInput = (userInput !== global.lastUserInput && userInput.trim().length > 0);

                if (isNewUserInput) {
                    console.error(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                    console.error(`🔄 [统计重置] 检测到新用户输入`);
                    console.error(`  旧计数: 触发${global.currentSessionStats?.triggerCount || 0}次, 违规${global.currentSessionStats?.violationCount || 0}次`);

                    // 重置所有统计
                    global.currentSessionStats = {
                        triggerCount: 0,
                        violationCount: 0,
                        triggeredRules: new Set(),
                        violatedRules: new Set(),
                        sessionId: Date.now(),
                        lastResetTime: Date.now()
                    };

                    global.triggerCount = 0;
                    global.violationCount = 0;
                    global.triggeredRules = new Set();
                    global.violatedRules = new Set();

                    // 更新最后用户输入
                    global.lastUserInput = userInput;

                    console.error(`  新计数: 触发0次, 违规0次`);
                    console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                } else {
                    // 即使不重置，也更新lastUserInput
                    global.lastUserInput = userInput;
                }

                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // 🔒 统计模块锁定区域结束
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                console.error(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                console.error(`🎯 [团队模式+预加载] 收到用户输入: ${userInput.substring(0, 50)}...`);

                // 🎯 记录功能使用
                if (FeatureRegistry) {
                    FeatureRegistry.recordUsage('smart-preloader');
                }

                // 调用SmartPreloader.generateResponse (async)
                const result = await SmartPreloader.generateResponse(userInput);

                // 设置全局角色
                if (result.assigned_role) {
                    global.currentRole = result.assigned_role;
                    global.preloaderCalled = true;

                    console.error(`✅ [团队模式] 角色已分配: ${global.currentRole}`);
                    console.error(`   - 匹配置信度: ${result.role_confidence}%`);
                    console.error(`   - 对话类型: ${result.dialogue_type}`);
                    console.error(`   - 加载级别: ${result.load_level}`);

                    // v7.10.8: 显示预加载数据统计
                    if (result.skills_count !== undefined) {
                        console.error(`✅ [预加载] 数据已加载:`);
                        console.error(`   - 技能数: ${result.skills_count}`);
                        console.error(`   - 经验数: ${result.experiences_count}`);
                        console.error(`   - 规则数: ${result.active_rules_count}`);
                        if (result.preload_data) {
                            console.error(`   - P0记忆: 已加载`);
                        }
                        if (result.preload_catalogs) {
                            console.error(`   - P1目录: 已加载`);
                        }
                    }

                    console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
                } else {
                    console.error(`⚠️ [团队模式] 未能分配角色，使用默认值`);
                    global.currentRole = '开发工程师-小柳'; // 默认角色
                    global.preloaderCalled = true;
                }

                // 返回完整结果
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }]
                };

            } catch (error) {
                console.error(`❌ [团队模式+预加载] 调用失败: ${error.message}`);
                console.error(error.stack);

                // 设置默认角色以避免系统崩溃
                global.currentRole = '开发工程师-小柳';
                global.preloaderCalled = true;

                return {
                    content: [{
                        type: 'text',
                        text: `⚠️ 团队模式+预加载错误: ${error.message}\n使用默认角色: ${global.currentRole}`
                    }],
                    isError: true
                };
            }
        }

        // 根据工具名调用对应的HTTP API
        const apiEndpoint = this.getApiEndpoint(toolName);

        if (!apiEndpoint) {
            return {
                content: [{
                    type: 'text',
                    text: `⚠️ 未知工具: ${toolName}`
                }]
            };
        }

        try {
            const response = await axios.post(`${this.apiUrl}${apiEndpoint}`, args, {
                timeout: 30000
            });

            return {
                content: [{
                    type: 'text',
                    text: typeof response.data === 'string'
                        ? response.data
                        : JSON.stringify(response.data, null, 2)
                }]
            };

        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                return {
                    content: [{
                        type: 'text',
                        text: `⚠️ HTTP服务器未运行\n\n请先启动: node liuxin-mcp-http-server-full.js`
                    }],
                    isError: true
                };
            }

            throw error;
        }
    }

    // ========== API端点映射 ==========
    getApiEndpoint(toolName) {
        const mapping = {
            'liuxin_smart_preloader': '/api/team-mode-enhanced',
            'liuxin_scene_analyzer': '/api/scene-analyze',
            'liuxin_command_interceptor': '/api/command-validate',
            'liuxin_code_change_interceptor': '/api/code-scope-check',
            'liuxin_gui_test_enforcer': '/api/gui-test-enforce',
            'liuxin_requirement_rules': '/api/rules/trigger',
            'liuxin_memory_manager': '/api/memory/load',
            'liuxin_violation_detector': '/api/violations/detect'
        };

        return mapping[toolName] || null;
    }

    // ========== 工具定义 ==========
    getToolDefinitions() {
        return [
            // ========== v7.7.0: MCP包装工具（优先级最高） ==========
            ...wrappedToolDefs,

            // ========== 原有MCP工具 ==========
            {
                name: 'liuxin_smart_preloader',
                description: '🎯 团队模式智能预加载器 - 根据用户输入自动分配角色',
                inputSchema: {
                    type: 'object',
                    properties: {
                        user_input: {
                            type: 'string',
                            description: '用户输入内容'
                        }
                    },
                    required: ['user_input']
                }
            },
            {
                name: 'liuxin_scene_analyzer',
                description: '🔍 场景分析器 - 识别6种场景并推荐工具',
                inputSchema: {
                    type: 'object',
                    properties: {
                        user_message: {
                            type: 'string',
                            description: '用户消息'
                        }
                    },
                    required: ['user_message']
                }
            },
            {
                name: 'liuxin_command_interceptor',
                description: '⚠️ 命令拦截器 - 检查危险命令',
                inputSchema: {
                    type: 'object',
                    properties: {
                        command: {
                            type: 'string',
                            description: '要执行的命令'
                        }
                    },
                    required: ['command']
                }
            },
            {
                name: 'liuxin_violation_detector',
                description: '🔥 违规检测器 - v2.0正则引擎(准确率100%)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            enum: ['check', 'get_rules'],
                            description: '操作类型'
                        },
                        text: {
                            type: 'string',
                            description: 'AI回复文本'
                        },
                        context: {
                            type: 'object',
                            description: '上下文信息'
                        }
                    },
                    required: ['action']
                }
            }
        ];
    }

    // ========== 关闭数据库连接 ==========
    close() {
        if (this.db) {
            this.db.close();
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚀 启动模式检测
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MODE = process.env.MCP_TRANSPORT || 'stdio';

async function main() {
    const server = new UnifiedMCPServer();

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔥 v7.11.1: 注册数据库规则配置的热重载
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (ConfigHotReloadManager) {
        const dbPath = process.env.XIAOLIU_DATA_DB_PATH || path.join(__dirname, 'liuxin.db');

        // 注册数据库变更监听（当liuxin.db被修改时，清除规则引擎的L1缓存）
        ConfigHotReloadManager.register(
            'db-rules',
            dbPath,
            () => {
                if (server.interceptor && server.interceptor.clearCache) {
                    const result = server.interceptor.clearCache();
                    return {
                        success: true,
                        message: `规则引擎缓存已清除: ${result.message}`
                    };
                }
                return { success: false, message: '规则引擎不可用' };
            }
        );
    }

    if (MODE === 'stdio') {
        // 🖥️ 本地模式: stdio
        console.error('🖥️ 启动模式: stdio (本地测试)');
        const transport = new StdioServerTransport();
        await server.mcpServer.connect(transport);
        console.error('✅ stdio传输已连接');

    } else if (MODE === 'sse') {
        // ☁️ 云端模式: SSE
        console.error('☁️ 启动模式: SSE (云端部署)');

        const app = express();
        app.use(cors());
        app.use(express.json());

        // SSE端点
        app.get('/sse', async (req, res) => {
            console.error('📥 收到SSE连接请求');

            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            const transport = new SSEServerTransport('/sse', res);
            await server.mcpServer.connect(transport);

            console.error('✅ SSE传输已连接');
        });

        // 健康检查
        app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                mode: 'SSE',
                version: '7.6.4',
                interceptor: 'enabled'
            });
        });

        const PORT = process.env.PORT || 3003;
        app.listen(PORT, '0.0.0.0', () => {
            console.error(`✅ SSE服务器启动: http://0.0.0.0:${PORT}/sse`);
            console.error(`✅ 健康检查: http://0.0.0.0:${PORT}/health`);
        });
    } else {
        console.error(`❌ 未知模式: ${MODE}`);
        console.error('请设置 MCP_TRANSPORT=stdio 或 MCP_TRANSPORT=sse');
        process.exit(1);
    }
}

// 启动服务器
if (require.main === module) {
    main().catch((error) => {
        console.error('❌ 启动失败:', error);
        process.exit(1);
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔥 优雅关闭处理 (v7.10.5)
// v7.11.1: 使用统一配置热重载管理器
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
process.on('SIGINT', () => {
    console.error('\n🛑 收到 SIGINT 信号，正在优雅关闭...');

    // v7.11.1: 停止统一配置热重载管理器
    if (ConfigHotReloadManager && ConfigHotReloadManager.stopAll) {
        console.error('🔥 停止配置热重载管理器...');
        ConfigHotReloadManager.stopAll();
    }

    // v7.11.0: HotReloadManager（代码热重载）- 已废弃但保留兼容
    if (HotReloadManager && HotReloadManager.stopWatching) {
        console.error('🔥 停止代码热重载管理器（已废弃）...');
        HotReloadManager.stopWatching();
    }

    console.error('✅ MCP 服务器已关闭');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.error('\n🛑 收到 SIGTERM 信号，正在优雅关闭...');

    // v7.11.1: 停止统一配置热重载管理器
    if (ConfigHotReloadManager && ConfigHotReloadManager.stopAll) {
        ConfigHotReloadManager.stopAll();
    }

    // v7.11.0: HotReloadManager（代码热重载）- 已废弃但保留兼容
    if (HotReloadManager && HotReloadManager.stopWatching) {
        HotReloadManager.stopWatching();
    }

    process.exit(0);
});

module.exports = UnifiedMCPServer;

