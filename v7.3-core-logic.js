/**
 * v7.3核心逻辑提取
 * 从v7.3 stdio服务器中提取的关键算法
 * 用于整合到v7.1 HTTP服务器
 * 
 * v7.10.8: 集成FusionMemoryLoader，实现完整的12项预加载
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 导入FusionMemoryLoader (v7.10.8)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let FusionMemoryLoader = null;
let fusionLoader = null;
try {
    const FusionLoaderModule = require('./fusion-phase2-memory-loader.js');
    FusionMemoryLoader = FusionLoaderModule;
    fusionLoader = new FusionMemoryLoader('./liuxin.db');
    console.log('✅ [SmartPreloader] FusionMemoryLoader已加载');
} catch (err) {
    console.error('⚠️ [SmartPreloader] 无法加载FusionMemoryLoader:', err.message);
}

/**
 * 智能预加载器 - 角色分析算法 + 完整预加载
 * 来源：v7.3 handleSmartPreloader + analyzeRoleLocal
 * v7.10.8: 集成FusionMemoryLoader，实现12项预加载
 */
class SmartPreloader {
    /**
     * 🔓 v7.10.3: 检测中文锁定/解锁命令
     * @param {string} userInput - 用户输入
     * @returns {object|null} 如果是锁定命令返回结果，否则返回null
     */
    static checkLockCommand(userInput) {
        const cmd = userInput.trim();

        // 🔥 v7.10.5: 检查刷新配置命令
        if (/^(刷新配置|重新加载|reload|refresh)$/i.test(cmd)) {
            try {
                const { getInstance: getLockManager } = require('./locks/LockManager');
                const lockManager = getLockManager();

                if (lockManager && lockManager.refresh) {
                    console.error('📝 [SmartPreloader] 检测到刷新配置命令');
                    return lockManager.refresh();
                }
            } catch (err) {
                return {
                    success: false,
                    message: `❌ 刷新配置失败: ${err.message}`
                };
            }
        }

        // 检查是否是锁定相关命令
        if (!cmd.startsWith('解锁') && !cmd.startsWith('锁定')) {
            return null;
        }

        try {
            const { getInstance } = require('./ChineseLockCommand');
            const cmdHandler = getInstance();
            return cmdHandler.handleCommand(cmd);
        } catch (err) {
            return {
                success: false,
                message: `❌ 无法处理锁定命令: ${err.message}`
            };
        }
    }

    /**
     * 🎯 v7.10.4: 检测用户需求数量
     * v7.10.4.1: 优化检测算法，提高准确率
     * @param {string} userInput - 用户输入
     * @returns {number} 需求数量
     */
    static detectRequirementCount(userInput) {
        let maxCount = 0;

        // 方法1：检测编号标记（1. 2. 3. 或 1) 2) 3) 或 ① ② ③）- 最高优先级
        const numberedPatterns = [
            /(?:^|\n)\s*[1-9]\.\s+/g,        // 1. xxx
            /(?:^|\n)\s*[1-9]\)\s+/g,        // 1) xxx
            /(?:^|\n)\s*[①②③④⑤⑥⑦⑧⑨⑩]\s+/g  // ① xxx
        ];

        for (const pattern of numberedPatterns) {
            const matches = userInput.match(pattern);
            if (matches) {
                maxCount = Math.max(maxCount, matches.length);
            }
        }

        // 如果检测到明确的编号格式，直接返回（编号格式最准确）
        if (maxCount >= 2) {
            return maxCount;
        }

        // 方法2：检测关键词分隔（"并且"、"还要"、"同时"、"另外"）
        const separatorKeywords = ['并且', '还要', '同时', '另外', '以及', '还需要'];
        const separatorMatches = separatorKeywords.filter(kw => userInput.includes(kw)).length;
        if (separatorMatches > 0) {
            // 关键词数量 + 1 = 需求数量（例如："A 并且 B" = 2项需求）
            maxCount = Math.max(maxCount, separatorMatches + 1);
        }

        // 方法3：检测中文标点分隔（顿号、逗号、分号、句号）
        const commaCount = (userInput.match(/[、，,]/g) || []).length;  // 顿号和逗号
        const semicolonCount = (userInput.match(/[；;]/g) || []).length;  // 分号
        const periodCount = (userInput.match(/[。]/g) || []).length;  // 句号

