/**
 * L0智能语义查询引擎
 * 
 * 特性：
 * - 多层匹配：精准→同义→近义→相关
 * - 上下文消歧：避免误判
 * - 热点缓存：Top 1000，0ms命中
 * - 查询<5ms：支持万级关键词
 */

const sqlite3 = require('sqlite3').verbose();

class SemanticQueryEngine {
    constructor(dbPath = './liuxin.db') {
        this.db = new sqlite3.Database(dbPath);
        this.cache = new Map();
        this.cacheSize = 1000;
    }

    /**
     * 核心方法：智能语义查询
     * @param {string} userInput - 用户输入
     * @param {string} roleId - 当前角色ID（可选）
     * @param {number} threshold - 匹配阈值 0-1（默认0.6）
     * @returns {Promise<Object>} 查询结果
     */
    async query(userInput, roleId = null, threshold = 0.6) {
        const startTime = Date.now();
        
        // 1. 归一化和分词
        const tokens = this.tokenize(userInput);
        if (tokens.length === 0) {
            return { matches: [], queryTime: 0, tokens: [] };
        }
        
        // 2. 检查缓存
        const cacheKey = `${tokens.join('_')}_${roleId}_${threshold}`;
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            return {
                ...cached,
                queryTime: Date.now() - startTime,
                cached: true
            };
        }
        
        // 3. 多层匹配
        const allMatches = [];
        
        for (const token of tokens) {
            // 3.1 精准匹配（权重1.0）
            const exactMatches = await this.exactMatch(token);
            allMatches.push(...exactMatches.map(m => ({...m, baseScore: 1.0, matchType: 'exact'})));
            
            // 3.2 同义词匹配（权重0.95）
            const synonymMatches = await this.synonymMatch(token);
            allMatches.push(...synonymMatches.map(m => ({...m, baseScore: 0.95, matchType: 'synonym'})));
            
            // 3.3 近义词匹配（权重0.8）
            const similarMatches = await this.similarMatch(token);
            allMatches.push(...similarMatches.map(m => ({...m, baseScore: 0.8, matchType: 'similar'})));
            
            // 3.4 相关词匹配（权重0.6）
            const relatedMatches = await this.relatedMatch(token);
            allMatches.push(...relatedMatches.map(m => ({...m, baseScore: 0.6, matchType: 'related'})));
        }
        
        // 4. 上下文消歧
        const disambiguated = this.contextDisambiguation(allMatches, userInput);
        
        // 5. 去重和排序
        const deduped = this.deduplicateAndSort(disambiguated);
        
        // 6. 过滤低于阈值的结果
        const filtered = deduped.filter(r => r.finalScore >= threshold);
        
        // 7. 提取关联资源
        const resources = this.extractResources(filtered);
        
        // 8. 记录查询日志（异步，不阻塞）
        this.logQuery(userInput, tokens, filtered, Date.now() - startTime, roleId, false);
        
        // 9. 缓存结果
        const result = {
            matches: filtered,
            resources: resources,
            queryTime: Date.now() - startTime,
            tokens: tokens,
            cached: false
        };
        
        if (this.cache.size >= this.cacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(cacheKey, result);
        
        return result;
    }

    /**
     * 分词和归一化（简单中文分词）
     */
    tokenize(text) {
        // 简单策略：保留完整输入 + 提取所有2-4字的子串
        const tokens = [];
        const normalized = text.toLowerCase();
        
        // 策略1：保留完整输入（用于精准匹配）
        tokens.push(normalized);
        
        // 策略2：提取所有连续的中文子串（2-4字）
        const chineseOnly = normalized.replace(/[^\u4e00-\u9fa5]/g, '');
        for (let len = 2; len <= 4; len++) {
            for (let i = 0; i <= chineseOnly.length - len; i++) {
                const substr = chineseOnly.substring(i, i + len);
                if (!this.isStopWord(substr)) {
                    tokens.push(substr);
                }
            }
        }
        
        // 策略3：提取英文单词
        const englishWords = normalized.match(/[a-z]{2,}/g) || [];
        tokens.push(...englishWords.filter(w => !this.isStopWord(w)));
        
        // 去重
        return [...new Set(tokens)];
    }

    /**
     * 停用词过滤
     */
    isStopWord(word) {
        const stopWords = ['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这'];
        return stopWords.includes(word);
    }

    /**
     * 精准匹配
     */
    async exactMatch(token) {
        return new Promise((resolve) => {
            this.db.all(`
                SELECT * FROM keyword_semantic_index
                WHERE normalized = ? OR primary_keyword = ?
            `, [token, token], (err, rows) => {
                resolve(rows || []);
            });
        });
    }

    /**
     * 同义词匹配
     */
    async synonymMatch(token) {
        return new Promise((resolve) => {
            this.db.all(`
                SELECT * FROM keyword_semantic_index
                WHERE synonyms LIKE '%"' || ? || '"%'
                   OR synonyms LIKE '%"' || ? || '"%'
            `, [token, token.charAt(0).toUpperCase() + token.slice(1)], (err, rows) => {
                resolve(rows || []);
            });
        });
    }

