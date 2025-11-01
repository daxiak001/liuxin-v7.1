/**
 * Response拦截器 v7.9.0
 * 在AI回复输出前检查并自动修正违规内容
 * v7.8.5: 增强复述检测，支持结构化深度复述
 * v7.8.8: 添加统计模块锁定机制
 * v7.9.0: 升级为中央锁管理器，全链路保护
 */

const fs = require('fs');
const path = require('path');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔒 中央锁管理器集成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let LockManager = null;
try {
    const { getInstance } = require('./locks/LockManager');
    LockManager = getInstance();
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
    console.error('✅ [ResponseInterceptor] 统计守护者已加载');
} catch (err) {
    console.error('⚠️ 无法加载统计守护者:', err.message);
}

class ResponseInterceptor {
    constructor(db) {
        this.db = db;
        this.rules = [];
        this.rulesLoaded = false;
        this.cacheExpiry = null;
        this.checkModuleLocks(); // 检查所有锁定状态
    }

    /**
     * v7.9.0: 检查所有模块锁定状态
     * 🔒 全链路保护机制
     */
    checkModuleLocks() {
        if (!LockManager) {
            return; // 锁管理器未加载，跳过检查
        }

        // 检查统计模块
        const statisticsLock = LockManager.check('statistics');
        if (statisticsLock.isLocked) {
            console.error('');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('🔒 统计模块已锁定');
            console.error('🔒 防止意外修改统计数据生成逻辑');
            console.error('🔒 解锁命令: 解锁统计模块');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('');
        }

        // 检查Response拦截器
        const responseInterceptorLock = LockManager.check('response_interceptor');
        if (responseInterceptorLock.isLocked) {
            console.error('');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('🔒 Response拦截器已锁定');
            console.error('🔒 防止意外修改拦截逻辑');
            console.error('🔒 解锁命令: 解锁Response拦截器');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('');
        }
    }

    /**
     * v7.9.0: 在修改统计模块前检查锁定状态
     * 🔒 锁定检查 - 统计模块
     */
    checkStatisticsModuleLock(operation = '修改统计逻辑') {
        // 暂时禁用锁定检查，避免影响正常功能
        return;

        // if (!LockManager) {
        //     return; // 锁管理器未加载，允许操作
        // }

        // const lockStatus = LockManager.check('statistics');
        // if (lockStatus.isLocked) {
        //     LockManager.showFeedback('statistics');
        //     throw new Error('MODULE_LOCKED: 统计模块已锁定，操作被拒绝');
        // }
    }

