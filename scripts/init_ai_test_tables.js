const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'liuxin.db');
const sqlPath = path.join(__dirname, '..', 'sql', 'create_ai_test_tables.sql');

console.log('📁 数据库路径:', dbPath);
console.log('📁 SQL文件路径:', sqlPath);

const db = new sqlite3.Database(dbPath);
const sql = fs.readFileSync(sqlPath, 'utf8');

db.exec(sql, (err) => {
  if (err) {
    console.error('❌ 错误:', err.message);
    process.exit(1);
  } else {
    console.log('✅ AI测试表创建成功！\n');
    
    // 查询已创建的表
    db.all(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ai_test%'`,
      [],
      (err, tables) => {
        if (err) {
          console.error('❌ 查询表错误:', err);
        } else {
          console.log('📊 已创建的表:');
          tables.forEach(t => console.log('   -', t.name));
          console.log('');
        }
        
        // 查询已插入的规则
        db.all(
          `SELECT rule_code, rule_name, priority FROM ai_test_rules ORDER BY priority DESC`,
          [],
          (err, rules) => {
            if (err) {
              console.error('❌ 查询规则错误:', err);
            } else {
              console.log('📋 已插入规则数量:', rules.length);
              rules.forEach(r => {
                console.log(`   - [${r.rule_code}] ${r.rule_name} (优先级: ${r.priority})`);
              });
            }
            
            db.close();
            console.log('\n✅ Phase 1.1 完成！数据库表和规则已就绪。');
          }
        );
      }
    );
  }
});









