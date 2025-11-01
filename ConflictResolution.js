/**
 * 规则冲突解决引擎
 * 实现5种冲突解决策略
 */

class ConflictResolution {
    constructor(db) {
        this.db = db;
        this.strategies = {
            'override': this.strategyOverride.bind(this),
            'merge': this.strategyMerge.bind(this),
            'highest_priority': this.strategyHighestPriority.bind(this),
            'first_match': this.strategyFirstMatch.bind(this),
            'custom': this.strategyCustom.bind(this)
        };
    }

    /**
     * 解决规则冲突
     * @param {Array} conflictingRules - 冲突的规则列表
     * @param {Object} context - 上下文信息
     * @returns {Object} 解决结果
     */
    async resolve(conflictingRules, context = {}) {
        if (!conflictingRules || conflictingRules.length === 0) {
            return { success: false, message: '没有冲突规则' };
        }

        if (conflictingRules.length === 1) {
            return {
                success: true,
                resolved_rule: conflictingRules[0],
                strategy_used: 'no_conflict',
                message: '无冲突'
            };
        }

        console.log(`🔍 检测到${conflictingRules.length}条规则冲突`);

        // 按conflict_group分组
        const groups = this.groupByConflictGroup(conflictingRules);

        // 如果只有一个组，直接解决
        if (Object.keys(groups).length === 1) {
            return await this.resolveGroup(conflictingRules, context);
        }

        // 多组冲突：按组优先级解决
        const resolvedRules = [];
        for (const [groupName, rules] of Object.entries(groups)) {
            const result = await this.resolveGroup(rules, context);
            if (result.success && result.resolved_rule) {
                resolvedRules.push(result.resolved_rule);
            }
        }

        // 如果有多个组的解决结果，再次按优先级排序
        if (resolvedRules.length > 1) {
            resolvedRules.sort((a, b) => (b.conflict_priority || 5) - (a.conflict_priority || 5));
        }

        return {
            success: true,
            resolved_rule: resolvedRules[0],
            all_resolved: resolvedRules,
            strategy_used: 'multi_group_resolution',
            message: `多组冲突解决，最终选择优先级最高的规则：${resolvedRules[0].rule_code}`
        };
    }

    /**
     * 解决单组内的冲突
     */
    async resolveGroup(rules, context) {
        // 检查是否所有规则使用相同策略
        const strategies = [...new Set(rules.map(r => r.conflict_strategy || 'override'))];

        if (strategies.length === 1) {
            // 所有规则使用相同策略
            const strategy = strategies[0];
            return await this.applyStrategy(strategy, rules, context);
        }

        // 不同策略：优先级最高的策略决定
        rules.sort((a, b) => (b.conflict_priority || 5) - (a.conflict_priority || 5));
        const primaryRule = rules[0];
        const strategy = primaryRule.conflict_strategy || 'override';

        return await this.applyStrategy(strategy, rules, context);
    }

    /**
     * 应用冲突解决策略
     */
    async applyStrategy(strategyName, rules, context) {
        const strategyFunc = this.strategies[strategyName];

        if (!strategyFunc) {
            console.warn(`⚠️ 未知策略: ${strategyName}，回退到override`);
            return await this.strategyOverride(rules, context);
        }

        return await strategyFunc(rules, context);
    }

    /**
     * 策略1: 覆盖 - 后者覆盖前者
     */
    async strategyOverride(rules, context) {
        const resolvedRule = rules[rules.length - 1]; // 取最后一条

        return {
            success: true,
            resolved_rule: resolvedRule,
            strategy_used: 'override',
            message: `覆盖策略：使用最后匹配的规则 ${resolvedRule.rule_code}`
        };
    }

    /**
     * 策略2: 合并 - 合并所有规则的效果
     */
    async strategyMerge(rules, context) {
        // 合并规则：创建一个虚拟规则，包含所有规则的条件
        const mergedRule = {
            rule_code: `MERGED_${rules.map(r => r.rule_code).join('_')}`,
            rule_name: '合并规则',
            category: rules[0].category,
            severity: this.getMostSevereSeverity(rules),
            conflict_strategy: 'merge',
            conflict_priority: Math.max(...rules.map(r => r.conflict_priority || 5)),
            merged_from: rules.map(r => r.rule_code),
            rule_details: JSON.stringify({
                action: 'block',
                message: `综合检查：${rules.map(r => r.rule_name).join('、')}`,
                merged_conditions: rules.map(r => {
                    try {
                        return JSON.parse(r.rule_details || '{}');
                    } catch {
                        return {};
                    }
                })
            })
        };

        return {
            success: true,
            resolved_rule: mergedRule,
            strategy_used: 'merge',
            message: `合并策略：合并${rules.length}条规则`
        };
    }

