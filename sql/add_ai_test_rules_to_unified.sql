-- ============================================
-- AI验收测试框架 - 集成到统一规则系统
-- 创建时间: 2025-10-24
-- 版本: v1.0
-- 说明: 将AI测试规则添加到liuxin_rules_unified表，实现自动触发
-- ============================================

-- 规则1: 代码文件变更自动触发测试
INSERT OR REPLACE INTO liuxin_rules_unified (
  rule_id, rule_code, rule_name, category, priority, severity, enabled,
  content, description, rule_details, applicable_tools,
  conflict_strategy, conflict_priority, conflict_group,
  created_at, updated_at, usage_count
) VALUES (
  'RULE-AI-TEST-001',
  'AI-TEST-AUTO-ON-CODE-CHANGE',
  '代码变更自动触发AI测试',
  'auto_trigger',
  80,
  'medium',
  1,
  '当检测到代码文件(.js, .ts, .vue, .jsx, .tsx)变更时，自动触发AI验收测试',
  '代码变更后自动执行测试验证，确保代码质量',
  '{
    "trigger_conditions": {
      "file_patterns": ["*.js", "*.ts", "*.vue", "*.jsx", "*.tsx"],
      "actions": ["file_save", "code_generation", "code_modification"],
      "exclude_patterns": ["*.test.js", "*.spec.js", "node_modules/**"]
    },
    "test_config": {
      "scenario": "code_change",
      "risk_level": "medium",
      "required_strategies": ["unit-functions", "api-contract"],
      "min_pass_rate": 0.8,
      "auto_execute": true
    },
    "api_endpoint": "/api/ai-test/execute",
    "success_action": "continue",
    "failure_action": "warn_and_log"
  }',
  '["mcp_ai_test", "mcp_write", "mcp_search_replace"]',
  'warn',
  80,
  'ai_testing',
  datetime('now'),
  datetime('now'),
  0
);

-- 规则2: 高风险变更强制全面测试
INSERT OR REPLACE INTO liuxin_rules_unified (
  rule_id, rule_code, rule_name, category, priority, severity, enabled,
  content, description, rule_details, applicable_tools,
  conflict_strategy, conflict_priority, conflict_group,
  created_at, updated_at, usage_count
) VALUES (
  'RULE-AI-TEST-002',
  'AI-TEST-HIGH-RISK-MANDATORY',
  '高风险变更强制全面测试',
  'mandatory_check',
  100,
  'critical',
  1,
  '当检测到高风险代码变更时，必须执行全面AI测试并人工确认',
  '高风险变更包括：数据库修改、安全相关、API变更、架构调整等，必须通过全面测试',
  '{
    "trigger_conditions": {
      "risk_indicators": ["database_change", "security_change", "api_change", "architecture_change"],
      "file_patterns": ["**/models/**", "**/auth/**", "**/api/**", "**/security/**"],
      "keywords": ["password", "token", "secret", "database", "migration", "schema"]
    },
    "test_config": {
      "scenario": "high_risk_change",
      "risk_level": "high",
      "required_strategies": ["unit-functions", "integration-contract", "e2e-web", "api-contract", "security"],
      "min_pass_rate": 0.95,
      "require_manual_confirm": true,
      "auto_execute": true
    },
    "api_endpoint": "/api/ai-test/execute",
    "success_action": "continue",
    "failure_action": "block_and_alert"
  }',
  '["mcp_ai_test", "mcp_ai_debug", "mcp_write"]',
  'block',
  100,
  'ai_testing',
  datetime('now'),
  datetime('now'),
  0
);

-- 规则3: 新功能开发完整测试
INSERT OR REPLACE INTO liuxin_rules_unified (
  rule_id, rule_code, rule_name, category, priority, severity, enabled,
  content, description, rule_details, applicable_tools,
  conflict_strategy, conflict_priority, conflict_group,
  created_at, updated_at, usage_count
) VALUES (
  'RULE-AI-TEST-003',
  'AI-TEST-NEW-FEATURE-COMPLETE',
  '新功能开发完整测试',
  'feature_validation',
  85,
  'high',
  1,
  '新功能开发完成后，自动触发完整测试套件验证',
  '新功能必须通过单元测试、集成测试、E2E测试等完整验证',
  '{
    "trigger_conditions": {
      "user_intent": ["新功能", "feature", "新增", "add feature"],
      "file_count_threshold": 3,
      "code_lines_threshold": 100
    },
    "test_config": {
      "scenario": "feature_add",
      "risk_level": "medium",
      "required_strategies": ["unit-functions", "integration-contract", "e2e-web"],
      "optional_strategies": ["perf", "security", "i18n-a11y"],
      "min_pass_rate": 0.85,
      "auto_execute": true
    },
    "role_activation": {
      "role_id": "test_engineer",
      "skills": ["skill_ai_test_execution", "skill_evidence_validation"]
    },
    "api_endpoint": "/api/ai-test/execute",
    "success_action": "continue",
    "failure_action": "warn_and_suggest_fix"
  }',
  '["mcp_ai_test", "mcp_role_activator"]',
  'warn',
  85,
  'ai_testing',
  datetime('now'),
  datetime('now'),
  0
);