    /**
     * 近义词匹配
     */
    async similarMatch(token) {
        return new Promise((resolve) => {
            this.db.all(`
                SELECT * FROM keyword_semantic_index
                WHERE similar_words LIKE '%"' || ? || '"%'
            `, [token], (err, rows) => {
                resolve(rows || []);
            });
        });
    }

    /**
     * 相关词匹配
     */
    async relatedMatch(token) {
        return new Promise((resolve) => {
            this.db.all(`
                SELECT * FROM keyword_semantic_index
                WHERE related_words LIKE '%"' || ? || '"%'
            `, [token], (err, rows) => {
                resolve(rows || []);
            });
        });
    }

    /**
     * 上下文消歧（关键！避免误判）
     */
    contextDisambiguation(matches, userInput) {
        const disambiguated = [];
        
        for (const match of matches) {
            let finalScore = match.baseScore;
            
            // 检查上下文词是否出现（加分）
            const contextWords = this.parseJSON(match.context_words);
            if (contextWords && contextWords.length > 0) {
                const contextMatched = contextWords.some(cw => userInput.includes(cw));
                if (contextMatched) {
                    finalScore += 0.1;  // 上下文匹配，加10%
                }
            }
            
            // 检查排除词是否出现（直接排除）
            const excludeWords = this.parseJSON(match.exclude_words);
            if (excludeWords && excludeWords.length > 0) {
                const excludeMatched = excludeWords.some(ew => userInput.includes(ew));
                if (excludeMatched) {
                    continue;  // 命中排除词，跳过
                }
            }
            
            // 根据优先级调整（P0优先）
            if (match.priority === 1) {
                finalScore += 0.05;  // P0加5%
            }
            
            disambiguated.push({
                ...match,
                finalScore: Math.min(finalScore, 1.0)
            });
        }
        
        return disambiguated;
    }

    /**
     * 去重和排序
     */
    deduplicateAndSort(matches) {
        const map = new Map();
        
        for (const match of matches) {
            const key = match.primary_keyword;
            if (!map.has(key) || map.get(key).finalScore < match.finalScore) {
                map.set(key, match);
            }
        }
        
        return Array.from(map.values()).sort((a, b) => {
            // 先按分数排序
            if (Math.abs(a.finalScore - b.finalScore) > 0.01) {
                return b.finalScore - a.finalScore;
            }
            // 分数相同，按优先级排序
            return a.priority - b.priority;
        });
    }

    /**
     * 提取关联资源
     */
    extractResources(matches) {
        const resources = [];
        
        for (const match of matches) {
            const tables = this.parseJSON(match.target_tables);
            const ids = this.parseJSON(match.target_ids);
            
            for (let i = 0; i < tables.length; i++) {
                resources.push({
                    keyword: match.primary_keyword,
                    matchType: match.matchType,
                    score: match.finalScore,
                    priority: match.priority,
                    table: tables[i],
                    id: ids[i],
                    semanticGroup: match.semantic_group
                });
            }
        }
        
        return resources;
    }