        // 标点符号数量 + 1 = 需求数量
        if (commaCount > 0) {
            maxCount = Math.max(maxCount, commaCount + 1);
        }
        if (semicolonCount > 0) {
            maxCount = Math.max(maxCount, semicolonCount + 1);
        }
        // 句号检测：只在句号>=2时才认为是多需求（避免误判）
        if (periodCount >= 2) {
            maxCount = Math.max(maxCount, periodCount + 1);
        }

        // 方法4：检测多个动词（修改、添加、删除、创建、优化等）
        const actionVerbs = ['修改', '添加', '删除', '创建', '优化', '实现', '升级', '调整', '更新', '部署', '测试', '分析', '检查'];
        const verbCount = actionVerbs.filter(verb => userInput.includes(verb)).length;

        // 只有当动词>=2时才考虑（单个动词可能只是1个需求）
        if (verbCount >= 2) {
            maxCount = Math.max(maxCount, verbCount);
        }

        // 返回检测到的最大值，至少为1
        return Math.max(maxCount, 1);
    }

    static analyzeRole(userInput) {
        // 🔓 v7.10.3: 优先检查是否是锁定命令
        const lockResult = this.checkLockCommand(userInput);
        if (lockResult) {
            // 返回特殊标记，让HTTP服务器直接返回结果
            return {
                isLockCommand: true,
                result: lockResult,
                role: null
            };
        }

        // 🎯 v7.10.4: 检测需求数量，判断是否需要用户确认
        const requirementCount = this.detectRequirementCount(userInput);
        if (requirementCount >= 3) {
            global.requiresUserConfirmation = true;
            global.requirementCount = requirementCount;
            console.error(`⚠️ [SmartPreloader] 检测到 ${requirementCount} 项需求，需要用户确认`);
        } else {
            global.requiresUserConfirmation = false;
            global.requirementCount = requirementCount;
            console.error(`✅ [SmartPreloader] 检测到 ${requirementCount} 项需求，可直接执行`);
        }

        // v7.9.2: 优化角色判断逻辑
        // 修复场景1（需求分析）和场景4（测试场景）的角色判断错误

        const roleKeywords = {
            '用户经理-小户': {
                keywords: ['需求', '理解', '确认', '复述', '分析需求', '整理需求', '了解', '想知道', '是什么', '介绍一下'],
                weight: 1.0,
                priority: 2  // 高优先级：需求分析优先于开发
            },
            '产品经理-小品': {
                keywords: ['方案', '计划', '规划', '架构', '设计方案', '产品', '下一步', '升级方案', '路线图', '实施计划'],
                weight: 1.0,
                priority: 1
            },
            'GUI设计师-小美': {
                keywords: ['界面', 'UI', 'UX', '设计', '页面', '样式', '布局', '优化', '视觉', '按钮', '外观', '美化', '改善'],
                weight: 1.0,
                priority: 1
            },
            '开发工程师-小柳': {
                keywords: ['开发', '代码', '编程', '部署', '修复', '功能', '写', '实现', '重构', '函数', '接口', 'bug', '调试', '文件', '数据库'],
                weight: 1.0,
                priority: 0  // 普通优先级
            },
            '测试与质量经理-小观': {
                keywords: ['测试', '验证', '检查', '质量', '验收', '问题', '是否', '生效', '正常', '性能'],
                weight: 1.0,
                priority: 1  // 测试关键词优先
            }
        };

        // 计算加权分数
        const scores = {};
        for (const [role, config] of Object.entries(roleKeywords)) {
            const matchCount = config.keywords.filter(kw => userInput.includes(kw)).length;
            // 分数 = 匹配数 * 权重 + 优先级加成
            scores[role] = matchCount * config.weight + (config.priority * 0.5);
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 特殊规则（v7.10.8优化）
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // 规则1: 开发场景强化 - 识别"写"、"帮我"等开发动词
        if ((userInput.includes('写') || userInput.includes('帮我写') ||
            userInput.includes('实现') || userInput.includes('重构')) &&
            (userInput.includes('函数') || userInput.includes('代码') ||
                userInput.includes('功能') || userInput.includes('文件') ||
                userInput.includes('数据库') || userInput.includes('接口'))) {
            scores['开发工程师-小柳'] += 3;  // 强化开发场景
            scores['用户经理-小户'] -= 1;    // 降低用户经理权重
        }

        // 规则2: GUI设计强化 - 识别视觉相关词汇
        if ((userInput.includes('改善') || userInput.includes('优化')) &&
            (userInput.includes('按钮') || userInput.includes('视觉') ||
                userInput.includes('界面') || userInput.includes('外观'))) {
            scores['GUI设计师-小美'] += 3;  // 强化GUI场景
            scores['用户经理-小户'] -= 1;   // 降低用户经理权重
        }

        // 规则3: 用户经理场景 - 纯粹的咨询和确认
        if ((userInput.includes('了解') || userInput.includes('想知道') ||
            userInput.includes('是什么')) &&
            !userInput.includes('写') && !userInput.includes('实现') &&
            !userInput.includes('开发')) {
            scores['用户经理-小户'] += 2;  // 额外加分
        }

        // 规则4: 测试场景 - 检查和验证
        if ((userInput.includes('检查') || userInput.includes('是否') ||
            userInput.includes('验证')) &&
            !userInput.includes('代码') && !userInput.includes('bug')) {
            scores['测试与质量经理-小观'] += 2;  // 额外加分
        }

        // 规则5: 产品规划场景 - 整体性规划
        if ((userInput.includes('整个') || userInput.includes('全面') ||
            userInput.includes('项目')) &&
            (userInput.includes('计划') || userInput.includes('方案') ||
                userInput.includes('规划'))) {
            scores['产品经理-小品'] += 2;  // 额外加分
        }

        const maxScore = Math.max(...Object.values(scores));

        // v7.9.3: 修复默认角色逻辑
        // 只有当有明确匹配（分数>0.5）时才使用匹配的角色，否则使用默认角色
        const selectedRole = maxScore > 0.5 ?
            Object.keys(scores).find(r => scores[r] === maxScore) :
            '开发工程师-小柳';

        return {
            role: selectedRole,
            score: maxScore,
            confidence: maxScore > 2 ? 'high' : maxScore > 0 ? 'medium' : 'low'
        };
    }

    static classifyDialogue(userInput) {
        if (userInput.length < 10) {
            return { type: 'simple', loadLevel: 'minimal', estimatedTokens: 200 };
        }

        const technicalKeywords = ['开发', '设计', '分析', '测试', '实现', '修复'];
        const hasTechnical = technicalKeywords.some(kw => userInput.includes(kw));

        if (hasTechnical) {
            const projectKeywords = ['项目', '整体', '全面', '系统'];
            const isProject = projectKeywords.some(kw => userInput.includes(kw));

            return isProject ?
                { type: 'complex', loadLevel: 'full', estimatedTokens: 2000 } :
                { type: 'technical', loadLevel: 'medium', estimatedTokens: 600 };
        }

        return { type: 'simple', loadLevel: 'minimal', estimatedTokens: 200 };
    }

    /**
     * 生成响应（集成完整预加载）
     * v7.10.8: 添加12项预加载数据
     */
    static async generateResponse(userInput) {
        const roleAnalysis = this.analyzeRole(userInput);
        const classification = this.classifyDialogue(userInput);

        // 基础响应（原9项）
        const baseResponse = {
            success: true,
            assigned_role: roleAnalysis.role,
            role_confidence: roleAnalysis.confidence,
            dialogue_type: classification.type,
            load_level: classification.loadLevel,
            estimated_tokens: classification.estimatedTokens,
            user_input: userInput,
            timestamp: new Date().toISOString(),
            instruction: `必须使用 [${roleAnalysis.role}] 格式开头回复`,
            version: 'v7.10.8-full-preload'
        };

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🎯 v7.10.8: 集成FusionMemoryLoader（新增3项预加载）
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (fusionLoader) {
            try {
                console.log(`\n🔄 [预加载] 开始加载场景数据...`);

                // 根据对话类型映射场景
                const sceneMap = {
                    'simple': 'dialogue',
                    'technical': 'develop',
                    'complex': 'plan'
                };
                const scene = sceneMap[classification.type] || 'dialogue';

                // 加载P0级别记忆（基础索引）
                const p0Memory = await fusionLoader.loadP0Memory(scene, roleAnalysis.role);
                baseResponse.preload_data = p0Memory;

                // 根据load_level加载更多数据
                if (classification.loadLevel === 'medium' || classification.loadLevel === 'full') {
                    const p1Memory = await fusionLoader.loadP1Memory(scene, userInput);
                    baseResponse.preload_catalogs = p1Memory;
                }

                // 添加统计信息
                const Database = require('better-sqlite3');
                const db = new Database('./liuxin.db');

                // 10. 技能统计
                const skillsCount = db.prepare('SELECT COUNT(*) as count FROM skills').get().count;
                baseResponse.skills_count = skillsCount;

                // 11. 经验统计
                const experiencesCount = db.prepare('SELECT COUNT(*) as count FROM experiences').get().count;
                baseResponse.experiences_count = experiencesCount;

                // 12. 规则统计
                const rulesCount = db.prepare('SELECT COUNT(*) as count FROM liuxin_mcp_interceptor_rules WHERE enabled = 1').get().count;
                baseResponse.active_rules_count = rulesCount;

                db.close();

                console.log(`✅ [预加载] 完成！加载了 ${classification.loadLevel} 级别数据`);
                console.log(`   - 角色: ${roleAnalysis.role}`);
                console.log(`   - 技能数: ${skillsCount}`);
                console.log(`   - 经验数: ${experiencesCount}`);
                console.log(`   - 规则数: ${rulesCount}`);

            } catch (error) {
                console.error(`❌ [预加载] 失败: ${error.message}`);
                baseResponse.preload_error = error.message;
            }
        } else {
            console.warn('⚠️ [预加载] FusionMemoryLoader未初始化，使用基础响应');
        }

        return baseResponse;
    }
}

