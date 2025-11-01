-- ============================================
-- AI验收测试框架 - 数据库表结构
-- 创建时间: 2025-10-24
-- 版本: v1.0
-- ============================================

-- 表1: AI测试规则表
CREATE TABLE IF NOT EXISTS ai_test_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_code TEXT UNIQUE NOT NULL,
  rule_name TEXT NOT NULL,
  category TEXT NOT NULL,           -- 规则类别: 'trigger', 'strategy', 'validation'
  priority INTEGER DEFAULT 50,      -- 优先级 (1-100)
  
  -- 触发条件
  trigger_on_scenario TEXT,         -- JSON数组: ["code_change", "feature_add"]
  trigger_on_file_pattern TEXT,     -- JSON数组: ["*.js", "*.vue"]
  trigger_on_risk_level TEXT,       -- JSON数组: ["high", "critical"]
  trigger_on_module TEXT,           -- JSON数组: ["auth", "payment"]
  
  -- 策略配置
  required_strategies TEXT,         -- JSON数组: ["unit-functions", "e2e-web"]
  optional_strategies TEXT,         -- JSON数组: ["perf", "security"]
  auto_fix_enabled INTEGER DEFAULT 0,
  
  -- 验证要求
  min_pass_rate REAL DEFAULT 0.8,   -- 最低通过率
  require_evidence INTEGER DEFAULT 1,
  require_manual_confirm INTEGER DEFAULT 0,
  
  -- 元数据
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  enabled INTEGER DEFAULT 1
);

-- 表2: AI测试历史表
CREATE TABLE IF NOT EXISTS ai_test_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id TEXT UNIQUE NOT NULL,
  scenario TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  
  -- 输入信息
  changed_files TEXT,               -- JSON数组
  affected_modules TEXT,            -- JSON数组
  triggered_rules TEXT,             -- JSON数组: 触发的规则ID
  
  -- 执行信息
  strategies_executed TEXT,         -- JSON数组
  execution_time_ms INTEGER,
  
  -- 结果信息
  success INTEGER,
  pass_rate REAL,
  total_tests INTEGER,
  passed_tests INTEGER,
  failed_tests INTEGER,
  
  -- 证据路径
  evidence_paths TEXT,              -- JSON对象
  
  -- 问题信息
  issues_found TEXT,                -- JSON数组
  auto_fixes_applied TEXT,          -- JSON数组
  
  -- 元数据
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  executed_by TEXT                  -- AI或角色名称
);

-- 表3: 测试证据表
CREATE TABLE IF NOT EXISTS ai_test_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL,      -- 'screenshot', 'log', 'report', 'trace'
  file_path TEXT NOT NULL,
  file_size INTEGER,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (test_id) REFERENCES ai_test_history(test_id)
);

-- 创建索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_ai_test_rules_enabled ON ai_test_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_ai_test_rules_priority ON ai_test_rules(priority DESC);
CREATE INDEX IF NOT EXISTS idx_ai_test_history_test_id ON ai_test_history(test_id);
CREATE INDEX IF NOT EXISTS idx_ai_test_history_scenario ON ai_test_history(scenario);
CREATE INDEX IF NOT EXISTS idx_ai_test_history_executed_at ON ai_test_history(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_test_evidence_test_id ON ai_test_evidence(test_id);

-- 插入5条预定义规则

-- 规则1: 代码变更自动测试
INSERT OR IGNORE INTO ai_test_rules (
  rule_code, rule_name, category, priority, 
  trigger_on_scenario, trigger_on_file_pattern, 
  required_strategies, description
) VALUES (
  'AITEST-001', 
  '代码变更自动测试', 
  'trigger', 
  80, 
  '["code_change"]', 
  '["*.js", "*.ts", "*.vue", "*.jsx", "*.tsx"]',
  '["unit-functions", "api-contract"]',
  '当检测到代码文件变更时，自动执行单元测试和API测试'
);

-- 规则2: 高风险变更全面测试
INSERT OR IGNORE INTO ai_test_rules (
  rule_code, rule_name, category, priority, 
  trigger_on_scenario, trigger_on_risk_level, 
  required_strategies, require_manual_confirm, description
) VALUES (
  'AITEST-002', 
  '高风险变更全面测试', 
  'trigger', 
  100, 
  '["code_change", "refactor"]',
  '["high", "critical"]',
  '["unit-functions", "integration-contract", "e2e-web", "api-contract", "security"]',
  1,
  '高风险变更必须执行全面测试并人工确认'
);

-- 规则3: 性能敏感模块测试
INSERT OR IGNORE INTO ai_test_rules (
  rule_code, rule_name, category, priority, 
  trigger_on_module, required_strategies, description
) VALUES (
  'AITEST-003', 
  '性能敏感模块测试', 
  'trigger', 
  70,
  '["api", "database", "cache"]',
  '["perf", "api-contract"]',
  '涉及性能敏感模块时自动执行性能测试'
);

-- 规则4: 安全相关变更测试
INSERT OR IGNORE INTO ai_test_rules (
  rule_code, rule_name, category, priority, 
  trigger_on_module, required_strategies, description
) VALUES (
  'AITEST-004', 
  '安全相关变更测试', 
  'trigger', 
  90,
  '["auth", "payment", "user"]',
  '["security", "api-contract"]',
  '安全相关模块变更必须执行安全扫描'
);

-- 规则5: 新功能完整测试
INSERT OR IGNORE INTO ai_test_rules (
  rule_code, rule_name, category, priority, 
  trigger_on_scenario, required_strategies, optional_strategies, description
) VALUES (
  'AITEST-005', 
  '新功能完整测试', 
  'trigger', 
  85,
  '["feature_add"]',
  '["unit-functions", "integration-contract", "e2e-web"]',
  '["perf", "security", "i18n-a11y"]',
  '新功能开发必须执行完整测试套件'
);









