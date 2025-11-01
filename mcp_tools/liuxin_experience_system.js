/**
 * 柳芯错误经验系统 - 整合版
 * 功能：错误预测、自动记录、智能检索
 * 适配：SQLite数据库
 * 创建时间：2025-10-20
 */

const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');

class LiuxinExperienceSystem {
    constructor(dbPath = './liuxin.db') {
        this.dbPath = dbPath;
        this.db = null;
        this.dbRun = null;
        this.dbGet = null;
        this.dbAll = null;

        // 统计数据
        this.stats = {
            totalPredictions: 0,
            totalRecords: 0,
            totalRetrieves: 0,
            lastPrediction: null
        };
    }

    /**
     * 初始化数据库连接
     */
    async initialize() {
        if (this.db) {
            return true;
        }

        try {
            this.db = new sqlite3.Database(this.dbPath);
            this.dbRun = promisify(this.db.run.bind(this.db));
            this.dbGet = promisify(this.db.get.bind(this.db));
            this.dbAll = promisify(this.db.all.bind(this.db));

            console.error('[经验系统] 数据库连接成功');

            // 确保表结构存在
            await this.ensureTableStructure();

            return true;
        } catch (error) {
            console.error('[经验系统] 数据库连接失败:', error.message);
            return false;
        }
    }

