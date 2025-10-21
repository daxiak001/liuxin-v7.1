#!/bin/bash
# weekly_rule_audit.sh
# 每周规则审计脚本

echo "=== 规则审计开始 $(date) ==="
echo ""

DB_PATH="/home/ubuntu/liuxin-system/liuxin.db"

# 1. 统计规则数量
echo "【步骤1】统计规则数量"
RULE_COUNT=$(sqlite3 $DB_PATH "SELECT COUNT(*) FROM liuxin_system_rules")
echo "  云端核心规则: $RULE_COUNT 条"

CLOUD_RULES=$(sqlite3 $DB_PATH "SELECT COUNT(*) FROM cloud_connection_rules")
echo "  云端连接规则: $CLOUD_RULES 条"

UC_RULES=$(sqlite3 $DB_PATH "SELECT COUNT(*) FROM understanding_confirmation_rules")
echo "  理解确认规则: $UC_RULES 条"

TOTAL=$((RULE_COUNT + CLOUD_RULES + UC_RULES))
echo "  云端规则总计: $TOTAL 条"
echo ""

# 2. 检查待处理反馈
echo "【步骤2】检查待处理规则反馈"
PENDING=$(sqlite3 $DB_PATH "SELECT COUNT(*) FROM user_rule_feedback WHERE status=\"pending\"" 2>/dev/null || echo "0")
echo "  待处理反馈: $PENDING 条"
echo ""

# 3. 检查待同步项
echo "【步骤3】检查待同步项"
PENDING_SYNC=$(sqlite3 $DB_PATH "SELECT COUNT(*) FROM pending_sync WHERE status=\"pending\"" 2>/dev/null || echo "0")
echo "  待同步项: $PENDING_SYNC 条"
echo ""

# 4. 提取最近对话中的规则关键词
echo "【步骤4】提取最近7天对话中的规则"
sqlite3 $DB_PATH "SELECT content FROM dialog_logs WHERE created_at > datetime(\"now\", \"-7 days\") AND (content LIKE \"%必须%\" OR content LIKE \"%禁止%\") LIMIT 5;" 2>/dev/null || echo "  (无对话记录)"
echo ""

# 5. 生成审计报告
echo "【步骤5】生成审计报告"
AUDIT_FILE="/home/ubuntu/liuxin-system/logs/rule_audit_$(date +%Y%m%d).txt"
mkdir -p /home/ubuntu/liuxin-system/logs

cat > $AUDIT_FILE <<EOF
规则审计报告
审计时间: $(date)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
规则数量统计:
  - 云端核心规则: $RULE_COUNT 条
  - 云端连接规则: $CLOUD_RULES 条
  - 理解确认规则: $UC_RULES 条
  - 总计: $TOTAL 条

待处理项:
  - 待处理反馈: $PENDING 条
  - 待同步项: $PENDING_SYNC 条

审计结果:
  $(if [ $PENDING -gt 0 ] || [ $PENDING_SYNC -gt 0 ]; then echo "⚠️  需要处理待办项"; else echo "✅ 无待办项"; fi)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
