#!/usr/bin/env node
// ====================================================================
// 自动违规检查器 v2.0 (Auto Violation Checker V2) - MCP工具
// ====================================================================
// 版本: v7.4.4
// 功能: 使用正则表达式引擎进行违规检测
// 目标准确率: 95%+
// 作者: 开发工程师-小柳
// 创建时间: 2025-10-24
// ====================================================================

const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class AutoViolationCheckerV2 {
    constructor() {
        this.serverUrl = process.env.LIUXIN_SERVER_URL || 'localhost';
        this.serverPort = process.env.LIUXIN_SERVER_PORT || 3002;
        this.dbPath = path.join(__dirname, '..', 'liuxin.db');
        this.db = null;
        this.isServerRunning = false;

        // 本地缓存的规则
        this.cachedRules = null;
    }

    // 初始化数据库
    initDB() {
        if (!this.db) {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('[违规检查v2] 数据库连接失败:', err.message);
                } else {
                    console.log('[违规检查v2] 数据库连接成功');
                }
            });
        }
    }

    // 检查服务器是否运行
    async checkServer() {
        return new Promise((resolve) => {
            const req = http.request({
                hostname: this.serverUrl,
                port: this.serverPort,
                path: '/health',
                method: 'GET',
                timeout: 2000
            }, (res) => {
                this.isServerRunning = (res.statusCode === 200);
                resolve(this.isServerRunning);
            });

            req.on('error', () => {
                this.isServerRunning = false;
                resolve(false);
            });

            req.on('timeout', () => {
                req.destroy();
                this.isServerRunning = false;
                resolve(false);
            });

            req.end();
        });
    }

    // 主处理函数
    async handler(args) {
        try {
            const { action, text, context } = args;

            // 检查服务器状态
            const serverRunning = await this.checkServer();

            switch (action) {
                case 'check':
                    return await this.checkViolations(text, context, serverRunning);

                case 'check_response':
                    return await this.checkResponse(text, serverRunning);

                case 'get_rules':
                    return await this.getViolationRules(serverRunning);

                default:
                    return {
                        success: false,
                        error: `未知操作: ${action}`,
                        valid_actions: ['check', 'check_response', 'get_rules']
                    };
            }
        } catch (error) {
            console.error('[违规检查v2] 处理错误:', error.message);
            return {
                success: false,
                error: error.message,
                stack: error.stack
            };
        }
    }

    // 检查违规（主要方法）
    async checkViolations(text, context = {}, serverRunning) {
        if (!text || text.length === 0) {
            return {
                success: true,
                violations: [],
                violation_count: 0,
                message: '文本为空，无需检查'
            };
        }

        // 使用本地检测（v2引擎）
        return await this.checkLocalViolations(text, context);
    }

    // 本地违规检测 (v2引擎)
    async checkLocalViolations(text, context = {}) {
        this.initDB();

        // 加载规则（v2版本）- 强制每次重新加载避免缓存问题
        this.cachedRules = await this.loadRulesFromDBV2();

        const violations = [];

        // 检查每条规则
        for (const rule of this.cachedRules) {
            const violation = await this.checkRuleV2(text, rule);
            if (violation) {
                violations.push({
                    rule_name: rule.rule_name,
                    violation_type: rule.violation_type,
                    severity: rule.severity,
                    description: rule.description,
                    detection_type: rule.detection_type,
                    matched_pattern: violation.matched_pattern || null,
                    matched_text: violation.matched_text || null
                });
            }
        }

        return {
            success: true,
            source: 'local_v2',
            engine_version: '2.0',
            violations: violations,
            violation_count: violations.length,
            checked_rules: this.cachedRules.length,
            note: '使用v2.0正则引擎检测'
        };
    }

    // 从数据库加载规则 (v2版本)
    loadRulesFromDBV2() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM violation_detection_config_v2 
                WHERE enabled = 1 
                ORDER BY priority DESC
            `, [], (err, rows) => {
                if (err) {
                    console.error('[违规检查v2] 加载规则失败:', err.message);
                    resolve([]);
                } else {
                    console.log(`[违规检查v2] 加载了${rows.length}条v2规则`);
                    resolve(rows || []);
                }
            });
        });
    }

    // 检查单条规则 (v2引擎 - 支持正则)
    async checkRuleV2(text, rule) {
        const { detection_type, detection_pattern, detection_keywords, threshold } = rule;

        switch (detection_type) {
            case 'regex_match':
                // 正则匹配 = 违规
                return this.checkRegexMatch(text, detection_pattern);

            case 'regex_not_match':
                // 正则不匹配 = 违规
                return this.checkRegexNotMatch(text, detection_pattern);

            case 'keyword_weight':
                // 关键词权重匹配（兼容旧系统）
                return this.checkKeywordWeight(text, detection_keywords, threshold);

            default:
                console.warn(`[违规检查v2] 未知检测类型: ${detection_type}`);
                return null;
        }
    }

    // 正则匹配检测
    checkRegexMatch(text, pattern) {
        if (!pattern) return null;

        try {
            const regex = new RegExp(pattern, 'gi');
            const matches = text.match(regex);

            if (matches && matches.length > 0) {
                return {
                    matched: true,
                    matched_pattern: pattern,
                    matched_text: matches[0],
                    match_count: matches.length
                };
            }

            return null;
        } catch (err) {
            console.error('[违规检查v2] 正则表达式错误:', err.message);
            return null;
        }
    }

    // 正则不匹配检测
    checkRegexNotMatch(text, pattern) {
        if (!pattern) return null;

        try {
            const regex = new RegExp(pattern, 'gi');
            const matches = text.match(regex);

            // 如果不匹配，则违规
            if (!matches || matches.length === 0) {
                return {
                    matched: true,
                    matched_pattern: pattern,
                    matched_text: null,
                    reason: '缺少必需格式'
                };
            }

            return null;
        } catch (err) {
            console.error('[违规检查v2] 正则表达式错误:', err.message);
            return null;
        }
    }

    // 关键词权重检测（兼容旧系统）
    checkKeywordWeight(text, keywords, threshold) {
        if (!keywords) return null;

        const keywordList = keywords.split(',').map(k => k.trim());
        let totalWeight = 0;
        const matched = [];

        for (const keyword of keywordList) {
            try {
                const regex = new RegExp(keyword, 'gi');
                const matches = text.match(regex);

                if (matches) {
                    matched.push({
                        keyword: keyword,
                        count: matches.length
                    });
                    totalWeight += matches.length;
                }
            } catch (err) {
                console.error('[违规检查v2] 关键词匹配错误:', err.message);
            }
        }

        if (totalWeight >= (threshold || 1.0)) {
            return {
                matched: true,
                total_weight: totalWeight,
                matched_keywords: matched
            };
        }

        return null;
    }

    // 检查AI回复
    async checkResponse(text, serverRunning) {
        const result = await this.checkViolations(text, { type: 'ai_response' }, serverRunning);

        // 添加建议
        if (result.violations && result.violations.length > 0) {
            result.formatted_violations = this.formatViolations(result.violations);
        }

        return result;
    }

    // 格式化违规信息
    formatViolations(violations) {
        const lines = ['⚠️  检测到违规行为：'];

        violations.forEach((v, i) => {
            lines.push(`\n${i + 1}. [${v.severity}] ${v.rule_name}`);
            lines.push(`   类型: ${v.violation_type}`);
            lines.push(`   说明: ${v.description}`);
            lines.push(`   检测方式: ${v.detection_type}`);
            if (v.matched_text) {
                lines.push(`   匹配文本: ${v.matched_text}`);
            }
        });

        return lines.join('\n');
    }

    // 获取违规规则列表
    async getViolationRules(serverRunning) {
        // 本地获取
        this.initDB();
        if (!this.cachedRules) {
            this.cachedRules = await this.loadRulesFromDBV2();
        }

        return {
            success: true,
            source: 'local_v2',
            engine_version: '2.0',
            rules: this.cachedRules.map(r => ({
                rule_name: r.rule_name,
                violation_type: r.violation_type,
                detection_type: r.detection_type,
                severity: r.severity,
                description: r.description
            })),
            total: this.cachedRules.length,
            note: '使用v2.0规则'
        };
    }

    // 关闭数据库
    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('[违规检查v2] 关闭数据库失败:', err.message);
                } else {
                    console.log('[违规检查v2] 数据库已关闭');
                }
            });
        }
    }
}

// 导出单例
const checker = new AutoViolationCheckerV2();

module.exports = {
    handler: async (args) => {
        return await checker.handler(args);
    },
    close: () => {
        checker.close();
    }
};

// 如果直接运行（测试用）
if (require.main === module) {
    (async () => {
        console.log('🧪 自动违规检查器v2.0测试...\n');

        // 测试1: 检查正常文本
        console.log('测试1: 检查正常文本（包含角色格式）');
        const result1 = await checker.handler({
            action: 'check',
            text: '作为开发工程师-小柳，我已经完成了系统升级。\n\n📊 统计：触发 8/393条  违规 0条',
            context: {}
        });
        console.log(JSON.stringify(result1, null, 2));

        // 测试2: 检测缺少角色格式
        console.log('\n测试2: 检测缺少角色格式');
        const result2 = await checker.handler({
            action: 'check',
            text: '我来分析一下这个问题。根据系统情况，我建议采用方案A。\n\n📊 统计：触发 12条  违规 0条',
            context: {}
        });
        console.log(JSON.stringify(result2, null, 2));

        // 测试3: 检测虚构统计数字
        console.log('\n测试3: 检测虚构统计数字');
        const result3 = await checker.handler({
            action: 'check',
            text: '作为开发工程师-小柳，我已经完成了任务。本次大约触发了15条规则。',
            context: {}
        });
        console.log(JSON.stringify(result3, null, 2));

        // 测试4: 检测DELETE SQL命令
        console.log('\n测试4: 检测DELETE SQL命令');
        const result4 = await checker.handler({
            action: 'check',
            text: '作为开发工程师-小柳，我来清理数据库。\n\nDELETE FROM conversation_context_memory;\nDELETE FROM dialog_logs;',
            context: {}
        });
        console.log(JSON.stringify(result4, null, 2));

        // 关闭
        checker.close();
    })();
}

