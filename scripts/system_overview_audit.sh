#!/bin/bash
# system_overview_audit.sh
# 系统总览审查脚本

echo "=== 系统总览审查开始 $(date) ==="
echo ""

DB_PATH="/home/ubuntu/liuxin-system/liuxin.db"
SYSTEM_PATH="/home/ubuntu/liuxin-system"

# 1. 统计文件
echo "【步骤1】统计系统文件..."
TOTAL_FILES=$(find $SYSTEM_PATH -type f ! -path "*/node_modules/*" ! -path "*/.git/*" | wc -l)
TOTAL_SIZE=$(du -sm $SYSTEM_PATH --exclude=node_modules --exclude=.git 2>/dev/null | cut -f1)
CODE_FILES=$(find $SYSTEM_PATH -type f \( -name "*.js" -o -name "*.sql" \) ! -path "*/node_modules/*" | wc -l)
CONFIG_FILES=$(find $SYSTEM_PATH -type f \( -name "*.json" -o -name "*.yml" -o -name "*.yaml" \) ! -path "*/node_modules/*" | wc -l)
DATA_FILES=$(find $SYSTEM_PATH -type f -name "*.db" | wc -l)

echo "  总文件数: $TOTAL_FILES"
echo "  总大小: ${TOTAL_SIZE}MB"
echo "  代码文件: $CODE_FILES"
echo "  配置文件: $CONFIG_FILES"
echo "  数据库文件: $DATA_FILES"
echo ""

# 2. 统计规则
echo "【步骤2】统计规则数量..."
TOTAL_RULES=$(sqlite3 $DB_PATH "SELECT COUNT(*) FROM liuxin_system_rules WHERE status='active'")
P10_RULES=$(sqlite3 $DB_PATH "SELECT COUNT(*) FROM liuxin_system_rules WHERE priority=10 AND status='active'")
P9_RULES=$(sqlite3 $DB_PATH "SELECT COUNT(*) FROM liuxin_system_rules WHERE priority=9 AND status='active'")
P8_RULES=$(sqlite3 $DB_PATH "SELECT COUNT(*) FROM liuxin_system_rules WHERE priority=8 AND status='active'")
P7_RULES=$(sqlite3 $DB_PATH "SELECT COUNT(*) FROM liuxin_system_rules WHERE priority=7 AND status='active'")

echo "  总规则数: $TOTAL_RULES"
echo "  优先级10（核心铁律）: $P10_RULES"
echo "  优先级9（强制规则）: $P9_RULES"
echo "  优先级8（重要规则）: $P8_RULES"
echo "  优先级7（建议规则）: $P7_RULES"
echo ""

# 3. 统计数据库
echo "【步骤3】统计数据库..."
TOTAL_TABLES=$(sqlite3 $DB_PATH ".tables" | wc -w)
TOTAL_RECORDS=$(sqlite3 $DB_PATH "SELECT SUM(cnt) FROM (SELECT COUNT(*) as cnt FROM roles UNION ALL SELECT COUNT(*) FROM skills UNION ALL SELECT COUNT(*) FROM experiences UNION ALL SELECT COUNT(*) FROM dialog_logs)")
DB_SIZE=$(du -sm $DB_PATH 2>/dev/null | cut -f1)

echo "  数据表数量: $TOTAL_TABLES"
echo "  数据记录数: $TOTAL_RECORDS"
echo "  数据库大小: ${DB_SIZE}MB"
echo ""

# 4. 检查服务状态
echo "【步骤4】检查服务状态..."
SERVICES_RUNNING=$(ps aux | grep -E "(node.*liuxin|node.*mcp)" | grep -v grep | wc -l)
API_ENDPOINTS=$(curl -s http://localhost:3002/api/endpoints 2>/dev/null | grep -o "path" | wc -l || echo "0")

echo "  运行服务数: $SERVICES_RUNNING"
echo "  API端点数: $API_ENDPOINTS"
echo ""

# 5. 完整性检查
echo "【步骤5】完整性检查..."
RULES_COMPLETE=1
DATA_COMPLETE=1
FILES_COMPLETE=1
ISSUES_FOUND=0
ISSUES_DETAIL=""

# 检查关键文件
if [ ! -f "$SYSTEM_PATH/l0-mcp-server-http.js" ]; then
    ISSUES_DETAIL="${ISSUES_DETAIL}关键文件缺失: l0-mcp-server-http.js; "
    FILES_COMPLETE=0
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

if [ ! -f "$SYSTEM_PATH/liuxin.db" ]; then
    ISSUES_DETAIL="${ISSUES_DETAIL}数据库文件缺失: liuxin.db; "
    FILES_COMPLETE=0
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# 检查规则数量
if [ $TOTAL_RULES -lt 40 ]; then
    ISSUES_DETAIL="${ISSUES_DETAIL}规则数量不足: ${TOTAL_RULES}/44; "
    RULES_COMPLETE=0
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# 检查数据完整性
if [ $TOTAL_RECORDS -lt 300 ]; then
    ISSUES_DETAIL="${ISSUES_DETAIL}数据记录不足: ${TOTAL_RECORDS}/366; "
    DATA_COMPLETE=0
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

echo "  规则完整性: $(if [ $RULES_COMPLETE -eq 1 ]; then echo '✅ 通过'; else echo '❌ 不通过'; fi)"
echo "  数据完整性: $(if [ $DATA_COMPLETE -eq 1 ]; then echo '✅ 通过'; else echo '❌ 不通过'; fi)"
echo "  文件完整性: $(if [ $FILES_COMPLETE -eq 1 ]; then echo '✅ 通过'; else echo '❌ 不通过'; fi)"
echo "  发现问题数: $ISSUES_FOUND"
echo ""

# 6. 记录审查结果
echo "【步骤6】记录审查结果..."
OVERALL_STATUS="healthy"
if [ $ISSUES_FOUND -gt 0 ]; then
    OVERALL_STATUS="warning"
fi
if [ $ISSUES_FOUND -gt 3 ]; then
    OVERALL_STATUS="critical"
fi

sqlite3 $DB_PATH <<EOF
INSERT INTO system_overview_audit (
    total_files, total_size_mb, code_files, config_files, data_files,
    total_rules, priority_10_rules, priority_9_rules, priority_8_rules, priority_7_rules,
    total_tables, total_records, db_size_mb,
    services_running, api_endpoints,
    rules_complete, data_complete, files_complete, config_complete,
    issues_found, issues_detail, overall_status, audit_notes
) VALUES (
    $TOTAL_FILES, $TOTAL_SIZE, $CODE_FILES, $CONFIG_FILES, $DATA_FILES,
    $TOTAL_RULES, $P10_RULES, $P9_RULES, $P8_RULES, $P7_RULES,
    $TOTAL_TABLES, $TOTAL_RECORDS, $DB_SIZE,
    $SERVICES_RUNNING, $API_ENDPOINTS,
    $RULES_COMPLETE, $DATA_COMPLETE, $FILES_COMPLETE, 1,
    $ISSUES_FOUND, "$ISSUES_DETAIL", "$OVERALL_STATUS", "定期自动审查"
);
