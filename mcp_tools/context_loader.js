#!/usr/bin/env node
// ====================================================================
// 上下文智能加载系统 (Context Loader)
// ====================================================================
// 版本: v7.1+ (策略A+整合)
// 功能: 根据条件智能决定是否加载上下文,避免token浪费
// 架构: 本地SQLite数据库查询
// 作者: 小柳(开发工程师)
// 创建时间: 2025-10-20
// ====================================================================

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class ContextLoader {
    constructor() {
        // 数据库路径(使用data DB,包含上下文加载表)
        this.dataDbPath = process.env.XIAOLIU_DATA_DB_PATH ||
            path.join(__dirname, '../data/liuxin.db');

        this.db = null;
    }

    // 初始化数据库连接
    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dataDbPath, (err) => {
                if (err) {
                    console.error('[上下文加载] 数据库连接失败:', err.message);
                    reject(err);
                } else {
                    console.log('[上下文加载] 数据库连接成功:', this.dataDbPath);
                    resolve();
                }
            });
        });
    }

    // 主处理函数
    async handler(args) {
        try {
            const { action, user_message, context_type, current_tokens } = args;

            // 初始化数据库(如果未初始化)
            if (!this.db) {
                await this.initialize();
            }

            switch (action) {
                case 'should_load':
                    return await this.shouldLoadContext(user_message, context_type, current_tokens);

                case 'get_config':
                    return await this.getLoadConfig();

                case 'get_stats':
                    return await this.getLoadStats();

                default:
                    return {
                        success: false,
                        error: `未知操作: ${action}`,
                        valid_actions: ['should_load', 'get_config', 'get_stats']
                    };
            }
        } catch (error) {
            console.error('[上下文加载] 处理错误:', error.message);
            return {
                success: false,
                error: error.message,
                stack: error.stack
            };
        }
    }

    // 判断是否应该加载上下文
    async shouldLoadContext(user_message, context_type, current_tokens = 0) {
        try {
            console.log('[上下文加载] 开始分析...');
            console.log('[上下文加载] 消息长度:', user_message.length);
            console.log('[上下文加载] 上下文类型:', context_type);
            console.log('[上下文加载] 当前tokens:', current_tokens);

            // 1. 提取关键词
            const keywords = this._extractKeywords(user_message);
            console.log('[上下文加载] 提取关键词:', keywords.length);

            // 2. 检查否定词(如"不需要"、"跳过")
            const negations = await this._loadNegationWords();
            if (this._hasNegation(user_message, negations)) {
                console.log('[上下文加载] 检测到否定词,不加载');
                return {
                    success: true,
                    load: false,
                    reason: '检测到否定词（如"不需要"、"跳过"）',
                    negation_words: negations.filter(n =>
                        new RegExp(n.word, 'gi').test(user_message)
                    ).map(n => n.word)
                };
            }

            // 3. 匹配条件词,计算权重
            const conditions = await this._loadConditionalWords();
            const score = this._calculateScore(keywords, conditions, context_type);
            console.log('[上下文加载] 计算得分:', score);

            // 4. 获取配置阈值
            const config = await this._getConfig(context_type);
            console.log('[上下文加载] 配置阈值:', config.threshold);

            // 5. 判断是否加载
            const shouldLoad = score >= config.threshold;

            if (shouldLoad) {
                // 记录加载日志
                await this._logLoad(context_type, score, true, current_tokens);

                return {
                    success: true,
                    load: true,
                    score: score,
                    threshold: config.threshold,
                    context_type: context_type,
                    estimated_tokens: config.max_tokens,
                    total_tokens: current_tokens + config.max_tokens,
                    matched_keywords: keywords.filter(k => k.score > 0)
                };
            } else {
                // 记录未加载日志
                await this._logLoad(context_type, score, false, current_tokens);

                return {
                    success: true,
                    load: false,
                    score: score,
                    threshold: config.threshold,
                    reason: `得分${score}低于阈值${config.threshold}`,
                    suggestion: '可以明确要求加载上下文（如"需要查看项目历史"）'
                };
            }
        } catch (error) {
            console.error('[上下文加载] 判断失败:', error.message);
            return {
                success: false,
                error: error.message,
                load: false,
                reason: '分析失败,默认不加载'
            };
        }
    }

    // 提取关键词
    _extractKeywords(text) {
        // 简单的关键词提取(基于分词和停用词过滤)
        const stopWords = ['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好'];

        // 分词(简单按空格和标点分割)
        const words = text.split(/[\s,，。.!！?？;；:：、]+/)
            .filter(w => w.length > 1)
            .filter(w => !stopWords.includes(w));

        // 去重并计算频率
        const wordFreq = {};
        for (const word of words) {
            wordFreq[word] = (wordFreq[word] || 0) + 1;
        }

        return Object.keys(wordFreq).map(word => ({
            word: word,
            frequency: wordFreq[word],
            score: 0 // 稍后计算
        }));
    }

    // 加载否定词
    async _loadNegationWords() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM context_negation_words
                WHERE enabled = 1
            `, [], (err, rows) => {
                if (err) {
                    console.error('[上下文加载] 加载否定词失败:', err.message);
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    // 检查是否有否定词
    _hasNegation(text, negations) {
        for (const negation of negations) {
            const regex = new RegExp(negation.word, 'gi');
            if (regex.test(text)) {
                console.log(`[上下文加载] 发现否定词: ${negation.word}`);
                return true;
            }
        }
        return false;
    }

    // 加载条件词
    async _loadConditionalWords() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM context_conditional_words
                WHERE enabled = 1
            `, [], (err, rows) => {
                if (err) {
                    console.error('[上下文加载] 加载条件词失败:', err.message);
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    // 计算得分
    _calculateScore(keywords, conditions, context_type) {
        let totalScore = 0;

        for (const keyword of keywords) {
            // 查找匹配的条件词
            const matchedCondition = conditions.find(c =>
                c.context_type === context_type &&
                new RegExp(c.word, 'gi').test(keyword.word)
            );

            if (matchedCondition) {
                const score = matchedCondition.weight * keyword.frequency;
                keyword.score = score;
                totalScore += score;
                console.log(`[上下文加载] 匹配: ${keyword.word} -> ${matchedCondition.word} (权重${matchedCondition.weight} × 频率${keyword.frequency} = ${score})`);
            }
        }

        return totalScore;
    }

    // 获取配置
    async _getConfig(context_type) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT * FROM context_load_config
                WHERE context_type = ?
            `, [context_type], (err, row) => {
                if (err) {
                    console.error('[上下文加载] 获取配置失败:', err.message);
                    reject(err);
                } else if (row) {
                    resolve(row);
                } else {
                    // 默认配置
                    resolve({
                        context_type: context_type,
                        threshold: 1.0,
                        max_tokens: 1000,
                        enabled: 1
                    });
                }
            });
        });
    }

    // 记录加载日志
    async _logLoad(context_type, score, loaded, current_tokens) {
        return new Promise((resolve) => {
            this.db.run(`
                INSERT INTO context_load_logs 
                (context_type, score, threshold_met, loaded, tokens_used, created_at)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
            `, [context_type, score, loaded ? 1 : 0, loaded ? 1 : 0, current_tokens], (err) => {
                if (err) {
                    console.error('[上下文加载] 记录日志失败:', err.message);
                }
                resolve();
            });
        });
    }

    // 获取配置列表
    async getLoadConfig() {
        try {
            return new Promise((resolve, reject) => {
                this.db.all(`
                    SELECT * FROM context_load_config
                    WHERE enabled = 1
                    ORDER BY context_type
                `, [], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({
                            success: true,
                            total_configs: rows.length,
                            configs: rows.map(r => ({
                                context_type: r.context_type,
                                threshold: r.threshold,
                                max_tokens: r.max_tokens,
                                description: r.description
                            }))
                        });
                    }
                });
            });
        } catch (error) {
            console.error('[上下文加载] 获取配置失败:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 获取加载统计
    async getLoadStats() {
        try {
            return new Promise((resolve, reject) => {
                this.db.all(`
                    SELECT 
                        context_type,
                        COUNT(*) as total_requests,
                        SUM(CASE WHEN loaded = 1 THEN 1 ELSE 0 END) as loaded_count,
                        AVG(score) as avg_score,
                        SUM(tokens_used) as total_tokens
                    FROM context_load_logs
                    WHERE created_at >= datetime('now', '-30 days')
                    GROUP BY context_type
                `, [], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        const total = rows.reduce((sum, r) => sum + r.total_requests, 0);
                        const loaded = rows.reduce((sum, r) => sum + r.loaded_count, 0);

                        resolve({
                            success: true,
                            total_requests: total,
                            total_loaded: loaded,
                            load_rate: total > 0 ? (loaded / total * 100).toFixed(1) + '%' : '0%',
                            by_context_type: rows.map(r => ({
                                context_type: r.context_type,
                                total_requests: r.total_requests,
                                loaded_count: r.loaded_count,
                                load_rate: ((r.loaded_count / r.total_requests) * 100).toFixed(1) + '%',
                                avg_score: r.avg_score.toFixed(2),
                                total_tokens: r.total_tokens
                            }))
                        });
                    }
                });
            });
        } catch (error) {
            console.error('[上下文加载] 获取统计失败:', error.message);
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
                        console.error('[上下文加载] 关闭数据库失败:', err.message);
                    } else {
                        console.log('[上下文加载] 数据库连接已关闭');
                    }
                    resolve();
                });
            });
        }
    }
}

// 导出单例
const loader = new ContextLoader();

module.exports = {
    handler: async (args) => {
        return await loader.handler(args);
    },
    close: async () => {
        return await loader.close();
    }
};

// 如果直接运行(测试用)
if (require.main === module) {
    (async () => {
        console.log('🧪 上下文智能加载测试...\n');

        // 测试1: 应该加载
        const result1 = await loader.handler({
            action: 'should_load',
            user_message: '请查看项目历史,我需要了解之前的开发进度',
            context_type: '项目历史',
            current_tokens: 5000
        });
        console.log('测试1结果:', JSON.stringify(result1, null, 2));

        // 测试2: 不应该加载(否定词)
        const result2 = await loader.handler({
            action: 'should_load',
            user_message: '不需要查看历史,直接开始新功能',
            context_type: '项目历史',
            current_tokens: 5000
        });
        console.log('\n测试2结果:', JSON.stringify(result2, null, 2));

        // 测试3: 获取配置
        const result3 = await loader.handler({
            action: 'get_config'
        });
        console.log('\n测试3结果:', JSON.stringify(result3, null, 2));

        // 关闭连接
        await loader.close();
    })();
}

