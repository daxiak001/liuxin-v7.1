/**
 * 标准化锁定系统 v1.0.0
 * 
 * 目的: 彻底解决"每次锁定都遗漏"的问题
 * 
 * 核心功能:
 * 1. 标准化锁定流程（7步检查法）
 * 2. 自动化全面扫描
 * 3. 多维度交叉验证
 * 4. 生成完整报告和修复建议
 * 
 * 使用方法:
 *   node locks/StandardLockingSystem.js --module statistics
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

class StandardLockingSystem {
    constructor() {
        this.projectRoot = path.join(__dirname, '..');
        this.locksDir = __dirname;
        this.dbPath = path.join(this.projectRoot, 'liuxin.db');

        // 统计模块的完整定义（边界清晰）
        this.MODULE_DEFINITIONS = {
            statistics: {
                name: '统计模块',
                description: '触发和违规的统计、展示、重置功能',
                keywords: [
                    'triggerCount', 'violationCount',
                    'currentSessionStats', 'triggeredRules', 'violatedRules',
                    'lastUserInput', 'lastToolCallTime', 'forceResetStats',
                    '统计', 'statistics', 'getStatisticsFromDB',
                    'RULE-007', 'IR-005', 'intercept_stats',
                    '触发.*条', '违规.*条', 'trigger_count', 'violation_count'
                ],
                files: [
                    'liuxin-mcp-server-unified.js',
                    'ResponseInterceptor.js',
                    'locks/lock-config.json',
                    'locks/LockManager.js',
                    'locks/UnlockCommandHandler.js',
                    '统计模块锁定.flag',
                    'locks/统计模块.flag'
                ],
                dbTables: ['liuxin_mcp_interceptor_rules', 'liuxin_mcp_interceptor_logs'],
                globalVariables: [
                    'global.triggerCount',
                    'global.violationCount',
                    'global.currentSessionStats',
                    'global.triggeredRules',
                    'global.violatedRules',
                    'global.lastUserInput',
                    'global.lastToolCallTime',
                    'global.forceResetStats'
                ],
                criticalFunctions: [
                    'handleToolCall',
                    'logInterception',
                    'intercept',
                    'getStatisticsFromDB',
                    'addStatisticsToResponse'
                ]
            }
        };

        this.results = {
            module: '',
            timestamp: new Date().toISOString(),
            checks: [],
            warnings: [],
            errors: [],
            fixSuggestions: []
        };
    }

    /**
     * 标准化锁定流程 - 7步检查法
     */
    async performStandardLocking(moduleName) {
        console.log(`\n🔒 开始标准化锁定检查: ${moduleName}`);
        console.log('='.repeat(80));

        const module = this.MODULE_DEFINITIONS[moduleName];
        if (!module) {
            throw new Error(`未定义的模块: ${moduleName}`);
        }

        this.results.module = moduleName;

        // 第1步: 代码范围扫描
        await this.step1_scanCodeRanges(module);

        // 第2步: 全局变量检查
        await this.step2_checkGlobalVariables(module);

        // 第3步: 函数和方法检查
        await this.step3_checkFunctionsAndMethods(module);

        // 第4步: 配置文件验证
        await this.step4_verifyConfigFiles(module);

        // 第5步: 锁定标记验证
        await this.step5_verifyLockMarkers(module);

        // 第6步: 数据库保护验证
        await this.step6_verifyDatabaseProtection(module);

        // 第7步: 交叉验证
        await this.step7_crossValidation(module);

        // 生成报告
        this.generateReport();
    }

    /**
     * 第1步: 代码范围扫描 - 找出所有相关代码
     */
    async step1_scanCodeRanges(module) {
        console.log('\n📋 第1步: 代码范围扫描');

        const codeRanges = [];

        for (const file of module.files) {
            const filePath = path.join(this.projectRoot, file);
            if (!fs.existsSync(filePath)) {
                this.results.warnings.push({
                    step: 1,
                    type: 'file_not_found',
                    file,
                    message: `文件不存在: ${file}`
                });
                continue;
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');

            // 多关键词匹配
            for (let i = 0; i < lines.length; i++) {
                for (const keyword of module.keywords) {
                    const regex = new RegExp(keyword, 'gi');
                    if (regex.test(lines[i])) {
                        // 找到匹配行，扩展上下文范围（前后10行）
                        const start = Math.max(0, i - 10);
                        const end = Math.min(lines.length - 1, i + 10);

                        codeRanges.push({
                            file,
                            keyword,
                            matchLine: i + 1,
                            start: start + 1,
                            end: end + 1,
                            context: lines.slice(start, end + 1).join('\n')
                        });
                    }
                }
            }
        }

        console.log(`   ✅ 扫描完成，发现 ${codeRanges.length} 个代码范围`);

        this.results.checks.push({
            step: 1,
            name: '代码范围扫描',
            status: 'completed',
            foundRanges: codeRanges.length,
            details: codeRanges
        });

        return codeRanges;
    }

    /**
     * 第2步: 全局变量检查
     */
    async step2_checkGlobalVariables(module) {
        console.log('\n📋 第2步: 全局变量检查');

        try {
            const lockConfig = this.loadLockConfig();
            const protectedGlobals = lockConfig.modules[this.results.module]?.protected_functions || [];

            const missingGlobals = [];
            for (const globalVar of module.globalVariables) {
                if (!protectedGlobals.includes(globalVar)) {
                    missingGlobals.push(globalVar);
                    this.results.warnings.push({
                        step: 2,
                        type: 'unprotected_global',
                        variable: globalVar,
                        message: `全局变量未受保护: ${globalVar}`
                    });
                }
            }

            console.log(`   ✅ 检查完成，${missingGlobals.length > 0 ? '发现' + missingGlobals.length + '个未保护变量' : '全部变量已保护'}`);

            this.results.checks.push({
                step: 2,
                name: '全局变量检查',
                status: missingGlobals.length === 0 ? 'pass' : 'warning',
                totalGlobals: module.globalVariables.length,
                protectedGlobals: protectedGlobals.length,
                missingGlobals
            });
        } catch (error) {
            console.error(`❌ 检查失败: ${error.message}`);
            this.results.errors.push({
                step: 2,
                type: 'check_error',
                message: error.message
            });
        }
    }

    /**
     * 第3步: 函数和方法检查
     */
    async step3_checkFunctionsAndMethods(module) {
        console.log('\n📋 第3步: 函数和方法检查');

        const functionChecks = [];

        for (const file of module.files.filter(f => f.endsWith('.js'))) {
            const filePath = path.join(this.projectRoot, file);
            if (!fs.existsSync(filePath)) continue;

            const content = fs.readFileSync(filePath, 'utf-8');

            for (const funcName of module.criticalFunctions) {
                // 检查函数是否存在
                const funcRegex = new RegExp(`(async\\s+)?${funcName}\\s*\\(`, 'g');
                const matches = content.match(funcRegex);

                if (matches) {
                    functionChecks.push({
                        file,
                        function: funcName,
                        found: true,
                        occurrences: matches.length
                    });
                }
            }
        }

        console.log(`   ✅ 检查完成，发现 ${functionChecks.length} 个关键函数`);

        this.results.checks.push({
            step: 3,
            name: '函数和方法检查',
            status: 'completed',
            details: functionChecks
        });
    }

    /**
     * 第4步: 配置文件验证
     */
    async step4_verifyConfigFiles(module) {
        console.log('\n📋 第4步: 配置文件验证');

        const lockConfigPath = path.join(this.locksDir, 'lock-config.json');

        if (!fs.existsSync(lockConfigPath)) {
            this.errors.push({
                step: 4,
                type: 'config_missing',
                message: 'lock-config.json 文件不存在'
            });
            return;
        }

        const lockConfig = JSON.parse(fs.readFileSync(lockConfigPath, 'utf-8'));
        const moduleConfig = lockConfig.modules[this.results.module];

        if (!moduleConfig) {
            this.errors.push({
                step: 4,
                type: 'module_not_in_config',
                message: `模块 ${this.results.module} 不在 lock-config.json 中`
            });
            return;
        }

        // 验证必要字段
        const requiredFields = ['version', 'locked', 'protected_files', 'protected_ranges'];
        const missingFields = requiredFields.filter(field => !moduleConfig[field]);

        if (missingFields.length > 0) {
            this.results.warnings.push({
                step: 4,
                type: 'missing_config_fields',
                fields: missingFields,
                message: `配置缺少必要字段: ${missingFields.join(', ')}`
            });
        }

        // 验证 lock_level
        if (moduleConfig.lock_level !== 'ULTIMATE') {
            this.results.warnings.push({
                step: 4,
                type: 'lock_level_not_ultimate',
                currentLevel: moduleConfig.lock_level,
                message: '锁定级别不是 ULTIMATE'
            });
        }

        console.log(`   ✅ 配置验证完成`);

        this.results.checks.push({
            step: 4,
            name: '配置文件验证',
            status: missingFields.length === 0 ? 'pass' : 'warning',
            config: moduleConfig
        });
    }

    /**
     * 第5步: 锁定标记验证
     */
    async step5_verifyLockMarkers(module) {
        console.log('\n📋 第5步: 锁定标记验证');

        const markers = {
            flagFiles: [],
            codeComments: []
        };

        // 检查 .flag 文件
        const flagFiles = [
            '统计模块锁定.flag',
            'locks/统计模块.flag'
        ];

        for (const flagFile of flagFiles) {
            const flagPath = path.join(this.projectRoot, flagFile);
            if (fs.existsSync(flagPath)) {
                const content = fs.readFileSync(flagPath, 'utf-8');
                markers.flagFiles.push({
                    file: flagFile,
                    exists: true,
                    hasUltimateWarning: content.includes('终极锁定') || content.includes('ULTIMATE'),
                    hasForbiddenTag: content.includes('绝对禁止')
                });
            } else {
                markers.flagFiles.push({
                    file: flagFile,
                    exists: false
                });
                this.results.warnings.push({
                    step: 5,
                    type: 'flag_file_missing',
                    file: flagFile,
                    message: `Flag文件不存在: ${flagFile}`
                });
            }
        }

        // 检查代码注释
        const lockConfig = this.loadLockConfig();
        const protectedRangesObj = lockConfig.modules[this.results.module]?.protected_ranges || {};

        // protected_ranges 是一个对象，key是文件名，value是范围数组
        for (const [fileName, ranges] of Object.entries(protectedRangesObj)) {
            const filePath = path.join(this.projectRoot, fileName);
            if (!fs.existsSync(filePath)) continue;

            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');

            for (const range of ranges) {
                // 检查保护范围前是否有"终极锁定警告"注释
                let hasWarningComment = false;
                const checkStart = Math.max(0, range.start - 5);
                for (let i = checkStart; i < range.start; i++) {
                    if (lines[i] && (lines[i].includes('终极锁定警告') || lines[i].includes('ULTIMATE LOCK'))) {
                        hasWarningComment = true;
                        break;
                    }
                }

                markers.codeComments.push({
                    file: fileName,
                    range: `${range.start}-${range.end}`,
                    hasWarningComment,
                    description: range.description
                });

                if (!hasWarningComment) {
                    this.results.warnings.push({
                        step: 5,
                        type: 'missing_warning_comment',
                        file: fileName,
                        range: `${range.start}-${range.end}`,
                        message: `代码范围缺少"终极锁定警告"注释`
                    });
                }
            }
        }

        console.log(`   ✅ 标记验证完成`);

        this.results.checks.push({
            step: 5,
            name: '锁定标记验证',
            status: 'completed',
            markers
        });
    }

    /**
     * 第6步: 数据库保护验证
     */
    async step6_verifyDatabaseProtection(module) {
        console.log('\n📋 第6步: 数据库保护验证');

        if (!fs.existsSync(this.dbPath)) {
            this.results.warnings.push({
                step: 6,
                type: 'database_not_found',
                message: '数据库文件不存在'
            });
            return;
        }

        try {
            const db = new Database(this.dbPath, { readonly: true });

            // 检查统计相关规则
            const rules = db.prepare(`
                SELECT rule_id, description, detection_pattern, intercept_action
                FROM liuxin_mcp_interceptor_rules
                WHERE rule_id IN ('RULE-007', 'IR-005')
            `).all();

            if (rules.length === 0) {
                this.results.warnings.push({
                    step: 6,
                    type: 'statistics_rules_missing',
                    message: 'RULE-007 或 IR-005 不存在'
                });
            }

            // 检查是否有保护触发器（如果有的话）
            const triggers = db.prepare(`
                SELECT name, sql 
                FROM sqlite_master 
                WHERE type='trigger' AND (
                    name LIKE '%statistics%' OR 
                    sql LIKE '%RULE-007%' OR 
                    sql LIKE '%IR-005%'
                )
            `).all();

            db.close();

            console.log(`   ✅ 数据库验证完成`);

            this.results.checks.push({
                step: 6,
                name: '数据库保护验证',
                status: 'completed',
                rules: rules.length,
                triggers: triggers.length
            });
        } catch (error) {
            this.results.errors.push({
                step: 6,
                type: 'database_error',
                message: `数据库检查失败: ${error.message}`
            });
        }
    }

    /**
     * 第7步: 交叉验证 - 确保所有检查结果一致
     */
    async step7_crossValidation(module) {
        console.log('\n📋 第7步: 交叉验证');

        const lockConfig = this.loadLockConfig();
        const moduleConfig = lockConfig.modules[this.results.module];

        if (!moduleConfig) {
            this.results.errors.push({
                step: 7,
                type: 'no_module_config',
                message: '无法进行交叉验证，模块配置缺失'
            });
            return;
        }

        // 交叉验证1: protected_files vs 实际扫描的文件
        const configFiles = new Set(moduleConfig.protected_files || []);
        const actualFiles = new Set(module.files);

        const missingInConfig = [...actualFiles].filter(f => !configFiles.has(f));
        const extraInConfig = [...configFiles].filter(f => !actualFiles.has(f));

        if (missingInConfig.length > 0) {
            this.results.warnings.push({
                step: 7,
                type: 'files_not_in_config',
                files: missingInConfig,
                message: `这些文件在模块定义中但不在lock-config.json中: ${missingInConfig.join(', ')}`
            });
        }

        // 交叉验证2: protected_ranges 覆盖率
        const step1Result = this.results.checks.find(c => c.step === 1);
        if (step1Result) {
            const foundRanges = step1Result.details || [];
            const protectedRangesObj = moduleConfig.protected_ranges || {};

            // 检查是否所有发现的范围都被保护
            for (const found of foundRanges) {
                // 获取该文件的保护范围数组
                const fileProtectedRanges = protectedRangesObj[found.file] || [];

                const isProtected = fileProtectedRanges.some(pr =>
                    pr.start <= found.start &&
                    pr.end >= found.end
                );

                if (!isProtected) {
                    this.results.warnings.push({
                        step: 7,
                        type: 'unprotected_code_range',
                        file: found.file,
                        line: found.matchLine,
                        keyword: found.keyword,
                        message: `发现未保护的代码范围: ${found.file}:${found.matchLine} (关键词: ${found.keyword})`
                    });
                }
            }
        }

        console.log(`   ✅ 交叉验证完成`);

        this.results.checks.push({
            step: 7,
            name: '交叉验证',
            status: 'completed',
            missingInConfig,
            extraInConfig
        });
    }

    /**
     * 生成完整报告
     */
    generateReport() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 标准化锁定检查报告');
        console.log('='.repeat(80));

        console.log(`\n模块: ${this.results.module}`);
        console.log(`时间: ${this.results.timestamp}`);
        console.log(`\n✅ 完成检查: ${this.results.checks.length}/7`);
        console.log(`⚠️  警告: ${this.results.warnings.length}`);
        console.log(`❌ 错误: ${this.results.errors.length}`);

        if (this.results.warnings.length > 0) {
            console.log('\n⚠️  警告详情:');
            this.results.warnings.forEach((w, i) => {
                console.log(`\n  ${i + 1}. [第${w.step}步] ${w.type}`);
                console.log(`     ${w.message}`);
                if (w.file) console.log(`     文件: ${w.file}`);
                if (w.files) console.log(`     文件: ${w.files.join(', ')}`);
            });
        }

        if (this.results.errors.length > 0) {
            console.log('\n❌ 错误详情:');
            this.results.errors.forEach((e, i) => {
                console.log(`\n  ${i + 1}. [第${e.step}步] ${e.type}`);
                console.log(`     ${e.message}`);
            });
        }

        // 生成修复建议
        this.generateFixSuggestions();

        if (this.results.fixSuggestions.length > 0) {
            console.log('\n🔧 修复建议:');
            this.results.fixSuggestions.forEach((s, i) => {
                console.log(`\n  ${i + 1}. ${s.title}`);
                console.log(`     ${s.description}`);
                if (s.action) console.log(`     执行: ${s.action}`);
            });
        }

        // 保存报告到文件
        const reportPath = path.join(this.projectRoot, `✅标准化锁定检查报告-${this.results.module}-${Date.now()}.md`);
        const reportContent = this.generateMarkdownReport();
        fs.writeFileSync(reportPath, reportContent, 'utf-8');

        console.log(`\n📝 完整报告已保存: ${path.basename(reportPath)}`);
        console.log('='.repeat(80));

        // 返回状态
        return {
            success: this.results.errors.length === 0,
            warnings: this.results.warnings.length,
            errors: this.results.errors.length,
            reportPath
        };
    }

    /**
     * 生成修复建议
     */
    generateFixSuggestions() {
        // 根据警告和错误生成具体的修复建议
        const unprotectedGlobals = this.results.warnings.filter(w => w.type === 'unprotected_global');
        if (unprotectedGlobals.length > 0) {
            this.results.fixSuggestions.push({
                title: `添加 ${unprotectedGlobals.length} 个未保护的全局变量到 lock-config.json`,
                description: '将这些全局变量添加到 protected_functions 数组中',
                action: `编辑 locks/lock-config.json, 添加: ${unprotectedGlobals.map(w => w.variable).join(', ')}`
            });
        }

        const missingWarningComments = this.results.warnings.filter(w => w.type === 'missing_warning_comment');
        if (missingWarningComments.length > 0) {
            this.results.fixSuggestions.push({
                title: `添加 ${missingWarningComments.length} 个缺失的"终极锁定警告"注释`,
                description: '在代码保护范围前添加警告注释',
                action: '在每个范围前添加终极锁定警告注释块'
            });
        }

        const unprotectedRanges = this.results.warnings.filter(w => w.type === 'unprotected_code_range');
        if (unprotectedRanges.length > 0) {
            this.results.fixSuggestions.push({
                title: `保护 ${unprotectedRanges.length} 个未保护的代码范围`,
                description: '将这些代码范围添加到 lock-config.json 的 protected_ranges 中',
                action: '更新 lock-config.json, 添加新的保护范围'
            });
        }
    }

    /**
     * 生成 Markdown 格式报告
     */
    generateMarkdownReport() {
        let md = `# 标准化锁定检查报告\n\n`;
        md += `**模块**: ${this.results.module}\n`;
        md += `**时间**: ${this.results.timestamp}\n`;
        md += `**检查步骤**: ${this.results.checks.length}/7\n`;
        md += `**警告数**: ${this.results.warnings.length}\n`;
        md += `**错误数**: ${this.results.errors.length}\n\n`;

        md += `---\n\n`;

        // 检查详情
        md += `## 检查详情\n\n`;
        this.results.checks.forEach(check => {
            md += `### 第${check.step}步: ${check.name}\n`;
            md += `- **状态**: ${check.status}\n`;
            if (check.foundRanges !== undefined) md += `- **发现范围**: ${check.foundRanges}\n`;
            if (check.totalGlobals !== undefined) md += `- **全局变量**: ${check.protectedGlobals}/${check.totalGlobals}\n`;
            md += `\n`;
        });

        // 警告
        if (this.results.warnings.length > 0) {
            md += `## ⚠️ 警告\n\n`;
            this.results.warnings.forEach((w, i) => {
                md += `### ${i + 1}. [第${w.step}步] ${w.type}\n`;
                md += `${w.message}\n\n`;
                if (w.file) md += `- **文件**: \`${w.file}\`\n`;
                if (w.files) md += `- **文件**: ${w.files.map(f => `\`${f}\``).join(', ')}\n`;
                md += `\n`;
            });
        }

        // 错误
        if (this.results.errors.length > 0) {
            md += `## ❌ 错误\n\n`;
            this.results.errors.forEach((e, i) => {
                md += `### ${i + 1}. [第${e.step}步] ${e.type}\n`;
                md += `${e.message}\n\n`;
            });
        }

        // 修复建议
        if (this.results.fixSuggestions.length > 0) {
            md += `## 🔧 修复建议\n\n`;
            this.results.fixSuggestions.forEach((s, i) => {
                md += `### ${i + 1}. ${s.title}\n`;
                md += `${s.description}\n\n`;
                if (s.action) md += `**执行**: ${s.action}\n\n`;
            });
        }

        return md;
    }

    /**
     * 加载 lock-config.json
     */
    loadLockConfig() {
        const lockConfigPath = path.join(this.locksDir, 'lock-config.json');
        if (!fs.existsSync(lockConfigPath)) {
            return { modules: {} };
        }
        return JSON.parse(fs.readFileSync(lockConfigPath, 'utf-8'));
    }
}

// CLI 入口
if (require.main === module) {
    const args = process.argv.slice(2);
    const moduleArg = args.find(a => a.startsWith('--module='));
    const moduleName = moduleArg ? moduleArg.split('=')[1] : 'statistics';

    const system = new StandardLockingSystem();
    system.performStandardLocking(moduleName)
        .then(result => {
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('❌ 检查失败:', error.message);
            process.exit(1);
        });
}

module.exports = StandardLockingSystem;

