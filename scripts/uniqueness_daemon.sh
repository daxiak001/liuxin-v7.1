#!/bin/bash
# 系统唯一性检查守护进程
# 每日自动检查，防止系统分裂

LOG_FILE="/home/ubuntu/liuxin-system/logs/uniqueness-check.log"
MAIN_SYSTEM="/home/ubuntu/liuxin-system"
MAIN_DB="$MAIN_SYSTEM/liuxin.db"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_duplicate_databases() {
    log "🔍 检查重复数据库..."
    
    # 查找所有liuxin.db文件
    local dbs=$(find /home/ubuntu /var/www -name "liuxin.db" 2>/dev/null)
    local count=$(echo "$dbs" | wc -l)
    
    if [ "$count" -gt 1 ]; then
        log "⚠️  警告: 发现 $count 个数据库文件!"
        log "$dbs"
        
        # 保留主系统，标记其他为可疑
        echo "$dbs" | grep -v "$MAIN_DB" | while read db; do
            log "🔴 可疑数据库: $db"
            # 发送告警（可集成邮件/钉钉等）
        done
        
        return 1
    else
        log "✅ 数据库唯一性检查通过"
        return 0
    fi
}

check_duplicate_services() {
    log "🔍 检查重复服务进程..."
    
    # 查找所有liuxin/mcp进程
    local procs=$(ps aux | grep -E "liuxin|l0-mcp-server" | grep -v grep)
    local count=$(echo "$procs" | grep -c "node")
    
    if [ "$count" -gt 2 ]; then
        log "⚠️  警告: 发现 $count 个疑似重复进程!"
        log "$procs"
        return 1
    else
        log "✅ 服务进程检查通过"
        return 0
    fi
}

check_port_conflicts() {
    log "🔍 检查端口冲突..."
    
    # 检查3002端口
    local port_3002=$(netstat -tuln | grep ":3002" | wc -l)
    
    if [ "$port_3002" -gt 1 ]; then
        log "⚠️  警告: 端口3002存在冲突!"
        netstat -tuln | grep ":3002" | tee -a "$LOG_FILE"
        return 1
    else
        log "✅ 端口唯一性检查通过"
        return 0
    fi
}

check_system_directories() {
    log "🔍 检查系统目录..."
    
    # 查找可疑系统目录
    local dirs=$(find /home/ubuntu /var/www -type d -name "*liuxin*" -o -name "*xiaoliu*" 2>/dev/null)
    local count=$(echo "$dirs" | wc -l)
    
    if [ "$count" -gt 3 ]; then
        log "⚠️  警告: 发现 $count 个系统相关目录，可能存在冗余"
        log "$dirs"
        return 1
    else
        log "✅ 系统目录检查通过"
        return 0
    fi
}

# 主检查流程
main() {
    log "════════════════════════════════════════"
    log "🛡️  开始系统唯一性检查"
    log "════════════════════════════════════════"
    
    local issues=0
    
    check_duplicate_databases || ((issues++))
    check_duplicate_services || ((issues++))
    check_port_conflicts || ((issues++))
    check_system_directories || ((issues++))
    
    log "════════════════════════════════════════"
    if [ "$issues" -eq 0 ]; then
        log "✅ 系统唯一性检查完成: 全部通过"
    else
        log "⚠️  系统唯一性检查完成: 发现 $issues 个问题"
        log "🔔 请检查日志并处理异常情况"
    fi
    log "════════════════════════════════════════"
}

main

