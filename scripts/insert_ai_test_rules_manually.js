const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../liuxin.db');
console.log(`📁 数据库路径: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ 数据库连接错误:', err.message);
        process.exit(1);
    }
});

const rules = [
    {
        rule_id: 'RULE-AI-TEST-001',
        rule_code: 'AI-TEST-AUTO-ON-CODE-CHANGE',
        rule_name: '代码变更自动触发AI测试',
        category: 'auto_trigger',
        priority: 80,
        severity: 'medium',
        enabled: 1,
        content: '当检测到代码文件(.js, .ts, .vue, .jsx, .tsx)变更时，自动触发AI验收测试',
        description: '代码变更后自动执行测试验证，确保代码质量',
        rule_details: JSON.stringify({
            trigger_conditions: {
                file_patterns: ['*.js', '*.ts', '*.vue', '*.jsx', '*.tsx'],
                actions: ['file_save', 'code_generation', 'code_modification'],
                exclude_patterns: ['*.test.js', '*.spec.js', 'node_modules/**']
            },
            test_config: {
                scenario: 'code_change',
                risk_level: 'medium',
                required_strategies: ['unit-functions', 'api-contract'],
                min_pass_rate: 0.8,
                auto_execute: true
            },
            api_endpoint: '/api/ai-test/execute',
            success_action: 'continue',
            failure_action: 'warn_and_log'
        }),
        applicable_tools: '["mcp_ai_test", "mcp_write", "mcp_search_replace"]',
        conflict_strategy: 'warn',
        conflict_priority: 80,
        conflict_group: 'ai_testing',
        usage_count: 0
    },
    {
        rule_id: 'RULE-AI-TEST-002',
        rule_code: 'AI-TEST-HIGH-RISK-MANDATORY',
        rule_name: '高风险变更强制全面测试',
        category: 'mandatory_check',
        priority: 100,
        severity: 'critical',
        enabled: 1,
        content: '当检测到高风险代码变更时，必须执行全面AI测试并人工确认',
        description: '高风险变更包括：数据库修改、安全相关、API变更、架构调整等，必须通过全面测试',
        rule_details: JSON.stringify({
            trigger_conditions: {
                risk_indicators: ['database_change', 'security_change', 'api_change', 'architecture_change'],
                file_patterns: ['**/models/**', '**/auth/**', '**/api/**', '**/security/**'],
                keywords: ['password', 'token', 'secret', 'database', 'migration', 'schema']
            },
            test_config: {
                scenario: 'high_risk_change',
                risk_level: 'high',
                required_strategies: ['unit-functions', 'integration-contract', 'e2e-web', 'api-contract', 'security'],
                min_pass_rate: 0.95,
                require_manual_confirm: true,
                auto_execute: true
            },
            api_endpoint: '/api/ai-test/execute',
            success_action: 'continue',
            failure_action: 'block_and_alert'
        }),
        applicable_tools: '["mcp_ai_test", "mcp_ai_debug", "mcp_write"]',
        conflict_strategy: 'block',
        conflict_priority: 100,
        conflict_group: 'ai_testing',
        usage_count: 0
    },
    {
        rule_id: 'RULE-AI-TEST-003',
        rule_code: 'AI-TEST-NEW-FEATURE-COMPLETE',
        rule_name: '新功能开发完整测试',
        category: 'feature_validation',
        priority: 85,
        severity: 'high',
        enabled: 1,
        content: '新功能开发完成后，自动触发完整测试套件验证',
        description: '新功能必须通过单元测试、集成测试、E2E测试等完整验证',
        rule_details: JSON.stringify({
            trigger_conditions: {
                user_intent: ['新功能', 'feature', '新增', 'add feature'],
                file_count_threshold: 3,
                code_lines_threshold: 100
            },
            test_config: {
                scenario: 'feature_add',
                risk_level: 'medium',
                required_strategies: ['unit-functions', 'integration-contract', 'e2e-web'],
                optional_strategies: ['perf', 'security', 'i18n-a11y'],
                min_pass_rate: 0.85,
                auto_execute: true
            },
            role_activation: {
                role_id: 'test_engineer',
                skills: ['skill_ai_test_execution', 'skill_evidence_validation']
            },
            api_endpoint: '/api/ai-test/execute',
            success_action: 'continue',
            failure_action: 'warn_and_suggest_fix'
        }),
        applicable_tools: '["mcp_ai_test", "mcp_role_activator"]',
        conflict_strategy: 'warn',
        conflict_priority: 85,
        conflict_group: 'ai_testing',
        usage_count: 0
    }
];

const stmt = db.prepare(`
  INSERT OR REPLACE INTO liuxin_rules_unified (
    rule_id, rule_code, rule_name, category, priority, severity, enabled,
    content, description, rule_details, applicable_tools,
    conflict_strategy, conflict_priority, conflict_group,
    created_at, updated_at, usage_count
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
`);

let insertedCount = 0;

rules.forEach((rule, index) => {
    stmt.run(
        rule.rule_id,
        rule.rule_code,
        rule.rule_name,
        rule.category,
        rule.priority,
        rule.severity,
        rule.enabled,
        rule.content,
        rule.description,
        rule.rule_details,
        rule.applicable_tools,
        rule.conflict_strategy,
        rule.conflict_priority,
        rule.conflict_group,
        rule.usage_count,
        (err) => {
            if (err) {
                console.error(`❌ 插入规则 ${rule.rule_code} 失败:`, err.message);
            } else {
                insertedCount++;
                console.log(`✅ [${insertedCount}/${rules.length}] ${rule.rule_code} - ${rule.rule_name}`);
            }

            if (index === rules.length - 1) {
                stmt.finalize(() => {
                    console.log(`\n✅ 成功插入 ${insertedCount}/${rules.length} 条规则！`);

                    db.all(
                        "SELECT rule_code, rule_name, priority, severity FROM liuxin_rules_unified WHERE rule_code LIKE 'AI-TEST-%' ORDER BY priority DESC",
                        [],
                        (err, rows) => {
                            if (err) {
                                console.error('❌ 查询失败:', err.message);
                            } else {
                                console.log('\n📋 当前AI测试规则列表:');
                                rows.forEach(r => console.log(`   - [${r.rule_code}] ${r.rule_name} (优先级: ${r.priority})`));
                            }
                            db.close();
                        }
                    );
                });
            }
        }
    );
});