    /**
     * 策略3: 最高优先级 - 选择优先级最高的规则
     */
    async strategyHighestPriority(rules, context) {
        rules.sort((a, b) => (b.conflict_priority || 5) - (a.conflict_priority || 5));
        const resolvedRule = rules[0];

        return {
            success: true,
            resolved_rule: resolvedRule,
            strategy_used: 'highest_priority',
            message: `优先级策略：选择优先级最高(${resolvedRule.conflict_priority})的规则 ${resolvedRule.rule_code}`
        };
    }

    /**
     * 策略4: 第一匹配 - 使用第一个匹配的规则
     */
    async strategyFirstMatch(rules, context) {
        const resolvedRule = rules[0];

        return {
            success: true,
            resolved_rule: resolvedRule,
            strategy_used: 'first_match',
            message: `第一匹配策略：使用第一个匹配的规则 ${resolvedRule.rule_code}`
        };
    }

    /**
     * 策略5: 自定义 - 根据rule_details中的custom_resolution函数决定
     */
    async strategyCustom(rules, context) {
        // 查找包含custom_resolution的规则
        for (const rule of rules) {
            try {
                const details = JSON.parse(rule.rule_details || '{}');
                if (details.custom_resolution) {
                    // 评估自定义解决逻辑
                    const resolutionFunc = new Function('rules', 'context', details.custom_resolution);
                    const selectedRule = resolutionFunc(rules, context);

                    if (selectedRule) {
                        return {
                            success: true,
                            resolved_rule: selectedRule,
                            strategy_used: 'custom',
                            message: `自定义策略：使用规则 ${selectedRule.rule_code}`
                        };
                    }
                }
            } catch (error) {
                console.error(`自定义策略执行失败: ${rule.rule_code}`, error);
            }
        }

        // 自定义策略失败，回退到highest_priority
        console.warn('⚠️ 自定义策略失败，回退到highest_priority');
        return await this.strategyHighestPriority(rules, context);
    }

    /**
     * 按conflict_group分组
     */
    groupByConflictGroup(rules) {
        const groups = {};

        rules.forEach(rule => {
            const group = rule.conflict_group || 'default';
            if (!groups[group]) {
                groups[group] = [];
            }
            groups[group].push(rule);
        });

        return groups;
    }

    /**
     * 获取最严重的severity
     */
    getMostSevereSeverity(rules) {
        const severityOrder = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
        let maxSeverity = 'LOW';
        let maxScore = 1;

        rules.forEach(rule => {
            const severity = rule.severity || 'LOW';
            const score = severityOrder[severity] || 1;
            if (score > maxScore) {
                maxScore = score;
                maxSeverity = severity;
            }
        });

        return maxSeverity;
    }

    /**
     * 记录冲突解决日志
     */
    async logConflictResolution(conflictingRules, resolution, context) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            conflict_count: conflictingRules.length,
            conflicting_rules: conflictingRules.map(r => r.rule_code),
            strategy_used: resolution.strategy_used,
            resolved_rule: resolution.resolved_rule?.rule_code,
            context: JSON.stringify(context)
        };

        return new Promise((resolve) => {
            this.db.run(
                `INSERT INTO rule_conflict_logs (timestamp, conflict_count, conflicting_rules, strategy_used, resolved_rule, context) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    logEntry.timestamp,
                    logEntry.conflict_count,
                    JSON.stringify(logEntry.conflicting_rules),
                    logEntry.strategy_used,
                    logEntry.resolved_rule,
                    logEntry.context
                ],
                (err) => {
                    if (err && !err.message.includes('no such table')) {
                        console.error('记录冲突日志失败:', err);
                    }
                    resolve();
                }
            );
        });
    }
}

module.exports = ConflictResolution;

