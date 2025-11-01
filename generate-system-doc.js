/**
 * 柳芯系统完整文档生成器
 * 用途：生成一个全面的系统文档，让AI能够快速理解整个系统
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database('./liuxin.db');
const lockConfig = JSON.parse(fs.readFileSync('./locks/lock-config.json', 'utf8'));
const cursorrules = JSON.parse(fs.readFileSync('../.cursorrules', 'utf8'));

console.log('🔍 正在扫描柳芯系统...\n');

// ========== 1. 系统概览 ==========
const systemOverview = {
    系统名称: '柳芯 (LiuXin) AI助手增强系统',
    版本: 'v7.10.10',
    最后更新: new Date().toISOString().split('T')[0],
    系统架构: 'MCP (Model Context Protocol) + 三层拦截器 + 数据库驱动',
    核心文件: [
        'liuxin-mcp-server-unified.js (MCP服务器)',
        'ResponseInterceptor.js (响应拦截器)',
        'locks/LockManager.js (锁管理器)',
        'v7.3-core-logic.js (核心逻辑)',
        'fusion-phase2-memory-loader.js (记忆加载器)',
        'liuxin.db (SQLite数据库)'
    ],
    数据库: 'liuxin.db (SQLite3)',
    部署模式: '本地模式 (Local Mode)',
    主要功能: [
        '规则拦截与纠正',
        '团队模式与角色切换',
        '智能预加载与记忆管理',
        '统计与监控',
        '锁定与热重载',
        '归档与经验库'
    ]
};

// ========== 2. 核心规则 (.cursorrules) ==========
console.log('📖 读取 .cursorrules...');
const coreRules = cursorrules.rules.map(r => ({
    id: r.id,
    name: r.name,
    priority: r.priority,
    type: r.type,
    rule: r.rule,
    principle: r.principle || '',
    禁止行为: r.禁止行为 || [],
    历史教训: r.历史教训 || ''
}));

// ========== 3. 所有数据库规则 ==========
console.log('📖 读取数据库规则...');
const dbRules = db.prepare(`
  SELECT 
    rule_code, rule_name, description, 
    intercept_phase, intercept_action, 
    enabled, priority, rule_category
  FROM liuxin_mcp_interceptor_rules 
  ORDER BY priority DESC, rule_code
`).all();

// ========== 4. 团队模式角色 ==========
console.log('👥 读取团队模式角色...');
const roles = db.prepare(`
  SELECT id, name, english_name, description, category
  FROM roles
  WHERE enabled = 1
  ORDER BY priority DESC
`).all();

// ========== 5. 所有模块状态 ==========
console.log('🔒 读取模块锁定状态...');
const modules = Object.entries(lockConfig.modules).map(([key, mod]) => ({
    key,
    name: mod.name,
    locked: mod.locked,
    locked_at: mod.locked_at || '',
    locked_reason: mod.locked_reason || '',
    protected_files: mod.protected_files || [],
    protected_functions: mod.protected_functions || [],
    protected_rules: mod.protected_rules || []
}));

// ========== 6. 技能与经验 ==========
console.log('💡 统计技能与经验...');
const skillsCount = db.prepare('SELECT COUNT(*) as cnt FROM skills').get().cnt;
const experiencesCount = db.prepare('SELECT COUNT(*) as cnt FROM experiences').get().cnt;

const topSkills = db.prepare(`
  SELECT id, name, category, description, level
  FROM skills
  ORDER BY usage_count DESC
  LIMIT 20
`).all();

const topExperiences = db.prepare(`
  SELECT id, title, content, category, tags
  FROM experiences
  ORDER BY reference_count DESC
  LIMIT 20
`).all();

// ========== 7. 监控点位 ==========
console.log('📊 读取监控点位...');
let monitoringPoints = { total_monitoring_points: 0, monitoring_points_breakdown: {} };
try {
    if (fs.existsSync('./monitoring-points-count.json')) {
        monitoringPoints = JSON.parse(fs.readFileSync('./monitoring-points-count.json', 'utf8'));
    }
} catch (e) {
    console.warn('⚠️ 无法读取 monitoring-points-count.json');
}

// ========== 8. 已知问题与修复历史 ==========
console.log('🐛 读取Bug修复历史...');
const bugFixes = [];
try {
    const archivePath = './archives/bug-fixes';
    if (fs.existsSync(archivePath)) {
        const years = fs.readdirSync(archivePath);
        years.forEach(year => {
            const months = fs.readdirSync(path.join(archivePath, year));
            months.forEach(month => {
                const files = fs.readdirSync(path.join(archivePath, year, month));
                files.forEach(file => {
                    if (file.startsWith('bugfix_') && file.endsWith('.md')) {
                        const content = fs.readFileSync(path.join(archivePath, year, month, file), 'utf8');
                        // 提取标题和关键信息
                        const titleMatch = content.match(/## (.+)/);
                        const statusMatch = content.match(/\*\*状态\*\*: (.+)/);
                        if (titleMatch) {
                            bugFixes.push({
                                file,
                                title: titleMatch[1],
                                status: statusMatch ? statusMatch[1] : '未知',
                                date: file.match(/bugfix_(\d{4}-\d{2}-\d{2})/)[1]
                            });
                        }
                    }
                });
            });
        });
    }
} catch (e) {
    console.warn('⚠️ 无法读取归档的Bug修复记录');
}

// ========== 9. 核心功能说明 ==========
const coreFunctions = [
    {
        name: '规则拦截系统',
        description: '三层拦截器（Pre/Post/Response）拦截工具调用，根据规则进行纠正',
        key_files: ['liuxin-mcp-server-unified.js', 'ResponseInterceptor.js'],
        key_rules: ['RULE-001', 'RULE-002', 'RULE-003', 'RULE-004', 'RULE-005'],
        status: '正常',
        注意事项: '不要修改拦截逻辑，会导致死循环'
    },
    {
        name: '团队模式',
        description: '根据用户输入智能分配角色（用户经理、开发工程师、GUI设计师、产品经理、测试经理）',
        key_files: ['v7.3-core-logic.js', 'liuxin-mcp-server-unified.js'],
        key_rules: ['RULE-001', 'ROLE-FORMAT-001'],
        status: '正常',
        注意事项: 'SmartPreloader.analyzeRole() 必须被调用'
    },
    {
        name: '智能预加载',
        description: '根据用户输入和角色，预加载12+项内容（技能、经验、规则、目录等）',
        key_files: ['v7.3-core-logic.js', 'fusion-phase2-memory-loader.js'],
        key_rules: [],
        status: '正常',
        注意事项: 'FusionMemoryLoader 必须被调用'
    },
    {
        name: '统计系统',
        description: '单次对话统计（触发规则数、违规数、触发的规则列表），显示在每次回复末尾',
        key_files: ['ResponseInterceptor.js', 'liuxin-mcp-server-unified.js', 'monitoring-points-count.json'],
        key_rules: ['RULE-007', 'IR-005'],
        status: '正常',
        注意事项: '【终极锁定】- 反复出现累加问题，现已用5秒时间间隔检测，绝对不可修改'
    },
    {
        name: '锁定系统',
        description: '防止核心模块被意外修改，支持热重载',
        key_files: ['locks/LockManager.js', 'locks/lock-config.json'],
        key_rules: [],
        status: '正常',
        注意事项: 'LockManager自身也被锁定，热重载通过fs.watch实现'
    },
    {
        name: '热重载',
        description: '修改配置文件后无需重启Cursor即可生效',
        key_files: ['locks/LockManager.js'],
        key_rules: [],
        status: '正常',
        注意事项: '通过fs.watch监控lock-config.json，300ms防抖'
    },
    {
        name: '归档系统',
        description: '自动归档对话历史、Bug修复记录、项目快照',
        key_files: ['archive-manager.js', 'archives/'],
        key_rules: ['ARCHIVE-001', 'ARCHIVE-002', 'ARCHIVE-003'],
        status: '正常',
        注意事项: '每次对话结束后自动触发'
    },
    {
        name: '复述系统',
        description: '收到用户任务后，先复述需求，再提出执行计划，询问确认',
        key_files: ['ResponseInterceptor.js', 'v7.3-core-logic.js'],
        key_rules: ['RULE-002', 'IR-006'],
        status: '正常',
        注意事项: '如果需求数量>=3，必须等待用户确认才能执行'
    }
];

// ========== 10. 已知问题与经验 ==========
const knownIssues = [
    {
        问题: '统计一直累加不重置',
        原因: '统计重置逻辑放在ResponseInterceptor（太晚），而不是handleToolCall（工具调用前）',
        解决方案: '在handleToolCall开始处，使用5秒时间间隔检测新对话，重置统计',
        版本: 'v7.10.10',
        状态: '已修复',
        锁定: '终极锁定，绝对不可修改'
    },
    {
        问题: 'LockManager配置修改后不生效',
        原因: 'Node.js模块缓存导致',
        解决方案: '实现热重载（fs.watch），无需重启Cursor',
        版本: 'v7.10.6',
        状态: '已修复',
        锁定: '是'
    },
    {
        问题: '团队模式角色不切换',
        原因: 'MCP服务器未调用SmartPreloader.analyzeRole()',
        解决方案: '在liuxin-mcp-server-unified.js中直接调用SmartPreloader',
        版本: 'v7.10.8',
        状态: '已修复',
        锁定: '否（已解锁）'
    },
    {
        问题: '预加载数据不完整',
        原因: 'SmartPreloader未集成FusionMemoryLoader',
        解决方案: '在SmartPreloader.generateResponse中调用fusionLoader',
        版本: 'v7.10.8',
        状态: '已修复',
        锁定: '否'
    },
    {
        问题: '修改A功能时B功能也被破坏',
        原因: 'AI未遵守"只修改指定代码"原则',
        解决方案: 'CORE-002规则：严禁越界修改',
        版本: '自始至终',
        状态: '持续监控',
        锁定: '核心规则'
    },
    {
        问题: '同样问题反复出现',
        原因: '上下文丢失，AI不记得之前的修复',
        解决方案: '归档系统 + 开发经验库 + 本文档',
        版本: 'v7.10.8',
        状态: '已修复',
        锁定: '核心规则'
    }
];

// ========== 11. 生成完整文档 ==========
console.log('\n📝 生成完整文档...\n');

const fullDoc = {
    "📌文档说明": {
        "文档名称": "柳芯系统完整功能与规则文档",
        "文档版本": "v1.0.0",
        "生成时间": new Date().toISOString(),
        "文档用途": "让AI能够通过阅读这一个文档，快速理解柳芯系统的全部功能、规则、架构、已知问题，避免重复问题和死循环修复",
        "维护规则": "每次系统功能修改后，必须同步更新此文档",
        "AI阅读要求": "每次任务前，必须先读取此文档，了解系统全貌，查询是否有相关经验"
    },

    "🎯系统概览": systemOverview,

    "📖核心规则 (.cursorrules)": {
        说明: '这些规则定义了AI的行为约束，必须100%遵守',
        规则总数: coreRules.length,
        规则列表: coreRules
    },

    "📊数据库规则": {
        说明: '这些规则定义了MCP拦截器的行为，分为Pre/Post/Response三个阶段',
        规则总数: dbRules.length,
        启用规则数: dbRules.filter(r => r.enabled).length,
        禁用规则数: dbRules.filter(r => !r.enabled).length,
        规则分类: {
            团队模式: dbRules.filter(r => r.rule_category === 'team_mode').length,
            代码质量: dbRules.filter(r => r.rule_category === 'code_quality').length,
            响应质量: dbRules.filter(r => r.rule_category === 'response_quality').length,
            系统保护: dbRules.filter(r => r.rule_category === 'system_protection').length
        },
        规则列表: dbRules.map(r => ({
            规则代码: r.rule_code,
            规则名称: r.rule_name,
            描述: r.description || '',
            拦截阶段: r.intercept_phase,
            拦截动作: r.intercept_action,
            是否启用: r.enabled ? '是' : '否',
            优先级: r.priority,
            分类: r.rule_category
        }))
    },

    "👥团队模式角色": {
        说明: '柳芯支持多个角色，根据用户输入自动切换',
        角色总数: roles.length,
        角色列表: roles.map(r => ({
            角色ID: r.id,
            中文名称: r.name,
            英文名称: r.english_name || '',
            描述: r.description || '',
            分类: r.category || ''
        }))
    },

    "🔒模块锁定状态": {
        说明: '锁定的模块不可修改，除非用户明确解锁',
        模块总数: modules.length,
        已锁定模块数: modules.filter(m => m.locked).length,
        未锁定模块数: modules.filter(m => !m.locked).length,
        模块列表: modules.map(m => ({
            模块标识: m.key,
            模块名称: m.name,
            是否锁定: m.locked ? '是' : '否',
            锁定时间: m.locked_at,
            锁定原因: m.locked_reason,
            受保护文件数: m.protected_files.length,
            受保护函数数: m.protected_functions.length,
            受保护规则数: m.protected_rules.length
        }))
    },

    "💡技能与经验": {
        说明: '系统预加载的技能和经验数据',
        技能总数: skillsCount,
        经验总数: experiencesCount,
        Top20技能: topSkills.map(s => ({
            技能ID: s.id,
            技能名称: s.name,
            分类: s.category || '',
            描述: s.description || '',
            等级: s.level || ''
        })),
        Top20经验: topExperiences.map(e => ({
            经验ID: e.id,
            经验标题: e.title,
            经验内容: (e.content || '').substring(0, 100) + '...',
            分类: e.category || '',
            标签: e.tags || ''
        }))
    },

    "📊监控点位": {
        说明: '系统中所有可监控的触发点',
        总监控点位: monitoringPoints.total_monitoring_points || 0,
        分类统计: monitoringPoints.monitoring_points_breakdown || {}
    },

    "🛠️核心功能说明": {
        说明: '柳芯系统的8大核心功能',
        功能总数: coreFunctions.length,
        功能列表: coreFunctions
    },

    "🐛已知问题与经验": {
        说明: '历史上出现过的问题及解决方案，避免重复试错',
        问题总数: knownIssues.length,
        问题列表: knownIssues
    },

    "📚归档的Bug修复记录": {
        说明: '从archives/bug-fixes/提取的历史修复记录',
        记录总数: bugFixes.length,
        最近20条记录: bugFixes.slice(0, 20)
    },

    "⚠️关键注意事项": {
        "1. 严禁越界修改": "修改B功能时，A/C/D功能的代码一个字符都不能动（CORE-002）",
        "2. 禁止降级修复": "修复问题时找到根因，禁止用低级方案替代（CORE-003）",
        "3. 统计系统终极锁定": "统计功能已反复出现问题，现已终极锁定，绝对不可修改",
        "4. 必须复述需求": "收到任务后，先复述需求，再执行（CORE-006）",
        "5. 锁定模块不可改": "locked: true的模块，除非用户明确解锁，否则不可修改",
        "6. 热重载已实现": "修改lock-config.json后无需重启，300ms自动生效",
        "7. 团队模式必须调用": "SmartPreloader.analyzeRole()和FusionMemoryLoader必须被调用",
        "8. 归档系统自动触发": "每次对话结束后，ArchiveManager自动归档"
    },

    "📋AI工作流程": {
        "任务开始前": [
            "1. 读取本文档，了解系统全貌",
            "2. 检查【已知问题与经验】，看是否有相关解决方案",
            "3. 检查【模块锁定状态】，确认是否可以修改"
        ],
        "收到新任务": [
            "1. 复述用户需求（CORE-006）",
            "2. 提出执行计划",
            "3. 询问确认",
            "4. 获得确认后再执行"
        ],
        "修改代码时": [
            "1. 只修改用户明确指定的代码（CORE-002）",
            "2. 不修改其他函数/方法（即使在同一文件）",
            "3. 发现其他问题时，先报告，询问是否修复，获得授权后再改"
        ],
        "修复Bug时": [
            "1. 深度诊断找根因（CORE-003）",
            "2. 修复根因，保持原方案不变",
            "3. 禁止用低级方案替代（如：MCP失效→改用.cursorrules）",
            "4. 修复完成后，更新【开发经验库】"
        ],
        "任务完成后": [
            "1. 同步更新本文档（如果功能有变化）",
            "2. 触发归档系统（ArchiveManager）",
            "3. 如果是Bug修复，记录到【已知问题与经验】"
        ]
    },

    "🔄文档同步机制": {
        说明: '每次系统功能修改后，必须同步更新本文档',
        触发条件: [
            '新增功能模块',
            '修改核心逻辑',
            '新增/修改数据库规则',
            '锁定/解锁模块',
            '修复Bug',
            '升级系统版本'
        ],
        更新方法: '重新运行 generate-system-doc.js',
        自动化计划: '未来集成到ArchiveManager，自动触发更新'
    }
};

// ========== 12. 写入文件 ==========
const outputPath = './📘【柳芯系统完整文档】.json';
fs.writeFileSync(outputPath, JSON.stringify(fullDoc, null, 2), 'utf8');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ 文档生成成功！');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log(`📄 文件路径: ${outputPath}`);
console.log(`📊 系统概览: ${systemOverview.系统名称} ${systemOverview.版本}`);
console.log(`📖 核心规则: ${coreRules.length} 条`);
console.log(`📊 数据库规则: ${dbRules.length} 条（${dbRules.filter(r => r.enabled).length} 启用）`);
console.log(`👥 团队角色: ${roles.length} 个`);
console.log(`🔒 锁定模块: ${modules.filter(m => m.locked).length} 个`);
console.log(`💡 技能: ${skillsCount} 个`);
console.log(`📚 经验: ${experiencesCount} 个`);
console.log(`📊 监控点位: ${monitoringPoints.total_monitoring_points || 0} 个`);
console.log(`🛠️ 核心功能: ${coreFunctions.length} 个`);
console.log(`🐛 已知问题: ${knownIssues.length} 个`);
console.log(`📚 Bug修复记录: ${bugFixes.length} 条\n`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

db.close();

