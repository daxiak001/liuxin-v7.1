#!/usr/bin/env node
// ====================================================================
// 违规检测系统 (Violation Detector)
// ====================================================================
// 版本: v7.1+ (策略A+整合)
// 功能: 从对话中检测违规行为,提供修复建议
// 架构: 本地SQLite数据库查询
// 作者: 小柳(开发工程师)
// 创建时间: 2025-10-20
// ====================================================================

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class ViolationDetector {
    constructor() {
        // 数据库路径(使用data DB,包含违规检测表)
        this.dataDbPath = process.env.XIAOLIU_DATA_DB_PATH ||
            path.join(__dirname, '../data/liuxin.db');

        this.db = null;
    }

    // 初始化数据库连接
    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dataDbPath, (err) => {
                if (err) {
                    console.error('[违规检测] 数据库连接失败:', err.message);
                    reject(err);
                } else {
                    console.log('[违规检测] 数据库连接成功:', this.dataDbPath);
                    resolve();
                }
            });
        });
    }

    // 主处理函数
    async handler(args) {
        try {
            const { action, text, context } = args;

            // 初始化数据库(如果未初始化)
            if (!this.db) {
                await this.initialize();
            }

            switch (action) {
                case 'detect':
                    return await this.detectViolations(text, context);

                case 'get_rules':
                    return await this.getViolationRules();

                case 'get_stats':
                    return await this.getViolationStats();

                default:
                    return {
                        success: false,
                        error: `未知操作: ${action}`,
                        valid_actions: ['detect', 'get_rules', 'get_stats']
                    };
            }
        } catch (error) {
            console.error('[违规检测] 处理错误:', error.message);
            return {
                success: false,
                error: error.message,
                stack: error.stack
            };
        }
    }

    // 检测违规行为
    async detectViolations(text, context = {}) {
        try {
            console.log('[违规检测] 开始检测...');
            console.log('[违规检测] 文本长度:', text.length);

            // 1. 加载启用的违规规则
            const rules = await this._loadEnabledRules();
            console.log('[违规检测] 加载规则数:', rules.length);

            // 2. 加载关键词权重
            const keywords = await this._loadKeywordWeights();
            console.log('[违规检测] 加载关键词数:', keywords.length);

            // 3. 检查白名单
            const whitelist = await this._loadWhitelist();
            console.log('[违规检测] 加载白名单数:', whitelist.length);

            // 4. 逐个规则检查
            const violations = [];
            for (const rule of rules) {
                const violation = await this._checkViolation(text, rule, keywords, whitelist);
                if (violation) {
                    // 获取修复建议
                    const fix = await this._getFixTemplate(rule.violation_type);
                    violations.push({
                        rule_id: rule.id,
                        rule_name: rule.rule_name,
                        violation_type: rule.violation_type,
                        severity: rule.severity,
                        description: rule.description,
                        fix_template: fix,
                        matched_keywords: violation.matched_keywords
                    });
                }
            }

            console.log('[违规检测] 检测完成,发现违规:', violations.length);

            return {
                success: true,
                blocked: violations.length > 0,
                violation_count: violations.length,
                violations: violations,
                suggestions: violations.map(v => v.fix_template),
                severity_levels: this._groupBySeverity(violations)
            };
        } catch (error) {
            console.error('[违规检测] 检测失败:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 加载启用的违规规则
    async _loadEnabledRules() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM violation_detection_config 
                WHERE enabled = 1
                ORDER BY priority DESC
            `, [], (err, rows) => {
                if (err) {
                    console.error('[违规检测] 加载规则失败:', err.message);
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    // 加载关键词权重
    async _loadKeywordWeights() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM violation_keyword_weights
                ORDER BY weight DESC
            `, [], (err, rows) => {
                if (err) {
                    console.error('[违规检测] 加载关键词失败:', err.message);
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    // 加载白名单
    async _loadWhitelist() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM violation_whitelist
                WHERE enabled = 1
            `, [], (err, rows) => {
                if (err) {
                    console.error('[违规检测] 加载白名单失败:', err.message);
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    // 检查单个违规规则
    async _checkViolation(text, rule, keywords, whitelist) {
        try {
            // 1. 检查白名单(如果匹配白名单,跳过检查)
            for (const whiteItem of whitelist) {
                if (whiteItem.pattern_type === 'regex') {
                    const regex = new RegExp(whiteItem.pattern, 'gi');
                    if (regex.test(text)) {
                        console.log(`[违规检测] 命中白名单: ${whiteItem.description}`);
                        return null;
                    }
                } else if (whiteItem.pattern_type === 'keyword') {
                    if (text.includes(whiteItem.pattern)) {
                        console.log(`[违规检测] 命中白名单: ${whiteItem.description}`);
                        return null;
                    }
                }
            }

            // 2. 检查规则关键词
            const matched_keywords = [];
            let totalWeight = 0;

            // 从规则的detection_keywords中提取关键词
            if (rule.detection_keywords) {
                const ruleKeywords = rule.detection_keywords.split(',').map(k => k.trim());

                for (const keyword of ruleKeywords) {
                    // 查找关键词权重
                    const keywordWeight = keywords.find(k =>
                        k.keyword === keyword && k.violation_type === rule.violation_type
                    );

                    const weight = keywordWeight ? keywordWeight.weight : 1.0;

                    // 正则匹配
                    const regex = new RegExp(keyword, 'gi');
                    const matches = text.match(regex);

                    if (matches) {
                        matched_keywords.push({
                            keyword: keyword,
                            count: matches.length,
                            weight: weight
                        });
                        totalWeight += matches.length * weight;
                    }
                }
            }

            // 3. 判断是否超过阈值
            if (totalWeight >= (rule.threshold || 1.0)) {
                console.log(`[违规检测] 检测到违规: ${rule.rule_name}, 权重: ${totalWeight}`);
                return {
                    matched_keywords: matched_keywords,
                    total_weight: totalWeight
                };
            }

            return null;
        } catch (error) {
            console.error('[违规检测] 检查规则失败:', error.message);
            return null;
        }
    }

    // 获取修复模板
    async _getFixTemplate(violationType) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT * FROM violation_fix_templates
                WHERE violation_type = ?
                ORDER BY priority DESC
                LIMIT 1
            `, [violationType], (err, row) => {
                if (err) {
                    console.error('[违规检测] 获取修复模板失败:', err.message);
                    reject(err);
                } else if (row) {
                    resolve({
                        template: row.fix_template,
                        example: row.example_before_after,
                        explanation: row.explanation
                    });
                } else {
                    resolve({
                        template: '请根据规则要求修改',
                        example: '',
                        explanation: '未找到具体修复模板'
                    });
                }
            });
        });
    }

    // 按严重程度分组
    _groupBySeverity(violations) {
        const groups = {
            critical: [],
            high: [],
            medium: [],
            low: []
        };

        for (const violation of violations) {
            const severity = violation.severity || 'medium';
            if (groups[severity]) {
                groups[severity].push(violation.rule_name);
            }
        }

        return groups;
    }

    // 获取违规规则列表
    async getViolationRules() {
        try {
            const rules = await this._loadEnabledRules();

            return {
                success: true,
                total_rules: rules.length,
                rules: rules.map(r => ({
                    id: r.id,
                    name: r.rule_name,
                    type: r.violation_type,
                    severity: r.severity,
                    description: r.description,
                    keywords: r.detection_keywords,
                    threshold: r.threshold
                })),
                by_type: this._groupByType(rules),
                by_severity: this._groupBySeverityCount(rules)
            };
        } catch (error) {
            console.error('[违规检测] 获取规则失败:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 按类型分组规则
    _groupByType(rules) {
        const groups = {};
        for (const rule of rules) {
            if (!groups[rule.violation_type]) {
                groups[rule.violation_type] = 0;
            }
            groups[rule.violation_type]++;
        }
        return groups;
    }

    // 按严重程度统计规则数量
    _groupBySeverityCount(rules) {
        const groups = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0
        };
        for (const rule of rules) {
            const severity = rule.severity || 'medium';
            if (groups[severity] !== undefined) {
                groups[severity]++;
            }
        }
        return groups;
    }

    // 获取违规统计
    async getViolationStats() {
        try {
            // 注意: 这里假设有一个violations_log表来存储历史违规记录
            // 如果data DB中没有这个表,则返回基本统计

            return new Promise((resolve, reject) => {
                this.db.get(`
                    SELECT 
                        COUNT(*) as total_detections,
                        SUM(CASE WHEN blocked = 1 THEN 1 ELSE 0 END) as blocked_count
                    FROM violations_log
                    WHERE created_at >= datetime('now', '-30 days')
                `, [], (err, row) => {
                    if (err) {
                        // 表不存在,返回基本信息
                        resolve({
                            success: true,
                            message: '违规日志表不存在,返回基本统计',
                            total_rules: 0,
                            recent_detections: 0
                        });
                    } else {
                        resolve({
                            success: true,
                            total_detections: row.total_detections || 0,
                            blocked_count: row.blocked_count || 0,
                            pass_rate: row.total_detections > 0 ?
                                (1 - row.blocked_count / row.total_detections) * 100 : 100
                        });
                    }
                });
            });
        } catch (error) {
            console.error('[违规检测] 获取统计失败:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 关闭数据库连接
    async close() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        console.error('[违规检测] 关闭数据库失败:', err.message);
                    } else {
                        console.log('[违规检测] 数据库连接已关闭');
                    }
                    resolve();
                });
            });
        }
    }
}

// 导出单例
const detector = new ViolationDetector();

module.exports = {
    handler: async (args) => {
        return await detector.handler(args);
    },
    close: async () => {
        return await detector.close();
    }
};

// 如果直接运行(测试用)
if (require.main === module) {
    (async () => {
        console.log('🧪 违规检测系统测试...\n');

        // 测试1: 检测违规
        const result1 = await detector.handler({
            action: 'detect',
            text: '我不使用团队模式,直接回复用户',
            context: {}
        });
        console.log('测试1结果:', JSON.stringify(result1, null, 2));

        // 测试2: 获取规则列表
        const result2 = await detector.handler({
            action: 'get_rules'
        });
        console.log('\n测试2结果:', JSON.stringify(result2, null, 2));

        // 关闭连接
        await detector.close();
    })();
}

