#!/bin/bash
# 自动数据库备份脚本
# 每日凌晨2点执行

DB_PATH="/home/ubuntu/liuxin-system/liuxin.db"
BACKUP_DIR="/home/ubuntu/liuxin-system/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/liuxin-auto-backup-$DATE.db"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 执行备份
cp "$DB_PATH" "$BACKUP_FILE"

# 压缩备份
gzip "$BACKUP_FILE"

# 清理30天前的备份
find "$BACKUP_DIR" -name "liuxin-auto-backup-*.db.gz" -mtime +30 -delete

# 记录日志
echo "$(date): 数据库备份完成 - $BACKUP_FILE.gz" >> "$BACKUP_DIR/backup.log"