/**
 * 场景分析器
 * 来源：v7.3 handleSceneAnalyzer
 */
class SceneAnalyzer {
    static analyze(userMessage) {
        // 场景识别逻辑
        const scenes = {
            'requirement': ['需求', '要求', '帮我', '创建', '实现', '想要'],
            'development': ['开发', '代码', '编程', '实现', '功能', '写'],
            'testing': ['测试', '验证', '检查', '验收'],
            'design': ['设计', 'UI', 'GUI', '界面', '页面', '外观'],
            'system': ['升级', '部署', '安装', '配置', '系统', '服务器'],
            'rules': ['规则', '添加', '修改', '删除', '管理']
        };

        // GUI设计特征检测（用于GUI真实测试拦截）
        const guiDesignPatterns = [
            /创建.*html/i,
            /设计.*gui/i,
            /修改.*界面/i,
            /完成.*页面/i,
            /dashboard|监控大屏|可视化/i,
            /<html|<style|<script/i,  // 检测HTML代码
            /\.html|\.css|\.js/i  // 检测文件名
        ];

        // 分析用户消息
        const detectedScenes = [];
        let isGUIDesign = false;

        for (const [scene, keywords] of Object.entries(scenes)) {
            if (keywords.some(keyword => userMessage.includes(keyword))) {
                detectedScenes.push(scene);
            }
        }

        // 检测GUI设计场景（触发GUI测试拦截）
        if (guiDesignPatterns.some(pattern => pattern.test(userMessage))) {
            isGUIDesign = true;
            if (!detectedScenes.includes('design')) {
                detectedScenes.push('design');
            }
            if (!detectedScenes.includes('testing')) {
                detectedScenes.push('testing');  // 强制添加测试场景
            }
        }

        const finalScenes = detectedScenes.length > 0 ? detectedScenes : ['general'];

        return {
            success: true,
            scenes: finalScenes,
            gui_design_detected: isGUIDesign,
            requires_gui_test: isGUIDesign,
            user_message: userMessage,
            timestamp: new Date().toISOString(),
            recommended_tools: this.getRecommendedTools(finalScenes, isGUIDesign)
        };
    }

