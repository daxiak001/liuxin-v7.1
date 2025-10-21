#!/bin/bash
# 自动清理定时任务
# 定期清理临时文件、旧日志、过期备份

LOG_FILE="/home/ubuntu/liuxin-system/logs/auto-cleanup.log"
SYSTEM_DIR="/home/ubuntu/liuxin-system"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cleanup_temp_files() {
    log "🧹 清理临时文件..."
    
    local count=$(find "$SYSTEM_DIR" -type f \( -name "*.tmp" -o -name "*.temp" -o -name ".*.swp" \) -mtime +1 | wc -l)
    
    if [ "$count" -gt 0 ]; then
        find "$SYSTEM_DIR" -type f \( -name "*.tmp" -o -name "*.temp" -o -name ".*.swp" \) -mtime +1 -delete
        log "✅ 清理了 $count 个临时文件"
    else
        log "✅ 无需清理临时文件"
    fi
}

cleanup_old_logs() {
    log "🧹 清理旧日志..."
    
    # 保留最近7天的日志
    local count=$(find "$SYSTEM_DIR/logs" -type f -name "*.log" -mtime +7 | wc -l)
    
    if [ "$count" -gt 0 ]; then
        find "$SYSTEM_DIR/logs" -type f -name "*.log" -mtime +7 -delete
        log "✅ 清理了 $count 个旧日志文件"
    else
        log "✅ 无需清理旧日志"
    fi
}

cleanup_old_backups() {
    log "🧹 清理过期备份..."
    
    # 保留最近30天的备份
    local count=$(find /home/ubuntu/archives -type f -name "*.tar.gz" -mtime +30 2>/dev/null | wc -l)
    
    if [ "$count" -gt 0 ]; then
        find /home/ubuntu/archives -type f -name "*.tar.gz" -mtime +30 -delete 2>/dev/null
        log "✅ 清理了 $count 个过期备份文件"
    else
        log "✅ 无需清理过期备份"
    fi
}

cleanup_npm_cache() {
    log "🧹 清理npm缓存..."
    
    if [ -d "/home/ubuntu/.npm" ]; then
        local size_before=$(du -sh /home/ubuntu/.npm | awk '{print $1}')
        npm cache clean --force 2>/dev/null
        local size_after=$(du -sh /home/ubuntu/.npm | awk '{print $1}')
        log "✅ npm缓存清理: $size_before -> $size_after"
    else
        log "✅ 无npm缓存需要清理"
    fi
}

# 主清理流程
main() {
    log "════════════════════════════════════════"
    log "🧹 开始自动清理任务"
    log "════════════════════════════════════════"
    
    cleanup_temp_files
    cleanup_old_logs
    cleanup_old_backups
    cleanup_npm_cache
    
    log "════════════════════════════════════════"
    log "✅ 自动清理任务完成"
    log "════════════════════════════════════════"
}

main