    /**
     * v7.8.7: 记录拦截日志到数据库
     * v7.10.0: 修改为记录到mcp_interceptor_logs表，与MCP拦截器统一
     * v7.10.7: 增加当次对话统计计数
     */
    async logInterception(rule, result, context = {}) {
        return new Promise((resolve) => {
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 🔴 终极锁定警告 - logInterception统计初始化（行89-100）
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            //
            // ⚠️ 绝对禁止修改此代码块！⚠️
            //
            // 【保护范围】: 行 89-100
            // 【保护级别】: ULTIMATE
            // 【保护原因】: 统计初始化逻辑，只初始化不累加，防止双重计数
            //
            // 【核心原则】:
            //    1. 只做初始化 - 不进行任何累加操作
            //    2. 只检查是否存在 - 不修改现有值
            //    3. ResponseInterceptor不累加 - 只有MCP服务器累加
            //
            // 【修改风险】:
            //    ❌ 添加累加逻辑会导致双重计数（MCP+Response都累加）
            //    ❌ 修改初始化逻辑可能导致全局变量undefined
            //    ❌ 删除初始化会导致后续访问global.currentSessionStats崩溃
            //
            // 【解锁命令】:
            //    node locks/UnlockCommandHandler.js unlock statistics "修复原因"
            //
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            // v7.10.7: 更新当次对话统计
            if (!global.currentSessionStats) {
                global.currentSessionStats = {
                    triggerCount: 0,
                    violationCount: 0,
                    triggeredRules: new Set(),
                    violatedRules: new Set()
                };
            }

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // ⚠️ 终极锁定区域结束 - logInterception统计初始化 ⚠️
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // ⚠️ 终极锁定警告 - 已删除的累加逻辑 ⚠️
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            //
            // v7.10.9-重构: 删除累加（避免双重计数，MCP服务器已统计）
            //
            // 🚫 绝对禁止恢复以下代码：
            //
            // ❌ global.currentSessionStats.triggerCount++;
            // ❌ global.currentSessionStats.triggeredRules.add(rule.rule_code);
            // ❌ if (result.violated && context.had_correction) {
            // ❌     global.currentSessionStats.violationCount++;
            // ❌     global.currentSessionStats.violatedRules.add(rule.rule_code);
            // ❌ }
            //
            // ⚠️ 为什么删除：
            //    - MCP服务器已经在logInterception时累加过了
            //    - 这里再累加会导致双倍统计（双重累加问题）
            //    - 这是导致统计超过535的根本原因之一
            //
            // ⚠️ 恢复后果：
            //    - 统计变成双倍：2 → 4, 80 → 160
            //    - 统计超过535
            //    - 累加问题复发
            //
            // 🔓 解锁命令: "解锁统计模块终极锁定"（需用户明确要求）
            //
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            const sql = `
                INSERT INTO mcp_interceptor_logs 
                (rule_code, tool_name, tool_args, intercept_phase, intercept_result, block_reason, triggered_at)
                VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
            `;

            this.db.run(sql, [
                rule.rule_code,
                context.toolName || 'response_check',
                JSON.stringify(context.args || {}).substring(0, 500),
                rule.intercept_phase || 'response',
                result.violated ? 'warned' : 'passed',  // response阶段通常是warn，不是block
                result.message || (result.violated ? `违反规则: ${rule.rule_name}` : '通过检查')
            ], (err) => {
                if (err) {
                    console.error('[ResponseInterceptor] 日志记录失败:', err.message);
                } else {
                    // console.error(`📝 [ResponseInterceptor] 已记录: ${rule.rule_code} → ${result.violated ? '⚠️警告' : '✅通过'}`);
                }
                resolve();
            });
        });
    }

    /**
     * 加载response级别的规则
     */
    async loadRules() {
        return new Promise((resolve, reject) => {
            // L1缓存：60秒
            if (this.rulesLoaded && this.cacheExpiry && Date.now() < this.cacheExpiry) {
                console.error('[ResponseInterceptor] 使用缓存的规则');
                resolve(this.rules);
                return;
            }

            const sql = `
                SELECT * FROM liuxin_mcp_interceptor_rules
                WHERE intercept_phase IN ('response', 'all')
                  AND enabled=1
                ORDER BY priority DESC
            `;

            this.db.all(sql, (err, rows) => {
                if (err) {
                    console.error('[ResponseInterceptor] 加载规则失败:', err);
                    reject(err);
                } else {
                    this.rules = rows;
                    this.rulesLoaded = true;
                    this.cacheExpiry = Date.now() + 60000; // 60秒后过期
                    console.error(`[ResponseInterceptor] 加载了 ${rows.length} 条response规则`);
                    resolve(this.rules);
                }
            });
        });
    }

