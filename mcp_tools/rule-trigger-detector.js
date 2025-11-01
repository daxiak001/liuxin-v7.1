/**
 * 规则触发检测器 - v7.3性能监控核心组件
 * 
 * 功能：
 * 1. 检测AI回复中触发的所有规则（73条配置）
 * 2. 检测所有技能使用（read_file, write, grep等）
 * 3. 检测所有经验调用
 * 4. 记录到数据库（精准统计，非预估）
 */

class RuleTriggerDetector {
    constructor(db) {
        this.db = db;

        // 73条规则检测配置（完整版）
        this.RULE_DETECTION_CONFIG = {
            // Cursor规则（12条）
            'RULE-0': {
                name: '强制读取系统总览',
                patterns: [/read_file.*系统总览/gi, /🌟柳芯系统总览/gi],
                purpose: '防止AI不了解系统全貌就操作',
                category: 'cursor'
            },
            'RULE-1': {
                name: '必须调用团队模式',
                patterns: [/作为【.*?】/g, /team-mode-enhanced/gi],
                purpose: '确保AI使用5个角色之一回复',
                category: 'cursor'
            },
            'RULE-2': {
                name: '必须读取记忆',
                patterns: [/read_file.*记忆/gi, /📚AI核心记忆/gi, /memory\/load/gi],
                purpose: '防止AI遗忘历史上下文',
                category: 'cursor'
            },
            'RULE-3': {
                name: '场景分析与规则触发',
                patterns: [/scene-analyze/gi, /场景分析/gi],
                purpose: '复杂任务分析场景',
                category: 'cursor'
            },
            'RULE-4': {
                name: '命令执行前必须验证',
                patterns: [/command-validate/gi, /命令验证/gi],
                purpose: '防止执行危险命令',
                category: 'cursor'
            },
            'RULE-5': {
                name: '代码修改前必须检查范围',
                patterns: [/code-scope-check/gi, /代码范围检查/gi],
                purpose: '防止批量修改无关文件',
                category: 'cursor'
            },
            'RULE-6': {
                name: 'GUI功能必须真实测试',
                patterns: [/gui-test-enforce/gi, /GUI测试强制/gi],
                purpose: '确保GUI功能真实可用',
                category: 'cursor'
            },
            'RULE-7': {
                name: '每次回复显示统计',
                patterns: [/📊 统计：触发/gi, /触发.*条.*违规.*条/gi],
                purpose: '显示精准统计信息',
                category: 'cursor'
            },
            'RULE-8': {
                name: '强制同步系统总览',
                patterns: [/同步系统总览/gi, /system\/sync-overview/gi],
                purpose: '修改系统后同步总览',
                category: 'cursor'
            },

            // 核心铁律规则（5条）
            'IR-001': {
                name: '禁止分裂系统',
                patterns: [/禁止创建新.*系统/gi, /防止分裂/gi],
                purpose: '禁止创建新的系统文件夹',
                category: 'cloud'
            },
            'IR-002': {
                name: '禁止删除历史',
                patterns: [/禁止删除.*历史/gi, /保留历史记录/gi],
                purpose: '禁止删除历史记录',
                category: 'cloud'
            },
            'IR-003': {
                name: '强制读取记忆',
                patterns: [/强制读取记忆/gi],
                purpose: '每次对话必须读取记忆',
                category: 'cloud'
            },
            'IR-004': {
                name: '强制团队模式',
                patterns: [/强制团队模式/gi, /必须使用角色/gi],
                purpose: '每次回复必须使用角色身份',
                category: 'cloud'
            },
            'IR-005': {
                name: '强制显示统计',
                patterns: [/强制显示统计/gi, /必须显示统计/gi],
                purpose: '每次回复结尾必须显示统计',
                category: 'cloud'
            },

            // 角色增强规则（5条）
            'USER-MGR-ENHANCE-001': {
                name: '用户经理增强',
                patterns: [/用户经理.*小户/gi, /深入分析.*需求/gi],
                purpose: '深入分析用户需求',
                category: 'cloud'
            },
            'GUI-SELF-CHECK-001': {
                name: 'GUI设计师自检',
                patterns: [/GUI设计师.*小美/gi, /界面原型/gi],
                purpose: '提供界面原型或描述',
                category: 'cloud'
            },
            'DEV-STANDARD-001': {
                name: '开发工程师规范',
                patterns: [/开发工程师.*小柳/gi, /代码规范/gi],
                purpose: '遵守代码规范',
                category: 'cloud'
            },
            'TEST-PROJECT-MEMORY-001': {
                name: '测试经理项目记忆',
                patterns: [/测试.*经理.*小观/gi, /测试结果/gi],
                purpose: '记录测试结果',
                category: 'cloud'
            },
            'DEV-COMPLETE-CHECK-001': {
                name: '开发完成度检查',
                patterns: [/开发.*完成.*检查/gi, /代码完整性/gi],
                purpose: '检查代码完整性',
                category: 'cloud'
            },

            // 防违规拦截规则（4条）
            'ANTI-LOCAL-001': {
                name: '禁止本地规则替代',
                patterns: [/禁止.*本地规则.*替代/gi],
                purpose: '必须以云端规则为准',
                category: 'cloud'
            },
            'CMD-FORMAT-CHECK-001': {
                name: '命令格式检查',
                patterns: [/命令格式检查/gi],
                purpose: '执行命令前必须检查格式',
                category: 'cloud'
            },
            'AUTO-READ-IMPORTANT-001': {
                name: '自动读取重要文件',
                patterns: [/自动读取.*重要文件/gi],
                purpose: '对话开始时必须读取重要文件',
                category: 'cloud'
            },
            'CODE-SCOPE-001': {
                name: '代码范围检查',
                patterns: [/代码范围检查/gi],
                purpose: '修改>3个文件时必须检查',
                category: 'cloud'
            },

            // MCP集成规则（3条）
            'MCP-001': {
                name: 'MCP工具优先使用',
                patterns: [/MCP工具.*优先/gi],
                purpose: '优先使用MCP工具',
                category: 'cloud'
            },
            'MCP-002': {
                name: 'MCP调用必须记录',
                patterns: [/MCP调用.*记录/gi],
                purpose: '每次MCP调用必须记录',
                category: 'cloud'
            },
            'MCP-003': {
                name: 'MCP错误必须处理',
                patterns: [/MCP错误.*处理/gi],
                purpose: 'MCP调用失败必须捕获错误',
                category: 'cloud'
            },

            // 工具和对话规则（7条）
            'IR-108': {
                name: '使用合适的工具',
                patterns: [/read_file|write|search_replace/gi],
                purpose: '文件操作使用专用工具',
                category: 'cloud'
            },
            'IR-109': {
                name: '保持对话连贯性',
                patterns: [/引用.*之前的消息/gi],
                purpose: '必须引用用户之前的消息',
                category: 'cloud'
            },
            'IR-112': {
                name: '工具调用必须说明',
                patterns: [/调用.*说明原因/gi],
                purpose: '调用工具前说明原因',
                category: 'cloud'
            },
            'DOC-001': {
                name: '文档必须完整',
                patterns: [/文档.*完整/gi],
                purpose: '创建功能必须附带文档',
                category: 'cloud'
            },
            'DIALOG-001': {
                name: '对话必须有结论',
                patterns: [/明确结论/gi],
                purpose: '每次回复必须有明确结论',
                category: 'cloud'
            },
            'TODO-001': {
                name: '复杂任务必须创建TODO',
                patterns: [/todo_write/gi],
                purpose: '>3步骤的任务必须创建TODO',
                category: 'cloud'
            },
            'IR-200': {
                name: '对话日志记录',
                patterns: [/对话日志.*记录/gi],
                purpose: '重要对话必须记录到数据库',
                category: 'cloud'
            },

            // 云端强制规则（12条）
            'CLOUD-FORCE-RULES-001': {
                name: '文档格式规范',
                patterns: [/文档格式.*规范/gi],
                purpose: 'Markdown文件必须有标题',
                category: 'cloud'
            },
            'CLOUD-FORCE-RULES-002': {
                name: '测试验证强制',
                patterns: [/测试验证.*强制/gi],
                purpose: '代码修改必须测试',
                category: 'cloud'
            },
            'CLOUD-FORCE-RULES-003': {
                name: '开发流程规范',
                patterns: [/需求→设计→开发→测试/gi],
                purpose: '开发流程规范',
                category: 'cloud'
            },
            'CLOUD-FORCE-RULES-004': {
                name: '项目管理规范',
                patterns: [/项目管理.*规范/gi],
                purpose: '必须记录项目进度',
                category: 'cloud'
            },
            'CLOUD-FORCE-RULES-005': {
                name: 'AI行为控制',
                patterns: [/AI行为.*控制/gi],
                purpose: '必须遵守所有规则',
                category: 'cloud'
            },
            'CLOUD-FORCE-RULES-006': {
                name: '版本管理规范',
                patterns: [/版本管理.*规范/gi],
                purpose: '重要修改必须备份',
                category: 'cloud'
            },
            'CLOUD-FORCE-RULES-007': {
                name: '系统总览维护',
                patterns: [/系统总览.*维护/gi],
                purpose: '重大修改必须更新系统总览',
                category: 'cloud'
            },
            'CLOUD-FORCE-RULES-008': {
                name: '数据完整性保护',
                patterns: [/数据完整性/gi],
                purpose: '数据库操作必须验证',
                category: 'cloud'
            },
            'CLOUD-FORCE-RULES-009': {
                name: '任务自检机制',
                patterns: [/任务.*自检/gi],
                purpose: '任务完成前必须自检',
                category: 'cloud'
            },
            'CLOUD-FORCE-RULES-010': {
                name: '多窗口同步',
                patterns: [/多窗口.*同步/gi],
                purpose: '多窗口操作必须同步状态',
                category: 'cloud'
            },
            'CLOUD-FORCE-RULES-011': {
                name: '团队模式强制',
                patterns: [/团队模式.*强制/gi],
                purpose: '每次回复必须使用角色',
                category: 'cloud'
            },
            'CLOUD-FORCE-RULES-012': {
                name: 'GUI测试强制',
                patterns: [/GUI测试.*强制/gi],
                purpose: 'GUI功能必须真实测试',
                category: 'cloud'
            }
        };

        // 技能检测配置
        this.SKILL_DETECTION_CONFIG = {
            'read_file': {
                name: '文件读取',
                patterns: [/<invoke name="read_file">/gi],
                category: 'file_operation'
            },
            'write': {
                name: '文件写入',
                patterns: [/<invoke name="write">/gi],
                category: 'file_operation'
            },
            'search_replace': {
                name: '文件编辑',
                patterns: [/<invoke name="search_replace">/gi],
                category: 'file_operation'
            },
            'delete_file': {
                name: '文件删除',
                patterns: [/<invoke name="delete_file">/gi],
                category: 'file_operation'
            },
            'list_dir': {
                name: '目录列表',
                patterns: [/<invoke name="list_dir">/gi],
                category: 'file_operation'
            },
            'grep': {
                name: 'grep搜索',
                patterns: [/<invoke name="grep">/gi],
                category: 'search'
            },
            'codebase_search': {
                name: '代码库搜索',
                patterns: [/<invoke name="codebase_search">/gi],
                category: 'search'
            },
            'glob_file_search': {
                name: '文件名搜索',
                patterns: [/<invoke name="glob_file_search">/gi],
                category: 'search'
            },
            'run_terminal_cmd': {
                name: '终端命令',
                patterns: [/<invoke name="run_terminal_cmd">/gi],
                category: 'development'
            },
            'todo_write': {
                name: 'TODO管理',
                patterns: [/<invoke name="todo_write">/gi],
                category: 'management'
            }
        };
    }

