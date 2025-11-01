-- ============================================
-- AI验收测试框架 - 测试角色和技能
-- 创建时间: 2025-10-24
-- 版本: v1.0
-- ============================================

-- 插入测试相关技能到skills表

-- 测试工程师技能
INSERT OR IGNORE INTO skills (
  id, role_id, name, description, category, level, proficiency_level, 
  usage_count, upgrade_threshold, prerequisites, related_knowledge, created_at
) VALUES
('skill_ai_test_execution', 'test_engineer', 'AI测试执行',
 '根据场景自动执行AI验收测试并验证结果。触发条件：代码变更、新功能、Bug修复。执行步骤：识别场景→选择策略→执行测试→验证证据→分析结果',
 'testing', 5, 90, 0, 100,
 '["场景识别", "策略选择", "证据验证"]',
 '["AI验收测试框架", "测试策略", "证据链"]',
 datetime('now')),

('skill_test_strategy_selection', 'test_engineer', '测试策略选择',
 '智能选择最适合的测试策略组合。触发条件：代码变更、收到测试请求。执行步骤：分析变更→评估风险→查询规则→推荐策略→验证可用性',
 'testing', 5, 85, 0, 100,
 '["风险评估", "规则匹配"]',
 '["测试规则库", "策略映射"]',
 datetime('now')),

('skill_evidence_validation', 'test_engineer', '证据验证',
 '验证测试证据的完整性和有效性。触发条件：测试执行后。执行步骤：检查截图→分析日志→验证报告→交叉验证→生成摘要',
 'testing', 5, 80, 0, 100,
 '["日志分析", "报告生成"]',
 '["证据收集器", "验证器"]',
 datetime('now')),

('skill_bug_analysis', 'test_engineer', 'Bug分析',
 '深度分析测试失败原因并提供修复方案。触发条件：测试失败。执行步骤：收集失败信息→分析根因→查找相似问题→生成修复建议',
 'debugging', 4, 75, 0, 80,
 '["日志分析", "错误追踪"]',
 '["调试工具", "失败模式库"]',
 datetime('now'));

-- 开发助手技能（新增测试相关）
INSERT OR IGNORE INTO skills (
  id, role_id, name, description, category, level, proficiency_level,
  usage_count, upgrade_threshold, prerequisites, created_at
) VALUES
('skill_auto_test_after_code', 'dev_assistant', '代码后自动测试',
 '在生成或修改代码后自动执行相关测试验证',
 'testing', 3, 70, 0, 60,
 '["代码生成", "测试执行"]',
 datetime('now')),
 
('skill_test_driven_development', 'dev_assistant', '测试驱动开发',
 '采用TDD方法，先写测试再写实现',
 'development', 3, 65, 0, 60,
 '["测试设计", "重构"]',
 datetime('now'));

-- 质量保障专员技能
INSERT OR IGNORE INTO skills (
  id, role_id, name, description, category, level, proficiency_level,
  usage_count, upgrade_threshold, prerequisites, related_knowledge, created_at
) VALUES
('skill_comprehensive_testing', 'qa_specialist', '全面测试',
 '执行全面的质量保障测试。触发条件：发布前、重大变更。执行步骤：规划测试范围→执行完整套件→收集所有证据→生成质量报告',
 'testing', 5, 95, 0, 120,
 '["测试规划", "测试执行", "质量分析"]',
 '["测试框架", "质量标准", "发布流程"]',
 datetime('now')),

('skill_regression_testing', 'qa_specialist', '回归测试',
 '定期执行回归测试确保系统稳定性。触发条件：每日定时。执行步骤：识别核心功能→执行回归套件→对比历史基线→标记退化',
 'testing', 4, 85, 0, 100,
 '["测试自动化", "基线管理"]',
 '["回归套件", "基线数据"]',
 datetime('now')),

('skill_performance_analysis', 'qa_specialist', '性能分析',
 '分析系统性能并提供优化建议。触发条件：性能问题。执行步骤：执行性能测试→对比基线→识别瓶颈→生成优化建议',
 'performance', 4, 80, 0, 100,
 '["性能测试", "数据分析"]',
 '["性能基准", "优化模式"]',
 datetime('now')),

('skill_security_audit', 'qa_specialist', '安全审计',
 '执行安全审计并评估风险。触发条件：安全相关变更、每周定时。执行步骤：执行安全扫描→分析漏洞→评估风险→生成审计报告',
 'security', 5, 90, 0, 120,
 '["安全扫描", "漏洞分析"]',
 '["安全规范", "漏洞库", "审计标准"]',
 datetime('now'));

-- 查看插入结果
SELECT 
  role_id,
  id as skill_id,
  name,
  category,
  level,
  proficiency_level
FROM skills
WHERE id LIKE '%test%' OR id LIKE '%qa%' OR category = 'testing'
ORDER BY role_id, id;

