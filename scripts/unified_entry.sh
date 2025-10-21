#!/bin/bash
# 统一入口保护脚本
# 确保所有请求通过主系统，禁止直接访问其他实例

LOG_FILE="/home/ubuntu/liuxin-system/logs/entry-protection.log"
ALLOWED_PORT=3002
MAIN_PROCESS="l0-mcp-server-http.js"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_main_service() {
    log "🔍 检查主服务..."
    
    if ps aux | grep "$MAIN_PROCESS" | grep -v grep > /dev/null; then
        log "✅ 主服务运行正常"
        return 0
    else
        log "❌ 主服务未运行，尝试启动..."
        cd /home/ubuntu/liuxin-system
        nohup node "$MAIN_PROCESS" > /dev/null 2>&1 &
        sleep 2
        
        if ps aux | grep "$MAIN_PROCESS" | grep -v grep > /dev/null; then
            log "✅ 主服务启动成功"
            return 0
        else
            log "❌ 主服务启动失败"
            return 1
        fi
    fi
}

check_port_uniqueness() {
    log "🔍 检查端口唯一性..."
    
    local port_count=$(netstat -tuln | grep ":$ALLOWED_PORT" | wc -l)
    
    if [ "$port_count" -eq 1 ]; then
        log "✅ 端口 $ALLOWED_PORT 唯一性正常"
        return 0
    elif [ "$port_count" -gt 1 ]; then
        log "⚠️  警告: 端口 $ALLOWED_PORT 存在多个监听"
        netstat -tuln | grep ":$ALLOWED_PORT" | tee -a "$LOG_FILE"
        return 1
    else
        log "❌ 端口 $ALLOWED_PORT 未监听"
        return 1
    fi
}

kill_rogue_processes() {
    log "🔍 检查并清理流氓进程..."
    
    # 查找非主系统的liuxin/mcp进程
    ps aux | grep -E "liuxin|mcp" | grep -v grep | grep -v "$MAIN_PROCESS" | while read line; do
        local pid=$(echo "$line" | awk '{print $2}')
        local cmd=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf $i" "; print ""}')
        
        log "🔴 发现流氓进程 PID=$pid: $cmd"
        # 可选择性kill，需要谨慎
        # kill -9 $pid
    done
}

# 主保护流程
main() {
    log "════════════════════════════════════════"
    log "🛡️  开始统一入口保护检查"
    log "════════════════════════════════════════"
    
    check_main_service
    check_port_uniqueness
    kill_rogue_processes
    
    log "════════════════════════════════════════"
    log "✅ 统一入口保护检查完成"
    log "════════════════════════════════════════"
}

main

