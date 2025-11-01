/**
 * 🛡️ 柳芯系统 - 修改防护系统 v1.0
 * 目的：彻底解决"修复A功能时破坏B功能"的问题
 * 
 * 三层防护：
 * 1. Pre-Check：修改前范围验证
 * 2. During-Check：修改时实时监控
 * 3. Post-Check：修改后自动回归测试
 */

const fs = require('fs');
const path = require('path');

class ModificationProtectionSystem {
    constructor() {
        this.currentTask = null;
        this.allowedFiles = new Set();
        this.modifiedFiles = new Map(); // 文件路径 -> 修改次数
        this.violations = [];
        this.enabled = true;

        console.error('🛡️ [ModificationProtection] 修改防护系统已初始化');
    }

    /**
     * 🔒 第一层：修改前范围验证
     * @param {object} task - 任务描述
     * @param {array} filesToModify - 计划修改的文件列表
     * @returns {object} { allowed: boolean, message: string }
     */
    validateScope(task, filesToModify) {
        if (!this.enabled) {
            return { allowed: true, message: '防护系统已禁用' };
        }

        console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('🛡️ [Pre-Check] 修改范围验证');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // 记录当前任务
        this.currentTask = {
            description: task.description || '未指定',
            targetFiles: task.targetFiles || [],
            timestamp: new Date().toISOString()
        };

        // 验证文件数量
        if (filesToModify.length > 5) {
            const warning = `⚠️ 警告：计划修改 ${filesToModify.length} 个文件，可能影响范围过大！`;
            console.error(warning);
            console.error('   建议：将任务拆分为多个小任务');

            return {
                allowed: false,
                message: warning,
                recommendation: '请确认是否真的需要修改这么多文件，或考虑拆分任务'
            };
        }

        // 设置允许的文件列表
        this.allowedFiles = new Set(filesToModify);

        console.error('✅ 当前任务：', task.description);
        console.error('✅ 允许修改的文件：');
        filesToModify.forEach(file => {
            console.error(`   - ${path.basename(file)}`);
        });
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        return { allowed: true, message: '范围验证通过' };
    }

    /**
     * 🔍 第二层：修改时实时监控
     * @param {string} filePath - 被修改的文件路径
     * @param {string} operation - 操作类型（write/search_replace/delete）
     * @returns {object} { allowed: boolean, message: string }
     */
    checkModification(filePath, operation = 'write') {
        if (!this.enabled) {
            return { allowed: true };
        }

        const normalizedPath = path.normalize(filePath);
        const fileName = path.basename(filePath);

        // 检查是否在允许列表中
        const isAllowed = Array.from(this.allowedFiles).some(allowedFile =>
            normalizedPath.includes(allowedFile) || allowedFile.includes(fileName)
        );

        // 记录修改
        if (!this.modifiedFiles.has(normalizedPath)) {
            this.modifiedFiles.set(normalizedPath, 0);
        }
        this.modifiedFiles.set(normalizedPath, this.modifiedFiles.get(normalizedPath) + 1);

        if (!isAllowed) {
            // 🚨 越界修改！
            const violation = {
                file: normalizedPath,
                operation,
                timestamp: new Date().toISOString(),
                task: this.currentTask?.description || '未知任务'
            };
            this.violations.push(violation);

            console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('🚨 [During-Check] 检测到越界修改！');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error(`❌ 文件：${fileName}`);
            console.error(`❌ 操作：${operation}`);
            console.error(`❌ 当前任务：${this.currentTask?.description || '未知'}`);
            console.error('❌ 此文件不在允许修改的范围内！');
            console.error('\n📋 允许修改的文件：');
            this.allowedFiles.forEach(file => {
                console.error(`   - ${path.basename(file)}`);
            });
            console.error('\n🛑 修改已被阻止！请只修改任务相关的文件。');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            return {
                allowed: false,
                message: `越界修改：${fileName} 不在允许范围内`,
                violation: violation
            };
        }

        // 允许修改
        console.error(`✅ [During-Check] 允许修改: ${fileName} (${operation})`);
        return { allowed: true };
    }

    /**
     * 📊 第三层：修改后验证
     * @returns {object} 修改报告
     */
    generateReport() {
        const report = {
            task: this.currentTask,
            totalModifications: this.modifiedFiles.size,
            modifiedFiles: Array.from(this.modifiedFiles.entries()).map(([file, count]) => ({
                file: path.basename(file),
                fullPath: file,
                modificationCount: count
            })),
            violations: this.violations,
            hasViolations: this.violations.length > 0,
            timestamp: new Date().toISOString()
        };

        console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('📊 [Post-Check] 修改报告');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error(`任务：${this.currentTask?.description || '未知'}`);
        console.error(`修改文件数：${report.totalModifications}`);

        if (report.modifiedFiles.length > 0) {
            console.error('\n修改的文件：');
            report.modifiedFiles.forEach(item => {
                console.error(`   - ${item.file} (修改${item.modificationCount}次)`);
            });
        }

        if (report.hasViolations) {
            console.error('\n⚠️ 发现越界修改：');
            report.violations.forEach(v => {
                console.error(`   ❌ ${path.basename(v.file)} (${v.operation})`);
            });
        } else {
            console.error('\n✅ 无越界修改');
        }
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        return report;
    }

    /**
     * 🔄 重置防护系统（开始新任务）
     */
    reset() {
        this.currentTask = null;
        this.allowedFiles.clear();
        this.modifiedFiles.clear();
        this.violations = [];
        console.error('🔄 [ModificationProtection] 防护系统已重置');
    }

    /**
     * 🚫 启用/禁用防护系统
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        console.error(`🛡️ [ModificationProtection] 防护系统已${enabled ? '启用' : '禁用'}`);
    }

    /**
     * 📝 获取违规历史
     */
    getViolationHistory() {
        return this.violations;
    }

    /**
     * 💾 保存报告到文件
     */
    saveReport(outputPath) {
        const report = this.generateReport();
        const reportPath = outputPath || path.join(__dirname, 'modification-report.json');

        try {
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
            console.error(`✅ 报告已保存：${reportPath}`);
            return { success: true, path: reportPath };
        } catch (err) {
            console.error(`❌ 保存报告失败：${err.message}`);
            return { success: false, error: err.message };
        }
    }
}

// 导出单例
let instance = null;

module.exports = {
    getInstance: function () {
        if (!instance) {
            instance = new ModificationProtectionSystem();
        }
        return instance;
    },
    ModificationProtectionSystem: ModificationProtectionSystem
};

