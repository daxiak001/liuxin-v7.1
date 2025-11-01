/**
 * 🚀 阶段1.2: 三层缓存管理器（L1+L2+L3）
 * 
 * L1: 内存缓存（Map，5分钟TTL，快速响应）
 * L2: SQLite磁盘缓存（24小时TTL，持久化）
 * L3: 云端HTTP API（实时获取）
 * 
 * 防分裂保证: 只使用现有liuxin.db数据库
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class CacheManager {
    constructor(dbPath = './liuxin.db') {
        // L1: 内存缓存
        this.l1Cache = new Map();
        this.l1TTL = 5 * 60 * 1000; // 5分钟
        this.l1MaxSize = 100; // 最多100个条目

        // L2: SQLite磁盘缓存
        this.l2DB = new sqlite3.Database(dbPath);
        this.l2TTL = 24 * 60 * 60 * 1000; // 24小时

        // L3: 云端配置
        this.l3URL = process.env.CLOUD_API_URL || 'http://localhost:3002';

        // 统计数据
        this.stats = {
            l1Hits: 0,
            l1Misses: 0,
            l2Hits: 0,
            l2Misses: 0,
            l3Fetches: 0,
            totalRequests: 0
        };

        // 初始化L2缓存表
        this.initL2Cache();
    }

    /**
     * 初始化L2缓存表（在现有liuxin.db中）
     */
    initL2Cache() {
        this.l2DB.run(`
            CREATE TABLE IF NOT EXISTS cache_l2 (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            )
        `, (err) => {
            if (err) {
                console.error('❌ L2缓存表创建失败:', err.message);
            } else {
                console.log('✅ L2缓存表已初始化');
            }
        });

        // 创建索引
        this.l2DB.run(`
            CREATE INDEX IF NOT EXISTS idx_cache_expires 
            ON cache_l2(expires_at)
        `, (err) => {
            if (err) {
                console.error('❌ L2缓存索引创建失败:', err.message);
            } else {
                console.log('✅ L2缓存索引已创建');
            }
        });
    }

    /**
     * 获取缓存数据（三层查找）
     * @param {string} key - 缓存键
     * @param {Function} fetchFunction - L3获取函数
     * @returns {Promise<any>} - 缓存值
     */
    async get(key, fetchFunction) {
        this.stats.totalRequests++;
        const now = Date.now();

        // ========== L1: 内存缓存检查 ==========
        const l1Data = this.l1Cache.get(key);
        if (l1Data && !this.isExpired(l1Data.timestamp, this.l1TTL, now)) {
            this.stats.l1Hits++;
            console.log(`🟢 L1命中: ${key} (命中率: ${this.getL1HitRate()}%)`);
            return l1Data.value;
        }
        this.stats.l1Misses++;

        // ========== L2: SQLite磁盘缓存检查 ==========
        try {
            const l2Data = await this.getFromL2(key, now);
            if (l2Data) {
                this.stats.l2Hits++;
                const value = JSON.parse(l2Data.value);

                // 升级到L1
                this.setL1(key, value, now);

                console.log(`🟡 L2命中: ${key} (L1未命中→L2命中→升级L1)`);
                return value;
            }
            this.stats.l2Misses++;
        } catch (error) {
            console.error('❌ L2缓存读取失败:', error.message);
        }

        // ========== L3: 云端获取 ==========
        console.log(`🔴 L3获取: ${key} (L1/L2均未命中→云端获取)`);
        this.stats.l3Fetches++;

        const value = await fetchFunction();

        // 保存到L1和L2
        this.setL1(key, value, now);
        await this.setL2(key, value, now);

        return value;
    }

    /**
     * 设置缓存（同时更新L1和L2）
     * @param {string} key - 缓存键
     * @param {any} value - 缓存值
     */
    async set(key, value) {
        const now = Date.now();
        this.setL1(key, value, now);
        await this.setL2(key, value, now);
    }

    /**
     * 删除缓存（同时删除L1和L2）
     * @param {string} key - 缓存键
     */
    async delete(key) {
        // 删除L1
        this.l1Cache.delete(key);

        // 删除L2
        return new Promise((resolve) => {
            this.l2DB.run('DELETE FROM cache_l2 WHERE key = ?', [key], (err) => {
                if (err) console.error('❌ L2缓存删除失败:', err.message);
                resolve();
            });
        });
    }

    /**
     * 清空所有缓存
     */
    async clear() {
        // 清空L1
        this.l1Cache.clear();
        console.log('✅ L1缓存已清空');

        // 清空L2
        return new Promise((resolve) => {
            this.l2DB.run('DELETE FROM cache_l2', (err) => {
                if (err) console.error('❌ L2缓存清空失败:', err.message);
                else console.log('✅ L2缓存已清空');
                resolve();
            });
        });
    }

    /**
     * 清理过期缓存
     */
    async cleanExpired() {
        const now = Date.now();

        // 清理L1
        for (const [key, data] of this.l1Cache.entries()) {
            if (this.isExpired(data.timestamp, this.l1TTL, now)) {
                this.l1Cache.delete(key);
            }
        }

        // 清理L2
        return new Promise((resolve) => {
            this.l2DB.run('DELETE FROM cache_l2 WHERE expires_at < ?', [now], (err) => {
                if (err) console.error('❌ L2过期清理失败:', err.message);
                else console.log('✅ L2过期缓存已清理');
                resolve();
            });
        });
    }

    /**
     * 获取缓存统计信息
     */
    getStats() {
        return {
            ...this.stats,
            l1Size: this.l1Cache.size,
            l1HitRate: this.getL1HitRate(),
            l2HitRate: this.getL2HitRate(),
            overallHitRate: this.getOverallHitRate()
        };
    }

    // ==================== 私有方法 ====================

    /**
     * 从L2获取数据
     */
    getFromL2(key, now) {
        return new Promise((resolve) => {
            this.l2DB.get(
                'SELECT value, expires_at FROM cache_l2 WHERE key = ? AND expires_at > ?',
                [key, now],
                (err, row) => {
                    if (err) {
                        console.error('❌ L2查询失败:', err.message);
                        resolve(null);
                    } else {
                        resolve(row || null);
                    }
                }
            );
        });
    }

    /**
     * 设置L1缓存
     */
    setL1(key, value, timestamp) {
        // LRU淘汰：如果超过最大容量，删除最旧的条目
        if (this.l1Cache.size >= this.l1MaxSize) {
            const firstKey = this.l1Cache.keys().next().value;
            this.l1Cache.delete(firstKey);
        }

        this.l1Cache.set(key, { value, timestamp });
    }

    /**
     * 设置L2缓存
     */
    setL2(key, value, timestamp) {
        return new Promise((resolve) => {
            const expiresAt = timestamp + this.l2TTL;
            this.l2DB.run(
                `INSERT OR REPLACE INTO cache_l2 (key, value, expires_at, updated_at) 
                 VALUES (?, ?, ?, ?)`,
                [key, JSON.stringify(value), expiresAt, timestamp],
                (err) => {
                    if (err) console.error('❌ L2保存失败:', err.message);
                    resolve();
                }
            );
        });
    }

    /**
     * 检查是否过期
     */
    isExpired(timestamp, ttl, now) {
        return (now - timestamp) > ttl;
    }

    /**
     * 计算L1命中率
     */
    getL1HitRate() {
        const total = this.stats.l1Hits + this.stats.l1Misses;
        return total === 0 ? 0 : ((this.stats.l1Hits / total) * 100).toFixed(2);
    }

    /**
     * 计算L2命中率
     */
    getL2HitRate() {
        const total = this.stats.l2Hits + this.stats.l2Misses;
        return total === 0 ? 0 : ((this.stats.l2Hits / total) * 100).toFixed(2);
    }

    /**
     * 计算总体命中率
     */
    getOverallHitRate() {
        const hits = this.stats.l1Hits + this.stats.l2Hits;
        const total = this.stats.totalRequests;
        return total === 0 ? 0 : ((hits / total) * 100).toFixed(2);
    }

    /**
     * 关闭数据库连接
     */
    close() {
        this.l2DB.close((err) => {
            if (err) console.error('❌ 数据库关闭失败:', err.message);
            else console.log('✅ CacheManager已关闭');
        });
    }
}

module.exports = CacheManager;


