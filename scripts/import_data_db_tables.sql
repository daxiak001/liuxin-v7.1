-- ====================================================================
-- 数据库表整合脚本 - 从data DB导入高价值表到主DB
-- ====================================================================
-- 目标: 导入违规检测和上下文加载所需的8张表
-- 策略: 只导入配置数据，不导入日志数据
-- 执行时间: 2025-10-20
-- 执行人员: 小柳(开发工程师)
-- ====================================================================

-- ====================================================================
-- 步骤1: 附加data数据库
-- ====================================================================
ATTACH DATABASE '/home/ubuntu/liuxin-system/data/liuxin.db' AS data;

SELECT '✅ 步骤1完成: 附加data数据库' as status;

-- ====================================================================
-- 步骤2: 创建违规检测表（4张）
-- ====================================================================

-- 2.1 违规规则配置表
CREATE TABLE IF NOT EXISTS violation_detection_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_name TEXT NOT NULL,
    violation_type TEXT NOT NULL,
    description TEXT,
    severity TEXT DEFAULT 'medium',
    enabled INTEGER DEFAULT 1,
    threshold REAL DEFAULT 1.0,
    detection_keywords TEXT,
    priority INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2.2 违规修复模板表
CREATE TABLE IF NOT EXISTS violation_fix_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    violation_type TEXT NOT NULL,
    fix_template TEXT NOT NULL,
    example_before_after TEXT,
    explanation TEXT,
    priority INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2.3 违规关键词权重表
CREATE TABLE IF NOT EXISTS violation_keyword_weights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    violation_type TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2.4 违规白名单表
CREATE TABLE IF NOT EXISTS violation_whitelist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL,
    pattern_type TEXT DEFAULT 'keyword',
    description TEXT,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

SELECT '✅ 步骤2完成: 创建违规检测表' as status;

-- ====================================================================
-- 步骤3: 创建上下文智能加载表（4张）
-- ====================================================================

-- 3.1 上下文加载配置表
CREATE TABLE IF NOT EXISTS context_load_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    context_type TEXT NOT NULL UNIQUE,
    threshold REAL DEFAULT 1.0,
    max_tokens INTEGER DEFAULT 1000,
    description TEXT,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3.2 上下文条件词表
CREATE TABLE IF NOT EXISTS context_conditional_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    context_type TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3.3 上下文否定词表
CREATE TABLE IF NOT EXISTS context_negation_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3.4 上下文加载日志表
CREATE TABLE IF NOT EXISTS context_load_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    context_type TEXT NOT NULL,
    score REAL,
    threshold_met INTEGER DEFAULT 0,
    loaded INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

SELECT '✅ 步骤3完成: 创建上下文加载表' as status;

-- ====================================================================
-- 步骤4: 导入违规检测数据
-- ====================================================================

-- 4.1 导入违规规则配置
INSERT OR IGNORE INTO violation_detection_config 
SELECT * FROM data.violation_detection_config;

-- 4.2 导入违规修复模板
INSERT OR IGNORE INTO violation_fix_templates 
SELECT * FROM data.violation_fix_templates;

-- 4.3 导入违规关键词权重
INSERT OR IGNORE INTO violation_keyword_weights 
SELECT * FROM data.violation_keyword_weights;

-- 4.4 导入违规白名单
INSERT OR IGNORE INTO violation_whitelist 
SELECT * FROM data.violation_whitelist;

SELECT '✅ 步骤4完成: 导入违规检测数据' as status;

-- ====================================================================
-- 步骤5: 导入上下文加载数据
-- ====================================================================

-- 5.1 导入上下文加载配置
INSERT OR IGNORE INTO context_load_config 
SELECT * FROM data.context_load_config;

-- 5.2 导入上下文条件词
INSERT OR IGNORE INTO context_conditional_words 
SELECT * FROM data.context_conditional_words;

-- 5.3 导入上下文否定词
INSERT OR IGNORE INTO context_negation_words 
SELECT * FROM data.context_negation_words;

-- 注意: context_load_logs为日志表，不导入历史数据

SELECT '✅ 步骤5完成: 导入上下文加载数据' as status;

-- ====================================================================
-- 步骤6: 验证导入结果
-- ====================================================================

SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' as divider;
SELECT '📊 违规检测表统计' as info;
SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' as divider;

SELECT 'violation_detection_config' as 表名, COUNT(*) as 记录数 
FROM violation_detection_config;

SELECT 'violation_fix_templates' as 表名, COUNT(*) as 记录数 
FROM violation_fix_templates;

SELECT 'violation_keyword_weights' as 表名, COUNT(*) as 记录数 
FROM violation_keyword_weights;

SELECT 'violation_whitelist' as 表名, COUNT(*) as 记录数 
FROM violation_whitelist;

SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' as divider;
SELECT '📊 上下文加载表统计' as info;
SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' as divider;

SELECT 'context_load_config' as 表名, COUNT(*) as 记录数 
FROM context_load_config;

SELECT 'context_conditional_words' as 表名, COUNT(*) as 记录数 
FROM context_conditional_words;

SELECT 'context_negation_words' as 表名, COUNT(*) as 记录数 
FROM context_negation_words;

SELECT 'context_load_logs' as 表名, COUNT(*) as 记录数 
FROM context_load_logs;

-- ====================================================================
-- 步骤7: 分离data数据库
-- ====================================================================
DETACH DATABASE data;

SELECT '✅ 步骤7完成: 分离data数据库' as status;

-- ====================================================================
-- 步骤8: 最终总结
-- ====================================================================
SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' as divider;
SELECT '🎉 数据整合完成!' as status;
SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' as divider;

SELECT '已导入8张高价值表:' as summary;
SELECT '  - 违规检测表: 4张' as detail;
SELECT '  - 上下文加载表: 4张' as detail;

-- ====================================================================
-- 完成
-- ====================================================================