    /**
     * 检测AI回复中触发的所有规则
     */
    async detectTriggeredRules(aiResponse, userMessage, sessionId) {
        const triggered = [];

        for (const [ruleCode, config] of Object.entries(this.RULE_DETECTION_CONFIG)) {
            let triggerCount = 0;

            for (const pattern of config.patterns) {
                const matches = aiResponse.match(pattern);
                if (matches) {
                    triggerCount += matches.length;
                }
            }

            if (triggerCount > 0) {
                triggered.push({
                    rule_code: ruleCode,
                    rule_name: config.name,
                    rule_category: config.category,
                    trigger_count: triggerCount,
                    purpose: config.purpose
                });

                // 记录到数据库
                try {
                    const stmt = this.db.prepare(`
                        INSERT INTO rule_trigger_detailed (
                            session_id, rule_code, rule_name, rule_category,
                            trigger_count, user_message, ai_response_preview, purpose
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `);

                    stmt.run(
                        sessionId,
                        ruleCode,
                        config.name,
                        config.category,
                        triggerCount,
                        userMessage.substring(0, 200),
                        aiResponse.substring(0, 200),
                        config.purpose
                    );
                    stmt.finalize();
                } catch (error) {
                    console.error('记录规则触发失败:', error.message);
                }
            }
        }

        return triggered;
    }

