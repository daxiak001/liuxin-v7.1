const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../liuxin.db');
const sqlFilePath = path.join(__dirname, '../sql/add_test_roles.sql');

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
        console.log('✅ 测试技能添加成功！');

        db.all('SELECT role_id, id, name, category, level FROM skills WHERE category = \'testing\' OR id LIKE \'%test%\' OR id LIKE \'%qa%\' ORDER BY role_id, id', [], (err, skills) => {
            if (err) {
                console.error('❌ 查询技能失败:', err.message);
                process.exit(1);
            }
            console.log('\n📋 已添加测试相关技能数量:', skills.length);
            skills.forEach(skill => console.log(`   - [${skill.role_id}] ${skill.name} (等级: ${skill.level}, 类别: ${skill.category})`));
            console.log('\n✅ Phase 3.1 完成！测试技能已就绪。\n');
            db.close();
        });
    }
});







