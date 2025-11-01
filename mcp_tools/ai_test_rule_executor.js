/**
 * AI测试规则执行器 - AI Test Rule Executor
 * 
 * 功能：
 * 1. 监听代码变更事件
 * 2. 查询匹配的AI测试规则
 * 3. 自动触发AI验收测试
 * 4. 处理测试结果并执行相应动作
 * 5. 记录规则执行历史
 * 
 * 版本: v1.0
 * 创建时间: 2025-10-24
 */

class AITestRuleExecutor {
    constructor(db, aiTestTool, roleActivator) {
        this.db = db;
        this.aiTestTool = aiTestTool;
        this.roleActivator = roleActivator;
        this.isExecuting = false;
    }

    /**
     * 处理代码变更事件
     * @param {Object} event - 变更事件 {files, action, user_message, context}
     * @returns {Object} - 执行结果
     */
    async handleCodeChange(event) {
        if (this.isExecuting) {
            console.log('[AITestRuleExecutor] 测试正在执行中，跳过本次触发');
            return { success: false, reason: 'test_in_progress' };
        }

        try {
            this.isExecuting = true;
            console.log('[AITestRuleExecutor] 处理代码变更事件:', event);

            // 1. 查询匹配的规则
            const matchedRules = await this.findMatchingRules(event);
            console.log(`[AITestRuleExecutor] 匹配到 ${matchedRules.length} 条规则`);

            if (matchedRules.length === 0) {
                return { success: true, reason: 'no_matching_rules', rules: [] };
            }

            // 2. 按优先级排序
            matchedRules.sort((a, b) => b.priority - a.priority);

            // 3. 执行规则
            const results = [];
            for (const rule of matchedRules) {
                const result = await this.executeRule(rule, event);
                results.push(result);

                // 如果是block策略且测试失败，停止执行后续规则
                if (rule.conflict_strategy === 'block' && !result.test_passed) {
                    console.log('[AITestRuleExecutor] 遇到block规则失败，停止执行');
                    break;
                }
            }

            return {
                success: true,
                matched_rules: matchedRules.length,
                executed_rules: results.length,
                results: results
            };

        } catch (error) {
            console.error('[AITestRuleExecutor] 执行错误:', error);
            return { success: false, error: error.message };
        } finally {
            this.isExecuting = false;
        }
    }