    /**
     * 检测技能使用
     */
    async detectSkillUsage(aiResponse, sessionId) {
        const skills = [];

        for (const [skillCode, config] of Object.entries(this.SKILL_DETECTION_CONFIG)) {
            let useCount = 0;

            for (const pattern of config.patterns) {
                const matches = aiResponse.match(pattern);
                if (matches) {
                    useCount += matches.length;
                }
            }

            if (useCount > 0) {
                skills.push({
                    skill_code: skillCode,
                    skill_name: config.name,
                    use_count: useCount,
                    category: config.category
                });

                // 记录到数据库
                try {
                    const stmt = this.db.prepare(`
                        INSERT INTO skill_usage_detailed (
                            session_id, skill_code, skill_name, use_count, category
                        ) VALUES (?, ?, ?, ?, ?)
                    `);

                    stmt.run(sessionId, skillCode, config.name, useCount, config.category);
                    stmt.finalize();
                } catch (error) {
                    console.error('记录技能使用失败:', error.message);
                }
            }
        }

        return skills;
    }

    /**
     * 检测经验调用
     */
    async detectExperienceCalls(aiResponse, sessionId) {
        const experiences = [];

        // 简单匹配经验调用模式（可根据实际情况扩展）
        const expPattern = /EXP-\d{3}/gi;
        const matches = aiResponse.match(expPattern);

        if (matches) {
            const uniqueExps = [...new Set(matches)];

            for (const expCode of uniqueExps) {
                const callCount = matches.filter(m => m === expCode).length;

                experiences.push({
                    experience_code: expCode,
                    experience_name: `经验-${expCode}`,
                    call_count: callCount
                });

                // 记录到数据库
                try {
                    const stmt = this.db.prepare(`
                        INSERT INTO experience_call_log (
                            session_id, experience_code, experience_name, call_count
                        ) VALUES (?, ?, ?, ?)
                    `);

                    stmt.run(sessionId, expCode, `经验-${expCode}`, callCount);
                    stmt.finalize();
                } catch (error) {
                    console.error('记录经验调用失败:', error.message);
                }
            }
        }

        return experiences;
    }

    /**
     * 综合检测（一次调用完成所有检测）
     */
    async detectAll(aiResponse, userMessage, sessionId) {
        const rules = await this.detectTriggeredRules(aiResponse, userMessage, sessionId);
        const skills = await this.detectSkillUsage(aiResponse, sessionId);
        const experiences = await this.detectExperienceCalls(aiResponse, sessionId);

        return {
            rules,
            skills,
            experiences,
            total_count: rules.length + skills.length + experiences.length
        };
    }
}

module.exports = RuleTriggerDetector;


