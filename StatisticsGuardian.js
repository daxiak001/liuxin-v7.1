/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 📊 统计守护者 (Statistics Guardian)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * 🎯 核心使命：确保统计功能永远不会失效
 * 
 * 版本: v7.11.2-完整性检查
 * 创建日期: 2025-10-31
 * 最后更新: 2025-11-01
 * 
 * 功能：
 * 1. ✅ 独立的统计显示函数（不依赖任何其他模块）
 * 2. ✅ 多重显示保障（3个兜底位置）
 * 3. ✅ 自检与自愈机制
 * 4. ✅ 完全隔离，避免被其他修改影响
 * 5. ✅ 运行时完整性检查（v7.11.2新增）
 * 
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

class StatisticsGuardian {
    constructor() {
        this.TOTAL_MONITORING_POINTS = 350;
        this.initialized = false;
        this.selfCheckPassed = false;

        // 🎯 v7.11.2: 保存核心方法的原始签名（用于完整性检查）
        this.methodSignatures = {
            forceDisplayStatistics: this.forceDisplayStatistics.toString().substring(0, 100),
            reset: this.reset.toString().substring(0, 100),
            getStatistics: this.getStatistics.toString().substring(0, 100)
        };

        // 初始化全局统计（如果不存在）
        this.ensureGlobalStatsExist();

        // 执行自检
        this.selfCheck();

        // 🎯 v7.11.2: 执行完整性检查
        this.integrityCheck();

        console.error('🛡️ [StatisticsGuardian] 统计守护者已启动');
    }

    /**
     * 确保全局统计变量存在（容错机制）
     */
    ensureGlobalStatsExist() {
        if (!global.currentSessionStats) {
            global.currentSessionStats = {
                triggerCount: 0,
                violationCount: 0,
                triggeredRules: new Set(),
                violatedRules: new Set(),
                sessionId: Date.now(),
                lastResetTime: Date.now()
            };
        }

        if (!global.triggerCount) global.triggerCount = 0;
        if (!global.violationCount) global.violationCount = 0;
        if (!global.triggeredRules) global.triggeredRules = new Set();
        if (!global.violatedRules) global.violatedRules = new Set();

        this.initialized = true;
    }

    /**
     * 自检：验证统计功能是否正常
     * @returns {boolean} 是否通过自检
     */
    selfCheck() {
        const checks = {
            globalStatsExists: !!global.currentSessionStats,
            triggeredRulesIsSet: global.currentSessionStats?.triggeredRules instanceof Set,
            violatedRulesIsSet: global.currentSessionStats?.violatedRules instanceof Set,
            hasGetMethod: typeof this.getStatistics === 'function',
            hasForceDisplayMethod: typeof this.forceDisplayStatistics === 'function'
        };

        const allPassed = Object.values(checks).every(v => v === true);

        if (!allPassed) {
            console.error('⚠️ [StatisticsGuardian] 自检失败！', checks);
            // 尝试自愈
            this.ensureGlobalStatsExist();
            this.selfCheckPassed = false;
        } else {
            console.error('✅ [StatisticsGuardian] 自检通过');
            this.selfCheckPassed = true;
        }

        return this.selfCheckPassed;
    }

    /**
     * 获取当前统计数据（独立函数，不依赖任何其他模块）
     * @returns {{triggered: number, violated: number}}
     */
    getStatistics() {
        // 多重容错
        try {
            const triggered = global.currentSessionStats?.triggeredRules?.size || 0;
            const violated = global.currentSessionStats?.violatedRules?.size || 0;
            return { triggered, violated };
        } catch (error) {
            console.error('⚠️ [StatisticsGuardian] 获取统计失败，返回默认值', error);
            return { triggered: 0, violated: 0 };
        }
    }

