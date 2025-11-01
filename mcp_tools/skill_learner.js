/**
 * 技能学习MCP工具 v1.0
 * 功能：桥接xiaoliu-fusion的技能学习系统到v7.1 MCP
 * 创建时间：2025-10-20
 */

const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');

class SkillLearner {
    constructor() {
        this.xiaoliu_fusion_api = process.env.XIAOLIU_FUSION_API || 'http://localhost:8888';
        this.local_db_path = process.env.XIAOLIU_DB_PATH || './liuxin.db';
        this.db = null;
        this.dbRun = null;
        this.dbGet = null;
        this.dbAll = null;
    }

    /**
     * 初始化数据库连接
     */
    async initialize() {
        if (this.db) {
            return true;
        }

        try {
            this.db = new sqlite3.Database(this.local_db_path);
            this.dbRun = promisify(this.db.run.bind(this.db));
            this.dbGet = promisify(this.db.get.bind(this.db));
            this.dbAll = promisify(this.db.all.bind(this.db));

            console.error('[技能学习] 数据库连接成功');
            return true;
        } catch (error) {
            console.error('[技能学习] 数据库连接失败:', error.message);
            return false;
        }
    }

    /**
     * 学习新技能（从对话中识别）
     * @param {Object} args - { context: string, role_id: string }
     */
    async learnFromContext(args) {
        try {
            const { context, role_id = '小柳' } = args;

            if (!context) {
                return {
                    success: false,
                    error: '缺少context参数'
                };
            }

            await this.initialize();

            // 1. 尝试调用xiaoliu-fusion API
            let learned_skills = [];
            try {
                const response = await axios.post(
                    `${this.xiaoliu_fusion_api}/api/v1/skills/learn`,
                    { context, role_id },
                    { timeout: 5000 }
                );

                if (response.data.success) {
                    learned_skills = response.data.skills || [];
                    console.error('[技能学习] xiaoliu-fusion API成功:', learned_skills.length, '个技能');
                }
            } catch (apiError) {
                console.error('[技能学习] xiaoliu-fusion API不可用，使用本地识别');

                // 2. 降级方案：本地简单识别
                learned_skills = this._localSkillRecognition(context, role_id);
            }

            // 3. 保存到本地数据库
            for (const skill of learned_skills) {
                await this._saveSkill(skill);
            }

            return {
                success: true,
                learned_count: learned_skills.length,
                skills: learned_skills,
                message: `成功学习${learned_skills.length}个技能`
            };

        } catch (error) {
            console.error('[技能学习] 学习失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 获取技能推荐
     * @param {Object} args - { task: string, role_id: string }
     */
    async getSkillRecommendations(args) {
        try {
            const { task, role_id = '小柳' } = args;

            if (!task) {
                return {
                    success: false,
                    error: '缺少task参数'
                };
            }

            await this.initialize();

            // 1. 尝试调用xiaoliu-fusion API
            try {
                const response = await axios.post(
                    `${this.xiaoliu_fusion_api}/api/v1/skills/recommend`,
                    { task, role_id },
                    { timeout: 5000 }
                );

                if (response.data.success) {
                    return {
                        success: true,
                        recommendations: response.data.recommendations || [],
                        source: 'xiaoliu-fusion'
                    };
                }
            } catch (apiError) {
                console.error('[技能推荐] xiaoliu-fusion API不可用，使用本地推荐');
            }

            // 2. 降级方案：从本地数据库查询相关技能
            const keywords = this._extractKeywords(task);
            const skills = await this._querySkillsByKeywords(keywords, role_id);

            return {
                success: true,
                recommendations: skills.slice(0, 5), // 返回前5个
                source: 'local-db'
            };

        } catch (error) {
            console.error('[技能推荐] 推荐失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 获取技能统计
     * @param {Object} args - { role_id: string }
     */
    async getSkillStats(args) {
        try {
            const { role_id = '小柳' } = args;

            await this.initialize();

            const stats = await this.dbGet(`
        SELECT 
          COUNT(*) as total_skills,
          SUM(usage_count) as total_usage,
          AVG(proficiency_level) as avg_proficiency,
          COUNT(CASE WHEN level >= 3 THEN 1 END) as advanced_skills
        FROM skills
        WHERE role_id = ?
      `, [role_id]);

            const categories = await this.dbAll(`
        SELECT 
          category,
          COUNT(*) as count
        FROM skills
        WHERE role_id = ?
        GROUP BY category
        ORDER BY count DESC
      `, [role_id]);

            return {
                success: true,
                stats: {
                    total_skills: stats.total_skills || 0,
                    total_usage: stats.total_usage || 0,
                    avg_proficiency: Math.round((stats.avg_proficiency || 0) * 10) / 10,
                    advanced_skills: stats.advanced_skills || 0,
                    categories: categories
                }
            };

        } catch (error) {
            console.error('[技能统计] 统计失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 本地技能识别（简化版）
     */
    _localSkillRecognition(context, role_id) {
        const skills = [];

        // 简单的关键词匹配
        const patterns = [
            { pattern: /使用.*?(?:开发|实现|创建|构建)/, skill_name: 'Node.js开发', category: '开发' },
            { pattern: /数据库.*?(?:设计|查询|优化)/, skill_name: '数据库管理', category: '开发' },
            { pattern: /API.*?(?:设计|开发|集成)/, skill_name: 'API开发', category: '开发' },
            { pattern: /(?:测试|验证|检查)/, skill_name: '测试验证', category: '质量' },
            { pattern: /(?:部署|发布|上线)/, skill_name: '系统部署', category: '运维' }
        ];

        for (const { pattern, skill_name, category } of patterns) {
            if (pattern.test(context)) {
                skills.push({
                    role_id,
                    name: skill_name,
                    category,
                    description: `从上下文中识别的技能`,
                    level: 1,
                    proficiency_level: 1,
                    usage_count: 1
                });
            }
        }

        return skills;
    }

    /**
     * 提取关键词
     */
    _extractKeywords(text) {
        // 简单的分词和关键词提取
        const stopWords = ['的', '了', '和', '是', '在', '有', '个', '我', '你', '他'];
        const words = text.split(/\s+/).filter(word => {
            return word.length > 1 && !stopWords.includes(word);
        });
        return words.slice(0, 5); // 返回前5个关键词
    }

    /**
     * 根据关键词查询技能
     */
    async _querySkillsByKeywords(keywords, role_id) {
        if (!keywords || keywords.length === 0) {
            return [];
        }

        const placeholders = keywords.map(() => '?').join(',');
        const query = `
      SELECT 
        id, role_id, name, description, category,
        level, proficiency_level, usage_count
      FROM skills
      WHERE role_id = ?
        AND (
          name LIKE '%' || ? || '%'
          OR description LIKE '%' || ? || '%'
          OR category LIKE '%' || ? || '%'
        )
      ORDER BY usage_count DESC, proficiency_level DESC
      LIMIT 10
    `;

        const params = [role_id];
        keywords.forEach(keyword => {
            params.push(keyword, keyword, keyword);
        });

        try {
            const skills = await this.dbAll(query, params);
            return skills || [];
        } catch (error) {
            console.error('[技能查询] 查询失败:', error);
            return [];
        }
    }

    /**
     * 保存技能到数据库
     */
    async _saveSkill(skill) {
        const {
            role_id,
            name,
            description = '',
            category = '',
            level = 1,
            proficiency_level = 1,
            usage_count = 1
        } = skill;

        try {
            // 检查是否已存在
            const existing = await this.dbGet(
                'SELECT id FROM skills WHERE role_id = ? AND name = ?',
                [role_id, name]
            );

            if (existing) {
                // 更新使用次数
                await this.dbRun(
                    `UPDATE skills 
           SET usage_count = usage_count + 1,
               last_used = datetime('now')
           WHERE id = ?`,
                    [existing.id]
                );
                console.error('[技能保存] 更新技能:', name);
            } else {
                // 插入新技能
                await this.dbRun(
                    `INSERT INTO skills (
            role_id, name, description, category,
            level, proficiency_level, usage_count,
            last_used, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
                    [role_id, name, description, category, level, proficiency_level, usage_count]
                );
                console.error('[技能保存] 新增技能:', name);
            }

            return true;
        } catch (error) {
            console.error('[技能保存] 保存失败:', error);
            return false;
        }
    }

    /**
     * 清理资源
     */
    async cleanup() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

// 导出处理函数
const skillLearner = new SkillLearner();

module.exports = {
    name: 'liuxin_skill_learner',
    description: '技能学习系统：从对话中学习技能，提供技能推荐和统计',

    schema: {
        action: {
            type: 'string',
            description: '操作类型：learn（学习）, recommend（推荐）, stats（统计）',
            enum: ['learn', 'recommend', 'stats']
        },
        context: {
            type: 'string',
            description: '上下文内容（learn时必需）'
        },
        task: {
            type: 'string',
            description: '任务描述（recommend时必需）'
        },
        role_id: {
            type: 'string',
            description: '角色ID（可选，默认"小柳"）'
        }
    },

    async handler(args) {
        const { action = 'learn', ...restArgs } = args;

        try {
            let result;
            switch (action) {
                case 'learn':
                    result = await skillLearner.learnFromContext(restArgs);
                    break;
                case 'recommend':
                    result = await skillLearner.getSkillRecommendations(restArgs);
                    break;
                case 'stats':
                    result = await skillLearner.getSkillStats(restArgs);
                    break;
                default:
                    result = {
                        success: false,
                        error: `未知操作: ${action}`
                    };
            }

            return result;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    },

    cleanup: () => skillLearner.cleanup()
};