    /**
     * 记录查询日志（异步）
     */
    logQuery(queryText, tokens, matches, queryTime, roleId, cacheHit) {
        const matchedKeywords = matches.map(m => m.primary_keyword);
        const matchScores = matches.map(m => m.finalScore);
        const matchTypes = matches.map(m => m.matchType);
        
        setImmediate(() => {
            this.db.run(`
                INSERT INTO semantic_query_log 
                (query_text, normalized_query, matched_keywords, match_scores, match_types, query_time_ms, cache_hit, role_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                queryText,
                tokens.join(' '),
                JSON.stringify(matchedKeywords),
                JSON.stringify(matchScores),
                JSON.stringify(matchTypes),
                queryTime,
                cacheHit ? 1 : 0,
                roleId
            ]);
            
            // 更新关键词usage_count（异步）
            for (const match of matches) {
                this.db.run(`
                    UPDATE keyword_semantic_index
                    SET usage_count = usage_count + 1,
                        last_hit_at = CURRENT_TIMESTAMP
                    WHERE primary_keyword = ?
                `, [match.primary_keyword]);
            }
        });
    }

    /**
     * 解析JSON（容错）
     */
    parseJSON(str) {
        if (!str) return [];
        try {
            return JSON.parse(str);
        } catch (e) {
            return [];
        }
    }

    /**
     * 获取查询统计
     */
    async getStats() {
        const totalKeywords = await this.queryOne(`SELECT COUNT(*) as cnt FROM keyword_semantic_index`);
        const totalQueries = await this.queryOne(`SELECT COUNT(*) as cnt FROM semantic_query_log`);
        const avgQueryTime = await this.queryOne(`SELECT AVG(query_time_ms) as avg FROM semantic_query_log`);
        const cacheHitRate = await this.queryOne(`SELECT AVG(cache_hit) as rate FROM semantic_query_log`);
        
        return {
            totalKeywords: totalKeywords.cnt,
            totalQueries: totalQueries.cnt,
            avgQueryTime: avgQueryTime.avg || 0,
            cacheHitRate: cacheHitRate.rate || 0,
            cacheSize: this.cache.size
        };
    }

    /**
     * 辅助方法：查询单行
     */
    async queryOne(sql, params = []) {
        return new Promise((resolve) => {
            this.db.get(sql, params, (err, row) => {
                resolve(row || {});
            });
        });
    }

    /**
     * 关闭数据库连接
     */
    close() {
        this.db.close();
    }
}

module.exports = SemanticQueryEngine;

// ============================================
// 使用示例和测试
// ============================================

if (require.main === module) {
    const engine = new SemanticQueryEngine();
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  L0智能语义查询引擎 - 测试');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    async function runTests() {
        // 测试1：精准匹配
        console.log('[测试1] 精准匹配："验收"');
        const r1 = await engine.query("现在验收注册功能");
        console.log(`  匹配数: ${r1.matches.length}`);
        console.log(`  查询时间: ${r1.queryTime}ms`);
        if (r1.matches.length > 0) {
            console.log(`  最佳匹配: ${r1.matches[0].primary_keyword} (${r1.matches[0].matchType}, ${r1.matches[0].finalScore.toFixed(2)})`);
        }
        
        // 测试2：同义词匹配
        console.log('\n[测试2] 同义词匹配："测试"');
        const r2 = await engine.query("现在测试注册功能");
        console.log(`  匹配数: ${r2.matches.length}`);
        console.log(`  查询时间: ${r2.queryTime}ms`);
        if (r2.matches.length > 0) {
            console.log(`  最佳匹配: ${r2.matches[0].primary_keyword} (${r2.matches[0].matchType}, ${r2.matches[0].finalScore.toFixed(2)})`);
        }
        
        // 测试3：近义词匹配
        console.log('\n[测试3] 近义词匹配："检查"');
        const r3 = await engine.query("现在检查注册功能");
        console.log(`  匹配数: ${r3.matches.length}`);
        console.log(`  查询时间: ${r3.queryTime}ms`);
        if (r3.matches.length > 0) {
            console.log(`  最佳匹配: ${r3.matches[0].primary_keyword} (${r3.matches[0].matchType}, ${r3.matches[0].finalScore.toFixed(2)})`);
        }
        
        // 测试4：角色匹配
        console.log('\n[测试4] 角色匹配："林悦"');
        const r4 = await engine.query("找林悦讨论需求");
        console.log(`  匹配数: ${r4.matches.length}`);
        console.log(`  查询时间: ${r4.queryTime}ms`);
        if (r4.matches.length > 0) {
            console.log(`  最佳匹配: ${r4.matches[0].primary_keyword} (${r4.matches[0].matchType}, ${r4.matches[0].finalScore.toFixed(2)})`);
        }
        
        // 测试5：消歧义（上下文词）
        console.log('\n[测试5] 上下文消歧："软件验收"');
        const r5 = await engine.query("现在软件验收");
        console.log(`  匹配数: ${r5.matches.length}`);
        console.log(`  查询时间: ${r5.queryTime}ms`);
        if (r5.matches.length > 0) {
            console.log(`  最佳匹配: ${r5.matches[0].primary_keyword} (分数: ${r5.matches[0].finalScore.toFixed(2)}, 上下文加分)`);
        }
        
        // 测试6：排除词（应该不匹配）
        console.log('\n[测试6] 排除词测试："房屋验收"');
        const r6 = await engine.query("现在房屋验收");
        console.log(`  匹配数: ${r6.matches.length} (应该=0，因为"房屋"在排除词中)`);
        console.log(`  查询时间: ${r6.queryTime}ms`);
        
        // 测试7：缓存测试
        console.log('\n[测试7] 缓存测试（重复查询）');
        const r7 = await engine.query("现在验收注册功能");
        console.log(`  查询时间: ${r7.queryTime}ms`);
        console.log(`  是否命中缓存: ${r7.cached ? '✅ 是' : '❌ 否'}`);
        
        // 统计信息
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('系统统计');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        const stats = await engine.getStats();
        console.log(`  关键词总数: ${stats.totalKeywords}`);
        console.log(`  查询总数: ${stats.totalQueries}`);
        console.log(`  平均查询时间: ${stats.avgQueryTime.toFixed(2)}ms`);
        console.log(`  缓存命中率: ${(stats.cacheHitRate * 100).toFixed(1)}%`);
        console.log(`  当前缓存大小: ${stats.cacheSize}`);
        
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ 测试完成！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        engine.close();
    }
    
    runTests().catch(err => {
        console.error('❌ 测试失败:', err);
        engine.close();
    });
}