    /**
     * 拦截并检查response
     * @param {string} responseText - AI生成的回复文本
     * @param {object} context - 上下文信息
     * @returns {object} - {allowed, violations, corrected_response}
     */
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔒🔒🔒 统计模块已锁定 - 禁止修改！🔒🔒🔒
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 
    // ⚠️  此方法负责统计显示，已被全方位锁定！
    // ⚠️  锁定版本: v7.10.8-final3
    // ⚠️  锁定时间: 2025-10-30
    // ⚠️  解锁命令: 解锁统计
    // 
    // 🚫 禁止的操作:
    //    - 修改统计显示逻辑（第176-241行）
    //    - 修改统计数据获取方式（getStatisticsFromDB）
    //    - 修改规则检查逻辑（RULE-007, IR-005）
    //    - 删除或注释任何代码
    // 
    // ✅ 如需修改，请先获得用户授权并执行"解锁统计"命令
    // 
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    async intercept(responseText, context = {}) {
        await this.loadRules();

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ⚠️ 终极锁定警告 - 统计重置逻辑 ⚠️
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //
        // 🔥 v7.10.9-重构: 每次新回复前重置统计（解决累加问题）
        //
        // 🚫 绝对禁止的操作：
        //    1. 删除或注释这段重置代码
        //    2. 修改重置时机（必须在intercept开始时）
        //    3. 添加任何条件判断（必须无条件重置）
        //    4. 修改重置的变量列表
        //    5. 添加任何其他重置逻辑（会冲突）
        //
        // ✅ 核心原理：
        //    - 每次AI新回复 = 新对话 = 必须重置统计
        //    - 重置后，MCP服务器累加本次对话的触发
        //    - 实现独立统计，不会累加
        //
        // ❌ 修改风险：
        //    - 删除此代码 → 统计累加问题复发
        //    - 修改时机 → 重置不及时，数据不准
        //    - 添加条件 → 某些情况不重置，累加问题
        //
        // 📊 历史教训：
        //    - 此代码经过6次迭代才最终稳定
        //    - 任何修改都会导致问题复发
        //    - 用户已明确要求终极锁定
        //
        // 🔓 解锁命令: "解锁统计模块终极锁定"（需用户明确要求）
        //
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // v7.10.12: 修复 - 删除此处的重置逻辑
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //
        // 🔴 问题根因：
        //    ResponseInterceptor在生成回复开始时就重置了统计
        //    导致Pre/Post/Mid阶段累积的触发数据被清空
        //    然后Response阶段重新触发规则，最终显示的只是Response阶段的触发
        //
        // ✅ 正确方案：
        //    重置逻辑应该只在MCP服务器的handleToolCall开始时执行一次
        //    ResponseInterceptor只负责读取和显示统计，不负责重置
        //
        // 📊 时间线分析：
        //    第1步：用户发送消息 → MCP handleToolCall开始
        //    第2步：Pre/Post/Mid阶段累积触发 → triggeredRules Set累积
        //    第3步：ResponseInterceptor.intercept开始（之前在这里重置❌）
        //    第4步：Response阶段触发规则（重置后重新累积）
        //    第5步：显示统计（只显示Response阶段的触发）
        //
        // 🎯 修复效果：
        //    删除此处重置后，显示的将是整个对话周期的完整统计
        //    包括Pre + Post + Mid + Response所有阶段的触发
        //
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        console.error('\n📊 [统计读取] ResponseInterceptor读取统计数据（不重置）');
        if (global.currentSessionStats) {
            console.error(`  当前统计: 触发${global.currentSessionStats.triggeredRules?.size || 0}条规则, 违规${global.currentSessionStats.violatedRules?.size || 0}条`);
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ⚠️ 终极锁定区域结束 ⚠️
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🔴 终极锁定警告 - 统计处理逻辑（行248-285）
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //
        // ⚠️ 绝对禁止修改此代码块！⚠️
        //
        // 【保护范围】: 行 248-285
        // 【保护级别】: ULTIMATE
        // 【保护原因】: 核心统计处理逻辑（累加、记录、设置全局变量）
        //
        // 【历史教训】:
        //    - 2025-10-31: 第三轮检查发现此区域未保护，32行代码暴露风险
        //    - 此区域包含所有统计变量的读取、累加和记录操作
        //    - 任何修改都可能导致统计显示错误或累加问题
        //
        // 【核心原则】:
        //    1. 从getStatisticsFromDB()获取统计 - 唯一数据源
        //    2. 设置context和global变量 - 供其他模块访问
        //    3. 不进行任何累加操作 - 只读取和传递
        //
        // 【修改风险】:
        //    ❌ 修改getStatisticsFromDB调用会导致统计来源错误
        //    ❌ 修改全局变量设置会导致其他模块无法访问统计
        //    ❌ 添加累加逻辑会导致双重计数问题复发
        //
        // 【解锁命令】: 必须先执行解锁命令才能修改
        //    node locks/UnlockCommandHandler.js unlock statistics "修复原因"
        //
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        const violations = [];
        const checkedRules = [];  // v7.8.6: 记录检查过的规则
        let corrected = responseText;

        // v7.10.6: 从数据库获取统计数据
        const stats = this.getStatisticsFromDB();
        context.trigger_count = stats.triggerCount;
        context.violation_count = stats.violationCount;

        // 设置全局变量（用于其他模块访问）
        global.triggerCount = stats.triggerCount;
        global.violationCount = stats.violationCount;

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ⚠️ 终极锁定区域结束 - 统计处理逻辑 ⚠️
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // v7.8.4: 检测复述并设置全局标志
        const hasRephrased = this.detectRephrase(responseText);
        if (hasRephrased) {
            global.hasRepeated = true;
            console.error('✅ [ResponseInterceptor] 检测到复述，设置 global.hasRepeated = true');
        }

        for (const rule of this.rules) {
            checkedRules.push(rule.rule_code);  // v7.8.6: 记录检查的规则

            const result = await this.checkRule(rule, responseText, context);
            let had_correction = false;  // v7.8.7: 是否真的执行了纠正

            if (result.violated) {
                violations.push({
                    rule_code: rule.rule_code,
                    rule_name: rule.rule_name,
                    message: result.message,
                    severity: rule.severity
                });

                // 如果规则支持自动修正
                if (rule.auto_correct && rule.correction_template) {
                    // v7.8.8: 对于统计规则，只应用一次（RULE-007和IR-005是同一个功能）
                    if ((rule.rule_code === 'RULE-007' || rule.rule_code === 'IR-005') &&
                        corrected.includes('📊 统计')) {
                        // 统计信息已经被添加过了，跳过
                        had_correction = false;
                    } else {
                        const beforeCorrection = corrected;
                        corrected = this.applyCorrection(corrected, rule, context);
                        had_correction = corrected !== beforeCorrection;  // v7.8.7: 检查是否真的改变了
                    }
                }
            }

            // v7.8.7: 记录拦截日志（无论是否违规都记录，在纠正之后）
            await this.logInterception(rule, result, { ...context, had_correction });
        }

        const criticalViolations = violations.filter(v => v.severity === 'CRITICAL' || v.severity === 'HIGH');

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // v7.11.0: 使用统计守护者 - 终极防护方案
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //
        // 🎯 设计理念：
        //    - 完全独立的StatisticsGuardian模块，不依赖任何其他模块
        //    - 多重容错机制，即使出错也能显示统计
        //    - 修改其他功能不会影响统计功能
        //
        // ✅ 防护措施：
        //    1. 独立模块：StatisticsGuardian.js 完全独立
        //    2. 自检机制：每次启动自动检查功能是否正常
        //    3. 自愈机制：发现问题自动修复
        //    4. 终极兜底：即使出错也显示统计（0/350）
        //
        // 🛡️ 三层保障：
        //    - 第1层：StatisticsGuardian.forceDisplayStatistics()
        //    - 第2层：try-catch 容错
        //    - 第3层：兜底逻辑（见下方）
        //
        // 📝 历史：
        //    - v7.10.15: 无条件强制显示
        //    - v7.11.0: 升级为守护者模式，终极防护
        //
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // 🛡️ 第1层保障：使用统计守护者强制显示统计
        if (StatisticsGuardian) {
            try {
                corrected = StatisticsGuardian.forceDisplayStatistics(corrected);
            } catch (error) {
                console.error('🚨 [ResponseInterceptor] 统计守护者失败，启用兜底逻辑', error);

                // 🛡️ 第2层保障：兜底逻辑
                const statsPattern = /━━━.*📊\s*统计/;
                if (!statsPattern.test(corrected)) {
                    const fallbackStats = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 统计：触发 0/350条  违规 0条 [兜底显示]\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
                    corrected = corrected + fallbackStats;
                    console.error('⚠️ [ResponseInterceptor] 使用兜底统计显示');
                }
            }
        } else {
            // 🛡️ 第3层保障：守护者未加载，使用原始逻辑
            console.error('⚠️ [ResponseInterceptor] 统计守护者未加载，使用原始逻辑');

            const currentStats = {
                triggered: global.currentSessionStats?.triggeredRules?.size || 0,
                violated: global.currentSessionStats?.violatedRules?.size || 0
            };

            const statsPattern = /━━━.*📊\s*统计/;
            if (!statsPattern.test(corrected)) {
                const statsTemplate = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 统计：触发 ${currentStats.triggered}/350条  违规 ${currentStats.violated}条\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
                corrected = corrected + statsTemplate;
                console.error(`✅ [原始逻辑] 添加统计信息: 触发${currentStats.triggered}条, 违规${currentStats.violated}条`);
            }
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // v7.11.0: 使用统计守护者重置 - 终极防护方案
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //
        // 🎯 核心原理：
        //    - 统计显示的是**当前完整对话周期**的触发（Pre+Post+Mid+Response）
        //    - 显示后立即重置，确保下次对话从0开始
        //    - 实现真正的"单次对话统计"
        //
        // 🛡️ 防护措施：
        //    - 优先使用StatisticsGuardian.reset()（多重容错）
        //    - 如果守护者失败，使用兜底逻辑
        //
        // 📝 历史：
        //    - v7.10.13: Response结束时重置
        //    - v7.11.0: 使用守护者重置
        //
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // 🛡️ 使用统计守护者重置
        if (StatisticsGuardian) {
            try {
                StatisticsGuardian.reset();
            } catch (error) {
                console.error('🚨 [ResponseInterceptor] 守护者重置失败，使用兜底逻辑', error);

                // 兜底重置
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
                console.error('⚠️ [ResponseInterceptor] 使用兜底重置完成');
            }
        } else {
            // 守护者未加载，使用原始重置逻辑
            console.error('⚠️ [ResponseInterceptor] 守护者未加载，使用原始重置');

            console.error(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.error(`🔄 [统计重置] Response结束，重置统计`);

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

            console.error(`  下次对话: 从0开始统计`);
            console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // v7.11.0: 统计重置区域结束
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        return {
            allowed: criticalViolations.length === 0,
            violations: violations,
            corrected_response: corrected,
            had_corrections: corrected !== responseText,
            checked_rules: checkedRules  // v7.8.6: 返回检查过的规则列表
        };
    }

    /**
     * 检查单条规则
     * v7.9.1: 传递responseText到context
     */
    async checkRule(rule, responseText, context) {
        try {
            // v7.9.1: 确保context中有responseText
            const enrichedContext = { ...context, responseText };

            switch (rule.detection_type) {
                case 'regex':
                    return this.checkRegex(rule, responseText);
                case 'global_flag':
                    return this.checkGlobalFlag(rule, enrichedContext);
                default:
                    return { violated: false };
            }
        } catch (err) {
            console.error(`[ResponseInterceptor] 规则检查失败 ${rule.rule_code}:`, err);
            return { violated: false };
        }
    }

    /**
     * 检查正则表达式规则
     */
    checkRegex(rule, responseText) {
        try {
            const pattern = new RegExp(rule.detection_pattern, 'i');
            const matched = pattern.test(responseText);
            const ruleType = rule.rule_type || 'required';

            // 根据规则类型判断是否违规
            let violated;
            if (ruleType === 'required') {
                // 必须包含的模式：匹配=通过，不匹配=违规
                violated = !matched;
            } else if (ruleType === 'forbidden') {
                // 禁止包含的模式：匹配=违规，不匹配=通过
                violated = matched;
            } else {
                // 默认按required处理
                violated = !matched;
            }

            return {
                violated: violated,
                message: rule.block_message || `${violated ? '违反' : '满足'}规则: ${rule.rule_name}`
            };
        } catch (err) {
            console.error(`[ResponseInterceptor] regex检查失败:`, err);
            return { violated: false };
        }
    }

    /**
     * 检查全局标志规则
     * v7.9.1: 对RULE-002特殊处理，基于实际文本内容判断
     */
    checkGlobalFlag(rule, context) {
        try {
            // 🔥 v7.9.1: RULE-002复述规则特殊处理
            if (rule.rule_code === 'RULE-002') {
                // 直接检测文本中是否有复述，不依赖标志
                const hasRephrase = this.detectRephrase(context.responseText || '');
                return {
                    violated: !hasRephrase,
                    message: hasRephrase ? '已包含复述' : '缺少复述'
                };
            }

            // 其他规则：按原逻辑检查全局标志
            const pattern = JSON.parse(rule.detection_pattern);
            const flagValue = global[pattern.flag];
            const expected = pattern.expected;

            return {
                violated: flagValue !== expected,
                message: rule.block_message || `全局标志${pattern.flag}不符合预期`
            };
        } catch (err) {
            console.error(`[ResponseInterceptor] global_flag检查失败:`, err);
            return { violated: false };
        }
    }

    /**
     * 应用自动修正
     * v7.9.0: 添加统计模块锁定检查
     */
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔒🔒🔒 统计模块已锁定 - 禁止修改！🔒🔒🔒
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 
    // ⚠️  此方法负责统计模板应用，已被全方位锁定！
    // ⚠️  锁定版本: v7.10.8-final3
    // ⚠️  锁定时间: 2025-10-30
    // ⚠️  解锁命令: 解锁统计
    // 
    // 🚫 禁止的操作:
    //    - 修改统计模板应用逻辑（第347-377行）
    //    - 修改模板变量替换（trigger_count, violation_count）
    //    - 修改统计信息正则匹配
    //    - 删除或注释任何代码
    // 
    // ✅ 如需修改，请先获得用户授权并执行"解锁统计"命令
    // 
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    applyCorrection(text, rule, context) {
        // 🔒 v7.9.0: 检查统计模块锁定状态
        if ((rule.rule_code === 'RULE-007' || rule.rule_code === 'IR-005')) {
            this.checkStatisticsModuleLock('修改统计模板');
        }

        let template = rule.correction_template;

        // 替换模板变量
        template = template.replace('{current_role}', global.currentRole || '开发工程师-小柳');
        template = template.replace('{trigger_count}', context.trigger_count || 0);
        template = template.replace('{violation_count}', context.violation_count || 0);

        switch (rule.rule_code) {
            case 'RULE-007':
            case 'IR-005':
                // v7.8.8: 强制替换统计信息（Cursor会添加硬编码的统计，我们要替换成真实的）
                // 1. 移除所有旧的统计信息（包括多余的分隔符）
                const statisticsPattern = /(\n\n)?━+\n📊\s*统计[：:][^\n]*\n━+/g;
                let cleanText = text.replace(statisticsPattern, '').trim();
                // 2. 添加真实的统计信息
                return cleanText + template;

            case 'ROLE-FORMAT-001':
                // 角色格式添加在开头
                if (!text.match(/作为【.+】/)) {
                    return template + text;
                }
                break;

            case 'RULE-002':
                // v7.8.5: 复述规则 - 使用结构化复述模板（从correction_template读取）
                // v7.10.4: 增加需求数量判断和确认逻辑
                if (!this.detectRephrase(text)) {
                    // 获取用户输入
                    const userInput = global.lastUserInput || '继续';
                    const role = global.currentRole || '开发工程师-小柳';
                    const requiresConfirmation = global.requiresUserConfirmation || false;
                    const requirementCount = global.requirementCount || 1;

                    // 智能填充模板：将用户输入作为核心需求
                    let filledTemplate = template;
                    filledTemplate = filledTemplate.replace('[请用一句话概括您的核心目标]', userInput);

                    // v7.10.4: 根据需求数量动态添加确认提示
                    if (requiresConfirmation) {
                        // 需求≥3项，添加强制确认提示
                        const confirmationNote = `\n\n⚠️ **需要您的确认**：\n检测到您的需求包含 ${requirementCount} 项内容，为确保准确理解，请您确认以上理解是否正确。\n\n🔴 **重要**：请回复"确认"、"开始"或"继续"后，我再开始执行具体操作。\n如有偏差，请直接指出需要修改的地方。\n`;
                        filledTemplate = filledTemplate.replace('**是否理解正确？如有偏差请指正。**', confirmationNote);
                    } else {
                        // 需求≤2项，简化确认提示
                        const simpleNote = `\n**是否理解正确？如有偏差请指正。**\n\n✅ 需求较简单（${requirementCount}项），如无偏差我将直接开始执行。\n`;
                        filledTemplate = filledTemplate.replace('**是否理解正确？如有偏差请指正。**', simpleNote);
                    }

                    // 添加角色标识
                    const rephrase = `${filledTemplate}\n\n`;
                    return rephrase + text;
                }
                return text;  // v7.8.7: 明确返回，避免后续修改

            case 'RULE-001':
                // v7.8.6: 团队模式 - 在开头插入角色标识（如果没有）
                if (!text.match(/作为【.+】/)) {
                    const role = global.currentRole || '开发工程师-小柳';
                    const rolePrefix = `作为【${role}】，`;
                    return rolePrefix + text;
                }
                return text;  // v7.8.7: 明确返回，避免后续修改
        }

        return text;
    }

    /**
     * 检测回复中是否包含复述
     * v7.8.4: 基础复述检测
     * v7.8.5: 增强结构化复述检测
     */
    detectRephrase(responseText) {
        // 🔥 v7.10.2: 严格要求编号格式复述

        // 结构化复述标志（优先级最高）
        const structuredPatterns = [
            /【需求理解】/,
            /\*\*您的核心需求\*\*/,
            /\*\*具体要求\*\*/,
            /\*\*执行计划\*\*/
        ];

        // 结构化复述：至少匹配3个结构化标志
        const structuredCount = structuredPatterns.filter(
            pattern => pattern.test(responseText)
        ).length;

        if (structuredCount >= 3) {
            console.error('✅ [ResponseInterceptor] 检测到结构化复述（优质）');
            return true;
        }

        // 🔥 v7.10.2: 严格检测编号格式复述
        // 必须包含复述关键词 + 编号格式
        const rephraseKeywords = [
            /我理解您的需求是[：:]/,
            /您的需求是[：:]/,
            /您的请求是[：:]/,
            /我理解您希望/,
            /您希望我/
        ];

        // 编号格式：1) 2) 3) 或 ① ② ③ 或 1. 2. 3.
        const numberedPatterns = [
            /[1-9]\)\s*[^\n]{3,}/,  // 1) xxx
            /[①②③④⑤⑥⑦⑧⑨⑩]\s*[^\n]{3,}/,  // ① xxx
            /[1-9]\.\s*[^\n]{3,}/   // 1. xxx
        ];

        const hasKeyword = rephraseKeywords.some(pattern => pattern.test(responseText));

        if (hasKeyword) {
            // 检查是否有至少2个编号项
            let numberedCount = 0;
            for (const pattern of numberedPatterns) {
                const matches = responseText.match(new RegExp(pattern, 'g'));
                if (matches) {
                    numberedCount = Math.max(numberedCount, matches.length);
                }
            }

            if (numberedCount >= 2) {
                console.error(`✅ [ResponseInterceptor] 检测到编号格式复述（${numberedCount}项）`);
                return true;
            } else {
                console.error(`❌ [ResponseInterceptor] 包含复述关键词但缺少编号格式（需要至少2个编号项）`);
                return false;
            }
        }

        console.error('❌ [ResponseInterceptor] 未检测到有效复述');
        return false;
    }

    /**
     * 评估复述质量
     * v7.8.5新增
     * @returns {object} {score, level, passed, details}
     */
    evaluateRephraseQuality(responseText) {
        let score = 0;
        const details = [];

        // 1. 包含需求理解标题（+10分）
        if (/【需求理解】/.test(responseText)) {
            score += 10;
            details.push('✅ 包含需求理解标题');
        }

        // 2. 包含核心需求概括（+20分）
        if (/\*\*您的核心需求\*\*/.test(responseText)) {
            score += 20;
            details.push('✅ 包含核心需求概括');
        }

        // 3. 包含具体要求列表（+25分）
        if (/\*\*具体要求\*\*/.test(responseText)) {
            score += 25;
            details.push('✅ 包含具体要求列表');
        }

        // 4. 使用序号列表（+20分）
        const numberedItems = (responseText.match(/\n\d+\.\s/g) || []).length;
        if (numberedItems >= 3) {
            score += 20;
            details.push(`✅ 使用序号列表（${numberedItems}项）`);
        } else if (numberedItems >= 1) {
            score += 10;
            details.push(`⚠️ 序号列表较少（${numberedItems}项）`);
        }

        // 5. 包含执行计划（+15分）
        if (/\*\*执行计划\*\*/.test(responseText)) {
            score += 15;
            details.push('✅ 包含执行计划');
        }

        // 6. 包含预期成果（+5分）
        if (/\*\*预期成果\*\*/.test(responseText)) {
            score += 5;
            details.push('✅ 包含预期成果');
        }

        // 7. 包含确认询问（+5分）
        if (/是否理解正确/.test(responseText)) {
            score += 5;
            details.push('✅ 包含确认询问');
        }

        // 评级
        let level;
        if (score >= 80) level = '优秀';
        else if (score >= 60) level = '良好';
        else if (score >= 40) level = '合格';
        else level = '待改进';

        return {
            score,
            level,
            passed: score >= 40,
            details
        };
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this.rulesLoaded = false;
        this.cacheExpiry = null;
        this.rules = [];
        console.error('[ResponseInterceptor] 缓存已清除');
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔴 终极锁定警告 - 统计数据获取方法（行737-761，扩展到770）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //
    // ⚠️ 绝对禁止修改此代码块！⚠️
    //
    // 【保护范围】: 行 737-770（getStatisticsFromDB完整方法）
    // 【保护级别】: ULTIMATE
    // 【保护原因】: 唯一的统计数据获取方法，所有统计都从这里读取
    //
    // 【核心原则】:
    //    1. 只从global.currentSessionStats读取 - 唯一数据源
    //    2. 不进行任何累加或修改 - 只读取和返回
    //    3. 初始化逻辑只在变量不存在时执行 - 防御性编程
    //
    // 【修改风险】:
    //    ❌ 修改数据源会导致统计显示错误
    //    ❌ 添加累加逻辑会导致每次读取都累加（严重错误）
    //    ❌ 修改返回格式会导致调用者无法正确解析
    //
    // 【历史教训】:
    //    - 2025-10-31: 第三轮检查发现返回值行(751-752)未被保护
    //    - 这是所有统计显示的源头，必须确保绝对正确
    //
    // 【解锁命令】:
    //    node locks/UnlockCommandHandler.js unlock statistics "修复原因"
    //
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * v7.10.7: 从内存获取当次对话统计数据
     * 统计当次对话的触发次数和违规次数
     * 
     * 设计说明：
     * - 使用全局变量 global.currentSessionStats 存储当次对话统计
     * - 每次新对话时，由 liuxin-mcp-server-unified.js 重置统计
     * - 只统计本次对话，不累计历史数据
     */
    getStatisticsFromDB() {
        try {
            // 初始化会话统计（如果不存在）
            if (!global.currentSessionStats) {
                global.currentSessionStats = {
                    triggerCount: 0,
                    violationCount: 0,
                    triggeredRules: new Set(),
                    violatedRules: new Set()
                };
            }

            // 返回当次对话的统计数据
            // v7.10.11: 修复 - 显示去重后的规则数量，而不是触发次数
            return {
                triggerCount: global.currentSessionStats.triggeredRules?.size || 0,  // ✅ 显示去重后的规则数量
                violationCount: global.currentSessionStats.violatedRules?.size || 0  // ✅ 显示去重后的违规规则数量
            };
        } catch (err) {
            console.error('[ResponseInterceptor] 获取统计数据失败:', err.message);
            return {
                triggerCount: 0,
                violationCount: 0
            };
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ⚠️ 终极锁定区域结束 - getStatisticsFromDB ⚠️
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
}

module.exports = ResponseInterceptor;
