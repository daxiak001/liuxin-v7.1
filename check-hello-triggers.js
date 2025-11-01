/**
 * 检查"你好"触发的规则记录
 * 目的：验证新对话的统计重置是否正常
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'liuxin.db');
const db = new sqlite3.Database(dbPath);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 检查"你好"对话的触发记录');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 获取最近5分钟的触发记录（按时间倒序）
db.all(`
    SELECT 
        trigger_time,
        rule_code,
        rule_name,
        trigger_type,
        action
    FROM rule_trigger_log
    WHERE datetime(trigger_time) > datetime('now', '-5 minutes')
    ORDER BY trigger_time DESC
    LIMIT 100
`, (err, rows) => {
    if (err) {
        console.error('❌ 查询失败:', err.message);
        db.close();
        return;
    }

    console.log(`📋 最近5分钟的触发记录（共 ${rows.length} 条）:\n`);

    if (rows.length === 0) {
        console.log('⚠️ 没有找到最近的触发记录');
        console.log('   可能原因：');
        console.log('   1. 数据库没有实时更新');
        console.log('   2. 触发记录还未写入数据库');
        console.log('   3. 统计功能未正常工作\n');
    } else {
        // 按时间分组显示
        let currentTime = '';
        let ruleSet = new Set();
        let totalCount = 0;

        rows.forEach((row, index) => {
            const timeStr = row.trigger_time.substring(0, 19);

            if (currentTime !== timeStr) {
                if (currentTime !== '') {
                    console.log(`   └─ 小计：${totalCount} 次触发，${ruleSet.size} 个去重规则\n`);
                }
                currentTime = timeStr;
                ruleSet = new Set();
                totalCount = 0;
                console.log(`⏰ ${timeStr}`);
            }

            totalCount++;
            ruleSet.add(row.rule_code);

            console.log(`   ${index + 1}. [${row.rule_code}] ${row.rule_name || '未命名规则'}`);
            console.log(`      类型: ${row.trigger_type} | 动作: ${row.action}`);
        });

        if (totalCount > 0) {
            console.log(`   └─ 小计：${totalCount} 次触发，${ruleSet.size} 个去重规则\n`);
        }

        // 统计去重后的规则数量
        const uniqueRules = new Set(rows.map(r => r.rule_code));
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 统计结果:');
        console.log(`   总触发次数: ${rows.length} 次`);
        console.log(`   去重规则数: ${uniqueRules.size} 条`);
        console.log(`   应显示为: ${uniqueRules.size}/535条`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // 列出所有去重后的规则
        console.log('📝 去重后的规则列表:');
        Array.from(uniqueRules).sort().forEach((code, index) => {
            const rule = rows.find(r => r.rule_code === code);
            console.log(`   ${index + 1}. ${code} - ${rule.rule_name || '未命名'}`);
        });
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 验证说明:');
    console.log('   1. 如果显示的"去重规则数"与AI回复中的"触发 X/535条"一致');
    console.log('      → 说明统计功能100%正常');
    console.log('   2. 如果数量不一致');
    console.log('      → 说明存在问题，需要进一步排查');
    console.log('   3. 如果没有记录');
    console.log('      → 说明数据库记录延迟或统计功能异常');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    db.close();
});

