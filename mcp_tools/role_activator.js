/**
 * 角色激活器 - Role Activator
 * 
 * 功能：
 * 1. 根据场景自动激活相应角色
 * 2. 为角色分配测试技能
 * 3. 管理角色切换和技能触发
 * 4. 记录角色和技能使用历史
 * 
 * 版本: v1.0
 * 创建时间: 2025-10-24
 */

class RoleActivator {
    constructor(db) {
        this.db = db;
        this.currentRole = null;
        this.activeSkills = new Set();
    }

    /**
     * 根据场景激活角色
     * @param {Object} context - 上下文信息 {scenario, task_type, risk_level, user_request}
     * @returns {Object} - 激活结果 {role, skills, reason}
     */
    async activateRoleByScenario(context) {
        const { scenario, task_type, risk_level, user_request } = context;

        console.log('[RoleActivator] 场景识别:', { scenario, task_type, risk_level });

        // 1. 根据场景确定角色
        const roleId = this.determineRole(scenario, task_type, user_request);
        console.log('[RoleActivator] 确定角色:', roleId);

        // 2. 获取角色信息
        const role = await this.getRoleInfo(roleId);
        if (!role) {
            throw new Error(`角色 ${roleId} 不存在`);
        }

        // 3. 获取角色技能
        const skills = await this.getRoleSkills(roleId, scenario);
        console.log('[RoleActivator] 激活技能数量:', skills.length);

        // 4. 激活角色和技能
        this.currentRole = role;
        this.activeSkills = new Set(skills.map(s => s.id));

        // 5. 记录激活历史
        await this.recordActivation(roleId, skills, context);

        return {
            success: true,
            role: {
                id: role.id,
                name: role.name,
                description: role.description
            },
            skills: skills.map(s => ({
                id: s.id,
                name: s.name,
                level: s.level,
                category: s.category
            })),
            reason: this.getActivationReason(scenario, task_type, roleId),
            active_skills_count: skills.length
        };
    }

    /**
     * 确定角色
     */
    determineRole(scenario, task_type, user_request) {
        // 测试相关场景
        if (scenario === 'testing' ||
            scenario === 'bug_fix' ||
            task_type === 'test' ||
            (user_request && user_request.includes('测试'))) {
            return 'test_engineer';
        }

        // 质量保障场景
        if (scenario === 'quality_check' ||
            scenario === 'release' ||
            task_type === 'qa' ||
            (user_request && (user_request.includes('质量') || user_request.includes('审核')))) {
            return 'qa_specialist';
        }

        // 开发场景
        if (scenario === 'code_change' ||
            scenario === 'feature_add' ||
            scenario === 'refactor' ||
            task_type === 'development') {
            return 'dev_assistant';
        }

        // 默认开发助手
        return 'dev_assistant';
    }

    /**
     * 获取角色信息
     */
    async getRoleInfo(roleId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM roles WHERE id = ?',
                [roleId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    /**
     * 获取角色技能
     */
    async getRoleSkills(roleId, scenario) {
        return new Promise((resolve, reject) => {
            // 获取该角色的所有技能，优先级：testing > scenario相关 > 其他
            let sql = `
        SELECT * FROM skills 
        WHERE role_id = ?
        ORDER BY 
          CASE 
            WHEN category = 'testing' THEN 1
            WHEN description LIKE '%${scenario}%' THEN 2
            ELSE 3
          END,
          level DESC,
          proficiency_level DESC
      `;

            this.db.all(sql, [roleId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * 获取激活原因
     */
    getActivationReason(scenario, task_type, roleId) {
        const reasons = {
            'test_engineer': `检测到${scenario}场景，需要执行测试验证，激活测试工程师角色`,
            'qa_specialist': `检测到${scenario}场景，需要质量保障，激活QA专员角色`,
            'dev_assistant': `检测到${scenario}场景，需要开发支持，激活开发助手角色`
        };
        return reasons[roleId] || `自动激活${roleId}角色`;
    }

    /**
     * 记录激活历史
     */
    async recordActivation(roleId, skills, context) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
        INSERT INTO skill_execution_log (
          role_id, skill_id, scenario, context, executed_at
        ) VALUES (?, ?, ?, ?, datetime('now'))
      `);

            skills.forEach(skill => {
                stmt.run(
                    roleId,
                    skill.id,
                    context.scenario,
                    JSON.stringify(context),
                    (err) => {
                        if (err) console.error('[RoleActivator] 记录激活历史失败:', err.message);
                    }
                );
            });

            stmt.finalize((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * 检查技能是否激活
     */
    isSkillActive(skillId) {
        return this.activeSkills.has(skillId);
    }

    /**
     * 获取当前角色
     */
    getCurrentRole() {
        return this.currentRole;
    }

    /**
     * 获取激活的技能列表
     */
    getActiveSkills() {
        return Array.from(this.activeSkills);
    }

    /**
     * 手动激活技能
     */
    async activateSkill(skillId) {
        // 获取技能信息
        const skill = await new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM skills WHERE id = ?', [skillId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!skill) {
            throw new Error(`技能 ${skillId} 不存在`);
        }

        this.activeSkills.add(skillId);
        console.log('[RoleActivator] 手动激活技能:', skill.name);

        return {
            success: true,
            skill: {
                id: skill.id,
                name: skill.name,
                description: skill.description
            }
        };
    }

    /**
     * 停用技能
     */
    deactivateSkill(skillId) {
        this.activeSkills.delete(skillId);
        console.log('[RoleActivator] 停用技能:', skillId);
        return { success: true };
    }

    /**
     * 清除所有激活
     */
    clearActivations() {
        this.currentRole = null;
        this.activeSkills.clear();
        console.log('[RoleActivator] 已清除所有激活');
        return { success: true };
    }

    /**
     * 获取技能执行建议
     */
    async getSkillSuggestions(context) {
        const { scenario, task_type } = context;

        // 查询适合当前场景的技能
        return new Promise((resolve, reject) => {
            const sql = `
        SELECT s.*, r.name as role_name
        FROM skills s
        JOIN roles r ON s.role_id = r.id
        WHERE s.category = 'testing' 
           OR s.description LIKE ?
        ORDER BY s.level DESC, s.proficiency_level DESC
        LIMIT 10
      `;

            this.db.all(sql, [`%${scenario}%`], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * 更新技能使用统计
     */
    async updateSkillUsage(skillId, success = true) {
        return new Promise((resolve, reject) => {
            const sql = `
        UPDATE skills 
        SET usage_count = usage_count + 1,
            last_used = datetime('now')
        WHERE id = ?
      `;

            this.db.run(sql, [skillId], (err) => {
                if (err) {
                    console.error('[RoleActivator] 更新技能统计失败:', err.message);
                    reject(err);
                } else {
                    console.log('[RoleActivator] 技能使用统计已更新:', skillId);
                    resolve();
                }
            });
        });
    }

    /**
     * 获取角色统计
     */
    async getRoleStats(roleId) {
        return new Promise((resolve, reject) => {
            const sql = `
        SELECT 
          COUNT(*) as total_skills,
          AVG(level) as avg_level,
          AVG(proficiency_level) as avg_proficiency,
          SUM(usage_count) as total_usage
        FROM skills
        WHERE role_id = ?
      `;

            this.db.get(sql, [roleId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
}

module.exports = RoleActivator;







