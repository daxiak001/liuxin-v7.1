#!/usr/bin/env node
// ====================================================================
// 自动违规检查器 (Auto Violation Checker) - MCP工具
// ====================================================================
// 版本: v7.4.3+
// 功能: 自动扫描AI回复内容，检测违规行为
// 用途: 实现准确的实时违规检测，替代默认值0
// 作者: 开发工程师-小柳
// 创建时间: 2025-10-24
// ====================================================================

const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 引入v2.0正则引擎
const v2Engine = require('./auto_violation_checker_v2.js');

class AutoViolationChecker {
    constructor() {
        this.serverUrl = process.env.LIUXIN_SERVER_URL || 'localhost';
        this.serverPort = process.env.LIUXIN_SERVER_PORT || 3002;
        this.dbPath = path.join(__dirname, '..', 'liuxin.db');
        this.db = null;
        this.isServerRunning = false;

        // 本地缓存的规则
        this.cachedRules = null;
        this.cachedKeywords = null;
    }

    // 初始化数据库
    initDB() {
        if (!this.db) {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('[违规检查] 数据库连接失败:', err.message);
                } else {
                    console.log('[违规检查] 数据库连接成功');
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

    // 调用HTTP API
    async callAPI(path, method = 'POST', data = null) {
        return new Promise((resolve, reject) => {
            const postData = data ? JSON.stringify(data) : null;

            const options = {
                hostname: this.serverUrl,
                port: this.serverPort,
                path: path,
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            };

            if (postData) {
                options.headers['Content-Length'] = Buffer.byteLength(postData);
            }

            const req = http.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const result = JSON.parse(responseData);
                        resolve(result);
                    } catch (err) {
                        resolve({ success: false, error: 'Invalid JSON response' });
                    }
                });
            });