    /**
     * 查找匹配的规则
     */
    async findMatchingRules(event) {
        return new Promise((resolve, reject) => {
            const sql = `
        SELECT * FROM liuxin_rules_unified
        WHERE enabled = 1 
          AND rule_code LIKE 'AI-TEST-%'
        ORDER BY priority DESC
      `;

            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    // 过滤匹配的规则
                    const matched = rows.filter(rule => this.isRuleMatched(rule, event));
                    resolve(matched);
                }
            });
        });
    }

    /**
     * 判断规则是否匹配
     */
    isRuleMatched(rule, event) {
        try {
            const details = JSON.parse(rule.rule_details || '{}');
            const conditions = details.trigger_conditions || {};

            // 检查文件模式
            if (conditions.file_patterns && event.files) {
                const matched = event.files.some(file =>
                    conditions.file_patterns.some(pattern =>
                        this.matchPattern(file, pattern)
                    )
                );
                if (matched) return true;
            }

            // 检查关键词
            if (conditions.keywords && event.user_message) {
                const matched = conditions.keywords.some(keyword =>
                    event.user_message.toLowerCase().includes(keyword.toLowerCase())
                );
                if (matched) return true;
            }

            // 检查用户意图
            if (conditions.user_intent && event.user_message) {
                const matched = conditions.user_intent.some(intent =>
                    event.user_message.includes(intent)
                );
                if (matched) return true;
            }

            // 检查模块
            if (conditions.modules && event.affected_modules) {
                const matched = conditions.modules.some(module =>
                    event.affected_modules.includes(module)
                );
                if (matched) return true;
            }

            // 检查风险指标
            if (conditions.risk_indicators && event.risk_indicators) {
                const matched = conditions.risk_indicators.some(indicator =>
                    event.risk_indicators.includes(indicator)
                );
                if (matched) return true;
            }

            return false;
        } catch (error) {
            console.error('[AITestRuleExecutor] 规则匹配判断错误:', error);
            return false;
        }
    }

    /**
     * 简单的模式匹配
     */
    matchPattern(file, pattern) {
        // 转换glob模式为正则表达式
        const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');

        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(file);
    }

    /**
     * 执行单条规则
     */
    async executeRule(rule, event) {
        console.log(`[AITestRuleExecutor] 执行规则: ${rule.rule_name}`);

        try {
            const details = JSON.parse(rule.rule_details || '{}');
            const testConfig = details.test_config || {};
            const roleConfig = details.role_activation;

            // 1. 激活角色(如果需要)
            if (roleConfig && this.roleActivator) {
                try {
                    await this.roleActivator.activateRoleByScenario({
                        scenario: testConfig.scenario || 'code_change',
                        task_type: 'test',
                        risk_level: testConfig.risk_level || 'medium'
                    });
                    console.log(`[AITestRuleExecutor] 角色已激活: ${roleConfig.role_id}`);
                } catch (error) {
                    console.warn('[AITestRuleExecutor] 角色激活失败:', error.message);
                }
            }

            // 2. 构建测试输入
            const testInput = {
                scenario: testConfig.scenario || 'code_change',
                risk_level: testConfig.risk_level || 'medium',
                changed_files: event.files || [],
                affected_modules: event.affected_modules || [],
                user_message: event.user_message || '',
                custom_strategies: testConfig.required_strategies || [],
                min_pass_rate: testConfig.min_pass_rate || 0.8,
                require_manual_confirm: testConfig.require_manual_confirm || false
            };

            // 3. 执行AI测试
            const testResult = await this.aiTestTool.executeTest(testInput);

            // 4. 更新规则使用计数
            await this.incrementRuleUsage(rule.rule_id);

            // 5. 记录执行历史
            await this.recordExecution(rule, event, testResult);

            // 6. 处理测试结果
            const action = testResult.success
                ? (details.success_action || 'continue')
                : (details.failure_action || 'warn_and_log');

            return {
                rule_id: rule.rule_id,
                rule_name: rule.rule_name,
                test_passed: testResult.success,
                pass_rate: testResult.pass_rate,
                action: action,
                test_result: testResult
            };

        } catch (error) {
            console.error(`[AITestRuleExecutor] 规则执行失败: ${rule.rule_name}`, error);
            return {
                rule_id: rule.rule_id,
                rule_name: rule.rule_name,
                test_passed: false,
                error: error.message,
                action: 'error'
            };
        }
    }

    /**
     * 更新规则使用计数
     */
    async incrementRuleUsage(ruleId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE liuxin_rules_unified SET usage_count = usage_count + 1 WHERE rule_id = ?',
                [ruleId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    /**
     * 记录执行历史
     */
    async recordExecution(rule, event, testResult) {
        return new Promise((resolve, reject) => {
            const sql = `
        INSERT INTO rule_execution_log (
          rule_id, rule_name, trigger_event, test_result, 
          success, executed_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'))
      `;

            this.db.run(
                sql,
                [
                    rule.rule_id,
                    rule.rule_name,
                    JSON.stringify(event),
                    JSON.stringify(testResult),
                    testResult.success ? 1 : 0
                ],
                (err) => {
                    if (err) {
                        console.warn('[AITestRuleExecutor] 记录执行历史失败:', err.message);
                        resolve(); // 不阻断主流程
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * 手动触发测试(通过规则代码)
     */
    async triggerTestByRuleCode(ruleCode, context) {
        console.log(`[AITestRuleExecutor] 手动触发测试: ${ruleCode}`);

        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM liuxin_rules_unified WHERE rule_code = ? AND enabled = 1',
                [ruleCode],
                async (err, rule) => {
                    if (err) {
                        reject(err);
                    } else if (!rule) {
                        reject(new Error(`规则未找到或未启用: ${ruleCode}`));
                    } else {
                        try {
                            const result = await this.executeRule(rule, context);
                            resolve(result);
                        } catch (error) {
                            reject(error);
                        }
                    }
                }
            );
        });
    }

    /**
     * 获取规则统计
     */
    async getRuleStats() {
        return new Promise((resolve, reject) => {
            const sql = `
        SELECT 
          COUNT(*) as total_rules,
          SUM(enabled) as enabled_rules,
          SUM(usage_count) as total_executions,
          AVG(priority) as avg_priority
        FROM liuxin_rules_unified
        WHERE rule_code LIKE 'AI-TEST-%'
      `;

            this.db.get(sql, [], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    /**
     * 获取执行历史
     */
    async getExecutionHistory(limit = 10) {
        return new Promise((resolve, reject) => {
            const sql = `
        SELECT * FROM rule_execution_log
        WHERE rule_id LIKE 'RULE-AI-TEST-%'
        ORDER BY executed_at DESC
        LIMIT ?
      `;

            this.db.all(sql, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

module.exports = AITestRuleExecutor;