    static getRecommendedTools(scenes, isGUIDesign) {
        const toolMap = {
            'requirement': 'liuxin_requirement_rules',
            'development': 'liuxin_development_rules',
            'design': 'liuxin_design_rules',
            'testing': 'liuxin_testing_rules',
            'system': 'liuxin_system_rules',
            'rules': 'liuxin_rule_management',
            'general': 'liuxin_system_rules'
        };

        const tools = scenes.map(scene => toolMap[scene] || toolMap['general']);

        if (isGUIDesign) {
            tools.push('liuxin_gui_test_enforcer');
        }

        return [...new Set(tools)]; // 去重
    }
}

/**
 * 命令拦截器
 * 来源：v7.3 handleCommandInterceptor
 */
class CommandInterceptor {
    static validate(command) {
        const violations = [];

        // 检查1：禁止的命令模式
        const forbiddenPatterns = [
            { pattern: /rm\s+-rf\s+\//, message: '禁止删除根目录' },
            { pattern: /sudo\s+rm/, message: '禁止使用sudo删除' },
            { pattern: />\s*\/dev\/null\s+2>&1/, message: '禁止完全隐藏输出' }
        ];

        for (const { pattern, message } of forbiddenPatterns) {
            if (pattern.test(command)) {
                violations.push({ rule: 'CMD-SAFETY-001', message });
            }
        }

        // 检查2：命令格式规范
        if (command.length > 500) {
            violations.push({
                rule: 'CMD-FORMAT-CHECK-001',
                message: '命令过长，建议拆分为多个步骤'
            });
        }

        return {
            success: violations.length === 0,
            command: command,
            violations: violations,
            timestamp: new Date().toISOString(),
            action: violations.length > 0 ? 'blocked' : 'allowed'
        };
    }
}

/**
 * 代码修改拦截器
 * 来源：v7.3 handleCodeChangeInterceptor
 */
class CodeChangeInterceptor {
    static validate(currentTask, filesToChange, changeReason) {
        const violations = [];

        // 检查1：批量修改检测
        if (filesToChange.length > 10) {
            violations.push({
                rule: 'CODE-SCOPE-001',
                message: `批量修改文件过多 (${filesToChange.length}个)，可能超出任务范围`,
                suggestion: '请确认这些文件都与当前任务相关'
            });
        }

        // 检查2：无关代码检测
        const taskKeywords = this.extractKeywords(currentTask);
        const suspiciousFiles = filesToChange.filter(file => {
            return !taskKeywords.some(keyword => file.includes(keyword));
        });

        if (suspiciousFiles.length > 0 && suspiciousFiles.length / filesToChange.length > 0.3) {
            violations.push({
                rule: 'CODE-SCOPE-001',
                message: '检测到可能的无关文件修改',
                suspicious_files: suspiciousFiles,
                suggestion: '请确认这些文件与当前任务的关系'
            });
        }

        // 检查3：修改原因合理性
        if (!changeReason || changeReason.length < 10) {
            violations.push({
                rule: 'CODE-DOC-001',
                message: '修改原因描述不足',
                suggestion: '请提供详细的修改原因（至少10个字符）'
            });
        }

        return {
            success: violations.length === 0,
            current_task: currentTask,
            files_to_change: filesToChange,
            change_reason: changeReason,
            violations: violations,
            suspicious_files: suspiciousFiles,
            timestamp: new Date().toISOString(),
            action: violations.length > 0 ? 'review_required' : 'allowed'
        };
    }

