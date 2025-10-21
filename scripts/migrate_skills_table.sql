-- ====================================================================
-- skills表数据迁移脚本
-- ====================================================================
-- 目标: 将data DB的技能数据合并到主DB
-- 策略: 保留主DB结构(12字段),转换data DB数据(8字段)
-- 执行时间: 2025-10-20
-- 执行人员: 小柳(开发工程师)
-- ====================================================================

-- ====================================================================
-- 步骤1: 备份现有数据
-- ====================================================================
DROP TABLE IF EXISTS skills_backup;
CREATE TABLE skills_backup AS SELECT * FROM skills;

SELECT '✅ 步骤1完成: 备份skills表' as status, 
       COUNT(*) as backup_count 
FROM skills_backup;

-- ====================================================================
-- 步骤2: 附加data数据库
-- ====================================================================
ATTACH DATABASE '/home/ubuntu/liuxin-system/data/liuxin.db' AS data_db;

SELECT '✅ 步骤2完成: 附加data数据库' as status;

-- ====================================================================
-- 步骤3: 分析数据差异
-- ====================================================================
-- 主DB技能数量
SELECT '📊 主DB技能数量' as info, COUNT(*) as count FROM skills;

-- data DB技能数量
SELECT '📊 data DB技能数量' as info, COUNT(*) as count FROM data_db.skills;

-- data DB独有的技能(多出的1条)
SELECT '🔍 data DB独有技能' as info, 
       skill_name, 
       description, 
       category,
       proficiency_level,
       usage_frequency
FROM data_db.skills 
WHERE skill_name NOT IN (SELECT name FROM skills);

-- ====================================================================
-- 步骤4: 数据结构映射分析
-- ====================================================================
-- 主DB结构(12字段):
--   id, role_id, name, description, category, 
--   level, proficiency_level, usage_count,
--   last_used, prerequisites, upgrade_threshold, created_at

-- data DB结构(8字段):
--   id, role_id, skill_name, description, category,
--   proficiency_level, usage_frequency, last_used_at, created_at

-- 字段映射关系:
--   data.skill_name -> main.name
--   data.proficiency_level -> main.level (同时也是proficiency_level)
--   data.usage_frequency -> main.usage_count
--   data.last_used_at -> main.last_used

-- ====================================================================
-- 步骤5: 插入新技能(字段转换)
-- ====================================================================
INSERT INTO skills (
  id, 
  role_id, 
  name,              -- 从skill_name转换
  description, 
  category,
  level,             -- 从proficiency_level映射
  proficiency_level, 
  usage_count,       -- 从usage_frequency转换
  last_used,         -- 从last_used_at转换
  prerequisites,     -- data DB没有,设为NULL
  upgrade_threshold, -- data DB没有,设为默认值
  created_at
)
SELECT 
  -- 如果id为空,生成新ID(技能名小写+下划线)
  COALESCE(id, lower(replace(skill_name, ' ', '_'))),
  role_id, 
  skill_name,        -- → name
  description, 
  category,
  proficiency_level, -- → level
  proficiency_level, 
  usage_frequency,   -- → usage_count
  last_used_at,      -- → last_used
  NULL,              -- prerequisites默认为空
  CASE 
    WHEN proficiency_level = 1 THEN 10
    WHEN proficiency_level = 2 THEN 20
    WHEN proficiency_level = 3 THEN 50
    WHEN proficiency_level = 4 THEN 100
    ELSE 200
  END,               -- upgrade_threshold根据level计算
  created_at
FROM data_db.skills
WHERE skill_name NOT IN (SELECT name FROM skills);

SELECT '✅ 步骤5完成: 插入新技能' as status;

-- ====================================================================
-- 步骤6: 验证数据完整性
-- ====================================================================
-- 验证总数
SELECT '📊 迁移后技能总数' as info, COUNT(*) as total FROM skills;

-- 验证新增数量(最近1小时创建的)
SELECT '📊 本次新增技能数' as info, 
       COUNT(*) as new_skills 
FROM skills 
WHERE created_at >= datetime('now', '-1 hour');

-- 验证新增技能详情
SELECT '🔍 新增技能详情' as info,
       name,
       category,
       level,
       usage_count,
       created_at
FROM skills 
WHERE created_at >= datetime('now', '-1 hour');

-- 验证数据一致性(检查是否有空字段)
SELECT '⚠️ 数据一致性检查' as info,
       COUNT(*) as records_with_null_name
FROM skills 
WHERE name IS NULL OR name = '';

-- ====================================================================
-- 步骤7: 分离数据库
-- ====================================================================
DETACH DATABASE data_db;

SELECT '✅ 步骤7完成: 分离data数据库' as status;

-- ====================================================================
-- 步骤8: 最终统计
-- ====================================================================
SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' as divider;
SELECT '🎉 数据迁移完成!' as status;
SELECT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' as divider;

SELECT 
  (SELECT COUNT(*) FROM skills_backup) as '迁移前技能数',
  (SELECT COUNT(*) FROM skills) as '迁移后技能数',
  (SELECT COUNT(*) FROM skills) - (SELECT COUNT(*) FROM skills_backup) as '新增技能数';

-- ====================================================================
-- 清理说明
-- ====================================================================
-- 注意: skills_backup表已保留,验证无误后可手动删除:
-- DROP TABLE skills_backup;
-- ====================================================================

