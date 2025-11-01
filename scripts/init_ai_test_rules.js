const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../liuxin.db');
const sqlFilePath = path.join(__dirname, '../sql/add_ai_test_rules_to_unified.sql');

console.log(`📁 数据库路径: ${dbPath}`);
console.log(`📁 SQL文件路径: ${sqlFilePath}`);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ 数据库连接错误:', err.message);
        process.exit(1);
    }
});

const sql = fs.readFileSync(sqlFilePath, 'utf8');

db.exec(sql, (err) => {
    if (err) {
        console.error('❌ 错误: 执行SQL失败:', err.message);
        process.exit(1);
    } else {
        console.log('✅ AI测试规则添加成功！');

        db.all(
            "SELECT rule_code, rule_name, priority, severity, enabled FROM liuxin_rules_unified WHERE rule_code LIKE 'AI-TEST-%' ORDER BY priority DESC",
            [],
            (err, rules) => {
                if (err) {
                    console.error('❌ 查询规则失败:', err.message);
                    process.exit(1);
                }

                console.log('\n📋 已添加规则数量:', rules.length);
                console.log('\n规则列表:');
                rules.forEach(rule => {
                    console.log(`   ✅ [${rule.rule_code}] ${rule.rule_name}`);
                    console.log(`      优先级: ${rule.priority} | 严重性: ${rule.severity} | 状态: ${rule.enabled ? '启用' : '禁用'}`);
                });

                console.log('\n✅ 规则系统集成完成！');
                console.log('\n📖 使用方法:');
                console.log('   1. 代码变更时会自动触发匹配的规则');
                console.log('   2. 手动触发: POST /api/ai-test/trigger-by-event');
                console.log('   3. 查看规则: GET /api/ai-test/rules-unified');
                console.log('   4. 查看统计: GET /api/ai-test/rule-stats\n');

                db.close();
            }
        );
    }
});