    /**
     * 确保表结构存在
     */
    async ensureTableStructure() {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS experiences (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                category TEXT,
                title TEXT NOT NULL,
                description TEXT,
                error_message TEXT,
                context TEXT,
                solution TEXT,
                code TEXT,
                preventive_measures TEXT,
                occurrence_count INTEGER DEFAULT 1,
                severity TEXT,
                tags TEXT,
                steps TEXT,
                best_practices TEXT,
                prediction_score REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.dbRun(createTableSQL);
        console.error('[经验系统] 表结构就绪');
    }

    /**
     * 预测可能的错误
     * @param {Object} context - 当前上下文
     * @returns {Promise<Array>} 预测结果
     */
    async predictErrors(context) {
        this.stats.totalPredictions++;
        this.stats.lastPrediction = new Date().toISOString();

        try {
            await this.initialize();

            const { userMessage, codeContext, recentErrors } = context;

            // 1. 基于关键词匹配查找相似经验
            const keywords = this._extractKeywords(userMessage || '');
            const predictions = [];

            for (const keyword of keywords) {
                const experiences = await this.dbAll(`
                    SELECT * FROM experiences 
                    WHERE (title LIKE ? OR error_message LIKE ? OR tags LIKE ?)
                    AND type = 'error'
                    ORDER BY occurrence_count DESC, severity DESC
                    LIMIT 3
                `, [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`]);

                for (const exp of experiences) {
                    const score = this._calculatePredictionScore(exp, context);
                    if (score > 0.5) {
                        predictions.push({
                            id: exp.id,
                            title: exp.title,
                            errorMessage: exp.error_message,
                            solution: exp.solution,
                            preventiveMeasures: JSON.parse(exp.preventive_measures || '[]'),
                            score: score,
                            severity: exp.severity
                        });
                    }
                }
            }

            // 2. 去重并排序
            const uniquePredictions = this._deduplicatePredictions(predictions);
            const topPredictions = uniquePredictions.slice(0, 3);

            return {
                success: true,
                predictions: topPredictions,
                totalPredictions: topPredictions.length,
                message: topPredictions.length > 0
                    ? `预测到${topPredictions.length}个可能的错误`
                    : '未发现潜在错误'
            };

        } catch (error) {
            console.error('[经验系统] 预测失败:', error);
            return {
                success: false,
                error: error.message,
                predictions: []
            };
        }
    }

    /**
     * 记录错误经验
     * @param {Object} errorData - 错误数据
     * @returns {Promise<Object>} 记录结果
     */
    async recordError(errorData) {
        this.stats.totalRecords++;

        try {
            await this.initialize();

            const {
                type = 'error',
                category,
                title,
                errorMessage,
                context,
                solution,
                code,
                preventiveMeasures = [],
                severity = 'medium',
                tags = []
            } = errorData;

            // 插入数据库（匹配实际表结构，id是AUTOINCREMENT，不需要手动插入）
            const experienceContent = {
                error: errorMessage || '',
                solution: solution || '',
                context: context || '',
                code: code || '',
                preventiveMeasures: preventiveMeasures,
                severity: severity
            };

            // 使用回调方式获取lastID
            let id;
            await new Promise((resolve, reject) => {
                this.db.run(`
                    INSERT INTO experiences (
                        title, content, category, tags, reference_count, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                `, [
                    title || errorMessage || '未命名经验',
                    JSON.stringify(experienceContent),
                    category || 'general',
                    JSON.stringify(tags),
                    0
                ], function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        id = this.lastID;
                        resolve();
                    }
                });
            });

            return {
                success: true,
                experienceId: id,
                message: '错误经验已记录'
            };

        } catch (error) {
            console.error('[经验系统] 记录失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 检索经验
     * @param {Object} query - 查询条件
     * @returns {Promise<Object>} 检索结果
     */
    async retrieveExperiences(query) {
        this.stats.totalRetrieves++;

        try {
            await this.initialize();

            const { keyword, category, severity, limit = 10 } = query;

            let sql = 'SELECT * FROM experiences WHERE 1=1';
            const params = [];

            if (keyword) {
                sql += ' AND (title LIKE ? OR error_message LIKE ? OR tags LIKE ?)';
                params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
            }

            if (category) {
                sql += ' AND category = ?';
                params.push(category);
            }

            if (severity) {
                sql += ' AND severity = ?';
                params.push(severity);
            }

            sql += ' ORDER BY occurrence_count DESC, created_at DESC LIMIT ?';
            params.push(limit);

            const experiences = await this.dbAll(sql, params);

            return {
                success: true,
                experiences: experiences.map(exp => ({
                    id: exp.id,
                    type: exp.type,
                    category: exp.category,
                    title: exp.title,
                    errorMessage: exp.error_message,
                    solution: exp.solution,
                    preventiveMeasures: JSON.parse(exp.preventive_measures || '[]'),
                    severity: exp.severity,
                    occurrenceCount: exp.occurrence_count
                })),
                total: experiences.length
            };

        } catch (error) {
            console.error('[经验系统] 检索失败:', error);
            return {
                success: false,
                error: error.message,
                experiences: []
            };
        }
    }

    /**
     * 获取统计信息
     */
    async getStats() {
        try {
            await this.initialize();

            const totalExp = await this.dbGet('SELECT COUNT(*) as count FROM experiences');
            const errorExp = await this.dbGet('SELECT COUNT(*) as count FROM experiences WHERE type = "error"');
            const highSeverity = await this.dbGet('SELECT COUNT(*) as count FROM experiences WHERE severity = "high"');

            return {
                success: true,
                stats: {
                    totalExperiences: totalExp.count,
                    errorCount: errorExp.count,
                    highSeverityCount: highSeverity.count,
                    totalPredictions: this.stats.totalPredictions,
                    totalRecords: this.stats.totalRecords,
                    totalRetrieves: this.stats.totalRetrieves,
                    lastPrediction: this.stats.lastPrediction
                }
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ========== 辅助方法 ==========

    _extractKeywords(text) {
        // 简单的关键词提取
        const stopWords = ['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '个'];
        const words = text.split(/[\s,，。.！!？?；;：:、]+/)
            .filter(word => word.length >= 2 && !stopWords.includes(word))
            .slice(0, 5);
        return words;
    }

    _calculatePredictionScore(experience, context) {
        let score = 0.5; // 基础分

        // 根据严重程度加分
        if (experience.severity === 'high') score += 0.2;
        if (experience.severity === 'critical') score += 0.3;

        // 根据发生次数加分
        if (experience.occurrence_count > 3) score += 0.1;
        if (experience.occurrence_count > 5) score += 0.1;

        return Math.min(score, 1.0);
    }

    _deduplicatePredictions(predictions) {
        const seen = new Set();
        return predictions.filter(pred => {
            if (seen.has(pred.id)) return false;
            seen.add(pred.id);
            return true;
        }).sort((a, b) => b.score - a.score);
    }

    /**
     * 关闭数据库连接
     */
    async close() {
        if (this.db) {
            await promisify(this.db.close.bind(this.db))();
            this.db = null;
        }
    }
}

// 导出单例
let instance = null;

function getInstance(dbPath) {
    if (!instance) {
        instance = new LiuxinExperienceSystem(dbPath);
    }
    return instance;
}

module.exports = {
    LiuxinExperienceSystem,
    getInstance
};