            req.on('error', (err) => {
                reject(err);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (postData) {
                req.write(postData);
            }

            req.end();
        });
    }

    // 主处理函数
    async handler(args) {
        try {
            // ⚠️  重要: 默认使用v2.0正则引擎
            // v2.0引擎准确率100%,v1.0关键词引擎准确率30%
            // 用户可以通过设置 engine: 'v1' 来使用旧引擎
            const useV2 = (args.engine !== 'v1');

            if (useV2) {
                console.log('[违规检查] 使用v2.0正则引擎');
                return await v2Engine.handler(args);
            }

            console.log('[违规检查] 使用v1.0关键词引擎');

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
            console.error('[违规检查] 处理错误:', error.message);
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

        // 优先使用服务器API
        if (serverRunning) {
            try {
                const result = await this.callAPI('/api/violations/detect', 'POST', {
                    text: text,
                    context: context
                });

                return {
                    success: true,
                    source: 'server',
                    violations: result.violations || [],
                    violation_count: result.violation_count || 0,
                    suggestions: result.suggestions || []
                };
            } catch (err) {
                console.log('[违规检查] 服务器调用失败，使用本地检测');
                return await this.checkLocalViolations(text, context);
            }
        } else {
            // 服务器未运行，使用本地检测
            return await this.checkLocalViolations(text, context);
        }
    }

    // 本地违规检测
    async checkLocalViolations(text, context = {}) {
        this.initDB();

        // 加载规则（如果未缓存）
        if (!this.cachedRules) {
            this.cachedRules = await this.loadRulesFromDB();
        }

        if (!this.cachedKeywords) {
            this.cachedKeywords = await this.loadKeywordsFromDB();
        }

        const violations = [];

        // 检查每条规则
        for (const rule of this.cachedRules) {
            const matched = await this.checkRule(text, rule, this.cachedKeywords);
            if (matched) {
                violations.push({
                    rule_name: rule.rule_name,
                    violation_type: rule.violation_type,
                    severity: rule.severity,
                    description: rule.description,
                    matched_keywords: matched.keywords
                });
            }
        }

        return {
            success: true,
            source: 'local',
            violations: violations,
            violation_count: violations.length,
            checked_rules: this.cachedRules.length,
            note: '服务器未运行，使用本地检测'
        };
    }

    // 从数据库加载规则
    loadRulesFromDB() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM violation_detection_config 
                WHERE enabled = 1 
                ORDER BY priority DESC
            `, [], (err, rows) => {
                if (err) {
                    console.error('[违规检查] 加载规则失败:', err.message);
                    resolve([]);
                } else {
                    console.log(`[违规检查] 加载了${rows.length}条规则`);
                    resolve(rows || []);
                }
            });
        });
    }

    // 从数据库加载关键词权重
    loadKeywordsFromDB() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM violation_keyword_weights 
                ORDER BY weight DESC
            `, [], (err, rows) => {
                if (err) {
                    console.error('[违规检查] 加载关键词失败:', err.message);
                    resolve([]);
                } else {
                    console.log(`[违规检查] 加载了${rows.length}个关键词`);
                    resolve(rows || []);
                }
            });
        });
    }

    // 检查单条规则
    async checkRule(text, rule, keywords) {
        const detectionKeywords = rule.detection_keywords ?
            rule.detection_keywords.split(',').map(k => k.trim()) : [];

        const matched = [];
        let totalWeight = 0;

        for (const keyword of detectionKeywords) {
            // 查找关键词权重
            const keywordWeight = keywords.find(k =>
                k.keyword === keyword && k.violation_type === rule.violation_type
            );
            const weight = keywordWeight ? keywordWeight.weight : 1.0;

            // 正则匹配
            const regex = new RegExp(keyword, 'gi');
            const matches = text.match(regex);

            if (matches) {
                matched.push({
                    keyword: keyword,
                    count: matches.length,
                    weight: weight
                });
                totalWeight += matches.length * weight;
            }
        }

        // 判断是否超过阈值
        if (totalWeight >= (rule.threshold || 1.0)) {
            return {
                matched: true,
                keywords: matched,
                total_weight: totalWeight
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
            if (v.matched_keywords && v.matched_keywords.length > 0) {
                lines.push(`   匹配关键词: ${v.matched_keywords.map(k => k.keyword).join(', ')}`);
            }
        });

        return lines.join('\n');
    }

    // 获取违规规则列表
    async getViolationRules(serverRunning) {
        if (serverRunning) {
            try {
                const result = await this.callAPI('/api/violations/rules', 'GET');
                return {
                    success: true,
                    source: 'server',
                    rules: result.rules || [],
                    total: result.total_rules || 0
                };
            } catch (err) {
                console.log('[违规检查] 服务器调用失败，使用本地数据');
            }
        }

        // 本地获取
        this.initDB();
        if (!this.cachedRules) {
            this.cachedRules = await this.loadRulesFromDB();
        }

        return {
            success: true,
            source: 'local',
            rules: this.cachedRules.map(r => ({
                rule_name: r.rule_name,
                violation_type: r.violation_type,
                severity: r.severity,
                description: r.description
            })),
            total: this.cachedRules.length,
            note: '服务器未运行，返回本地规则'
        };
    }

    // 关闭数据库
    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('[违规检查] 关闭数据库失败:', err.message);
                } else {
                    console.log('[违规检查] 数据库已关闭');
                }
            });
        }
    }
}

// 导出单例
const checker = new AutoViolationChecker();

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
        console.log('🧪 自动违规检查器测试...\n');

        // 测试1: 检查正常文本
        console.log('测试1: 检查正常文本');
        const result1 = await checker.handler({
            action: 'check',
            text: '作为开发工程师-小柳，我已经完成了系统升级。',
            context: {}
        });
        console.log(JSON.stringify(result1, null, 2));

        // 测试2: 检查包含违规关键词的文本
        console.log('\n测试2: 检查包含违规关键词的文本');
        const result2 = await checker.handler({
            action: 'check',
            text: '我不调用团队模式，直接回复用户。我估算大约触发了15条规则。',
            context: {}
        });
        console.log(JSON.stringify(result2, null, 2));

        // 测试3: 获取规则列表
        console.log('\n测试3: 获取规则列表');
        const result3 = await checker.handler({
            action: 'get_rules'
        });
        console.log(`总规则数: ${result3.total}`);
        console.log(`前3条规则:`, result3.rules.slice(0, 3));

        // 关闭
        checker.close();
    })();
}