    static extractKeywords(text) {
        // 简单的关键词提取
        const words = text.match(/[\u4e00-\u9fa5]+|[a-zA-Z]+/g) || [];
        return words.filter(w => w.length > 1);
    }
}

/**
 * GUI测试强制执行器
 * 来源：v7.3 handleGUITestEnforcer
 */
class GUITestEnforcer {
    static enforce(guiAction, projectName) {
        const stages = {
            'stage1_plan': '阶段1：方案确认',
            'stage2_test': '阶段2：真实测试',
            'stage3_report': '阶段3：报告提交'
        };

        // 默认要求三阶段测试
        return {
            success: true,
            gui_action: guiAction,
            project_name: projectName,
            required_stages: Object.keys(stages),
            stage_descriptions: stages,
            enforcement_level: 'mandatory',
            message: 'GUI功能必须经过真实浏览器测试',
            next_step: 'stage1_plan',
            timestamp: new Date().toISOString()
        };
    }

    static validateStage(stage, evidence) {
        const validStages = ['stage1_plan', 'stage2_test', 'stage3_report'];

        if (!validStages.includes(stage)) {
            return {
                success: false,
                message: `无效的阶段：${stage}`
            };
        }

        if (!evidence || evidence.length < 20) {
            return {
                success: false,
                stage: stage,
                message: '证据不足，请提供详细的测试证据或报告'
            };
        }

        return {
            success: true,
            stage: stage,
            evidence_verified: true,
            message: `阶段${stage}验证通过`,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = {
    SmartPreloader,
    SceneAnalyzer,
    CommandInterceptor,
    CodeChangeInterceptor,
    GUITestEnforcer
};