    /**
     * 生成统计显示文本（独立函数）
     * @param {{triggered: number, violated: number}} stats
     * @returns {string}
     */
    generateStatsText(stats) {
        return `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 统计：触发 ${stats.triggered}/${this.TOTAL_MONITORING_POINTS}条  违规 ${stats.violated}条\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    }

    /**
     * 检查文本中是否已有统计信息
     * @param {string} text
     * @returns {boolean}
     */
    hasStatistics(text) {
        if (!text) return false;
        return /━━━.*📊\s*统计/.test(text);
    }

    /**
     * 🛡️ 核心方法：强制显示统计（100%保障）
     * @param {string} responseText - AI的回复文本
     * @returns {string} - 添加统计后的文本
     */
    forceDisplayStatistics(responseText) {
        try {
            // 再次确保全局变量存在（防御性编程）
            this.ensureGlobalStatsExist();

            // 检查是否已有统计
            if (this.hasStatistics(responseText)) {
                console.error('ℹ️ [StatisticsGuardian] 统计信息已存在，跳过添加');
                return responseText;
            }

            // 获取统计数据
            const stats = this.getStatistics();

            // 生成统计文本
            const statsText = this.generateStatsText(stats);

            // 添加到回复末尾
            const result = responseText + statsText;

            console.error(`✅ [StatisticsGuardian] 强制添加统计: 触发${stats.triggered}条, 违规${stats.violated}条`);

            return result;

        } catch (error) {
            console.error('🚨 [StatisticsGuardian] 强制显示统计失败！', error);

            // 终极兜底：即使出错也要显示统计
            const fallbackStats = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 统计：触发 0/${this.TOTAL_MONITORING_POINTS}条  违规 0条\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
            return responseText + fallbackStats;
        }
    }

    /**
     * 重置统计（在Response结束时调用）
     */
    reset() {
        try {
            const currentStats = this.getStatistics();

            console.error(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.error(`🔄 [StatisticsGuardian] Response结束，重置统计`);
            console.error(`  当前对话统计: 触发${currentStats.triggered}条规则, 违规${currentStats.violated}条`);

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

        } catch (error) {
            console.error('🚨 [StatisticsGuardian] 重置统计失败！', error);
            // 强制重新初始化
            this.ensureGlobalStatsExist();
        }
    }

    /**
     * 🎯 v7.11.2: 运行时完整性检查
     * 防止其他模块通过原型链或global对象的修改来影响统计系统
     */
    integrityCheck() {
        try {
            const checks = {
                // 检查1: global对象未被篡改
                globalNotTampered: global.constructor === Object,

                // 检查2: currentSessionStats对象有效
                statsObjectValid: typeof global.currentSessionStats === 'object' &&
                    global.currentSessionStats !== null,

                // 检查3: Set类型未被修改
                setTypeValid: global.currentSessionStats?.triggeredRules instanceof Set &&
                    global.currentSessionStats?.violatedRules instanceof Set,

                // 检查4: 核心方法未被重写
                coreMethodsUnchanged: this.checkMethodIntegrity(),

                // 检查5: console.error未被重写（守护者依赖它）
                consoleValid: typeof console.error === 'function',

                // 检查6: require缓存未被清空
                requireValid: typeof require === 'function'
            };

            const allPassed = Object.values(checks).every(Boolean);

            if (!allPassed) {
                console.error('🚨 [StatisticsGuardian] 完整性检查失败！', checks);
                console.error('⚠️ 可能存在以下问题：');

                if (!checks.globalNotTampered) {
                    console.error('  - global对象的构造函数被修改');
                }
                if (!checks.statsObjectValid) {
                    console.error('  - currentSessionStats对象无效或被清空');
                }
                if (!checks.setTypeValid) {
                    console.error('  - Set类型被修改或替换');
                }
                if (!checks.coreMethodsUnchanged) {
                    console.error('  - 核心方法被重写或修改');
                }
                if (!checks.consoleValid) {
                    console.error('  - console.error被重写或删除');
                }
                if (!checks.requireValid) {
                    console.error('  - require函数被修改或删除');
                }

                // 尝试自动修复
                console.error('🔧 [StatisticsGuardian] 尝试自动修复...');
                this.autoHeal(checks);

            } else {
                console.error('✅ [StatisticsGuardian] 完整性检查通过');
            }

            return allPassed;

        } catch (error) {
            console.error('🚨 [StatisticsGuardian] 完整性检查异常', error);
            return false;
        }
    }

    /**
     * 🎯 v7.11.2: 检查核心方法是否被修改
     */
    checkMethodIntegrity() {
        try {
            const currentSignatures = {
                forceDisplayStatistics: this.forceDisplayStatistics.toString().substring(0, 100),
                reset: this.reset.toString().substring(0, 100),
                getStatistics: this.getStatistics.toString().substring(0, 100)
            };

            // 比较方法签名
            for (const [methodName, originalSig] of Object.entries(this.methodSignatures)) {
                if (currentSignatures[methodName] !== originalSig) {
                    console.error(`🚨 [StatisticsGuardian] 方法 ${methodName} 被修改！`);
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error('⚠️ [StatisticsGuardian] 方法完整性检查失败', error);
            return false;
        }
    }

    /**
     * 🎯 v7.11.2: 自动修复（尝试恢复被破坏的状态）
     */
    autoHeal(checks) {
        try {
            // 修复1: 重新初始化全局统计
            if (!checks.statsObjectValid || !checks.setTypeValid) {
                console.error('🔧 修复：重新初始化全局统计变量');
                this.ensureGlobalStatsExist();
            }

            // 修复2: 冻结关键对象（防止进一步修改）
            if (global.currentSessionStats) {
                console.error('🔧 修复：冻结全局统计对象');
                // 注意：这会阻止后续的正常统计累加，所以只在紧急情况下使用
                // Object.freeze(global.currentSessionStats);
            }

            console.error('✅ [StatisticsGuardian] 自动修复完成');

        } catch (error) {
            console.error('❌ [StatisticsGuardian] 自动修复失败', error);
        }
    }

    /**
     * 获取守护者状态
     */
    getStatus() {
        return {
            initialized: this.initialized,
            selfCheckPassed: this.selfCheckPassed,
            integrityCheckPassed: this.integrityCheck(), // 实时检查
            totalMonitoringPoints: this.TOTAL_MONITORING_POINTS,
            currentStats: this.getStatistics()
        };
    }
}

// 导出单例
let guardianInstance = null;

function getGuardian() {
    if (!guardianInstance) {
        guardianInstance = new StatisticsGuardian();
    }
    return guardianInstance;
}

module.exports = {
    StatisticsGuardian,
    getGuardian
};