-- 规则4: Bug修复验证测试
INSERT OR REPLACE INTO liuxin_rules_unified (
  rule_id, rule_code, rule_name, category, priority, severity, enabled,
  content, description, rule_details, applicable_tools,
  conflict_strategy, conflict_priority, conflict_group,
  created_at, updated_at, usage_count
) VALUES (
  'RULE-AI-TEST-004',
  'AI-TEST-BUG-FIX-VERIFY',
  'Bug修复验证测试',
  'bug_validation',
  75,
  'medium',
  1,
  'Bug修复后自动执行回归测试，确保修复有效且无副作用',
  'Bug修复必须验证：1)原问题已解决 2)无新引入问题 3)相关功能正常',
  '{
    "trigger_conditions": {
      "user_intent": ["修复", "fix", "bug", "问题", "错误"],
      "file_patterns": ["*.js", "*.ts", "*.vue"]
    },
    "test_config": {
      "scenario": "bug_fix",
      "risk_level": "medium",
      "required_strategies": ["unit-functions", "api-contract"],
      "optional_strategies": ["e2e-web"],
      "min_pass_rate": 0.8,
      "auto_execute": true
    },
    "debug_config": {
      "enable_deep_analysis": true,
      "collect_failure_evidence": true
    },
    "api_endpoint": "/api/ai-test/execute",
    "success_action": "continue",
    "failure_action": "trigger_debug"
  }',
  '["mcp_ai_test", "mcp_ai_debug"]',
  'warn',
  75,
  'ai_testing',
  datetime('now'),
  datetime('now'),
  0
);

-- 规则5: 性能敏感模块测试
INSERT OR REPLACE INTO liuxin_rules_unified (
  rule_id, rule_code, rule_name, category, priority, severity, enabled,
  content, description, rule_details, applicable_tools,
  conflict_strategy, conflict_priority, conflict_group,
  created_at, updated_at, usage_count
) VALUES (
  'RULE-AI-TEST-005',
  'AI-TEST-PERFORMANCE-CRITICAL',
  '性能敏感模块自动测试',
  'performance_validation',
  70,
  'medium',
  1,
  '涉及性能敏感模块(API、数据库、缓存)的变更，自动触发性能测试',
  '性能关键模块变更必须验证性能指标，防止性能退化',
  '{
    "trigger_conditions": {
      "modules": ["api", "database", "cache", "query"],
      "file_patterns": ["**/api/**", "**/db/**", "**/cache/**", "**/query/**"]
    },
    "test_config": {
      "scenario": "performance_test",
      "risk_level": "medium",
      "required_strategies": ["perf", "api-contract"],
      "performance_thresholds": {
        "response_time_ms": 200,
        "throughput_rps": 100,
        "memory_mb": 512
      },
      "auto_execute": true
    },
    "role_activation": {
      "role_id": "qa_specialist",
      "skills": ["skill_performance_analysis"]
    },
    "api_endpoint": "/api/ai-test/execute",
    "success_action": "continue",
    "failure_action": "warn_and_report"
  }',
  '["mcp_ai_test", "mcp_role_activator"]',
  'warn',
  70,
  'ai_testing',
  datetime('now'),
  datetime('now'),
  0
);

-- 规则6: 安全相关变更测试
INSERT OR REPLACE INTO liuxin_rules_unified (
  rule_id, rule_code, rule_name, category, priority, severity, enabled,
  content, description, rule_details, applicable_tools,
  conflict_strategy, conflict_priority, conflict_group,
  created_at, updated_at, usage_count
) VALUES (
  'RULE-AI-TEST-006',
  'AI-TEST-SECURITY-SCAN',
  '安全相关变更扫描测试',
  'security_validation',
  90,
  'high',
  1,
  '安全相关代码变更，自动触发安全扫描和测试',
  '涉及认证、授权、加密、敏感数据的变更必须通过安全测试',
  '{
    "trigger_conditions": {
      "modules": ["auth", "payment", "user", "security"],
      "keywords": ["password", "token", "secret", "encrypt", "decrypt", "auth", "permission"],
      "file_patterns": ["**/auth/**", "**/security/**", "**/payment/**"]
    },
    "test_config": {
      "scenario": "security_check",
      "risk_level": "high",
      "required_strategies": ["security", "api-contract"],
      "security_checks": ["sql_injection", "xss", "csrf", "auth_bypass", "sensitive_data"],
      "auto_execute": true
    },
    "role_activation": {
      "role_id": "qa_specialist",
      "skills": ["skill_security_audit"]
    },
    "api_endpoint": "/api/ai-test/execute",
    "success_action": "continue",
    "failure_action": "block_and_alert"
  }',
  '["mcp_ai_test", "mcp_role_activator"]',
  'block',
  90,
  'ai_testing',
  datetime('now'),
  datetime('now'),
  0
);

-- 插入完成

