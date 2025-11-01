/**
 * 融合方案 Phase 2.2: 优化的P0/P1/P2/P3记忆加载器
 * 版本: v7.5.0
 * 
 * 核心改进：
 * 1. 根据场景区分加载策略（对话=目录，开发=详情）
 * 2. 支持动态按需加载
 * 3. 目录/详情分离
 */

const sqlite3 = require('sqlite3').verbose();
const SceneDetector = require('./fusion-phase2-scene-detector.js');

class FusionMemoryLoader {
    constructor(dbPath = './liuxin.db') {
        this.db = new sqlite3.Database(dbPath);
        this.sceneDetector = new SceneDetector();
        this.loadedDetails = new Set();  // 记录已加载的详情

        // v7.9.4: 添加目录数据缓存（性能优化）
        this.catalogCache = {
            data: null,           // 缓存的目录数据
            timestamp: null,      // 缓存时间戳
            ttl: 5 * 60 * 1000   // 缓存5分钟
        };

        console.log('✅ FusionMemoryLoader初始化 (v7.9.4 - 带缓存优化)');
    }

    // ============================================================
    // P0级别：基础索引（40% token占用触发）
    // ============================================================

    /**
     * 加载P0记忆（所有场景通用）
     */
    async loadP0Memory(scene, roleName = '开发工程师-小柳') {
        console.log(`🔄 [P0] 加载基础索引...`);

        const memory = {
            level: 'P0',
            scene: scene,
            data: {}
        };

        // 角色记忆（通用）
        memory.data.role_memory = await this.loadRoleMemory(roleName);

        // 项目索引（通用）
        memory.data.project_index = await this.loadProjectIndex();

        // 开发场景额外加载技能记忆
        if (scene === 'develop') {
            memory.data.skills_memory = await this.loadSkillsMemory(roleName);
        }

        console.log(`✅ [P0] 加载完成`);
        return memory;
    }

    async loadRoleMemory(roleName) {
        return new Promise((resolve) => {
            this.db.get('SELECT * FROM role_memory WHERE role_name = ?', [roleName], (err, row) => {
                if (err || !row) {
                    resolve({ role_name: roleName, current_task: '开发工作' });
                } else {
                    resolve(row);
                }
            });
        });
    }

    async loadProjectIndex() {
        return {
            project_name: '柳芯系统',
            version: 'v7.5.0',
            description: '智能预加载系统'
        };
    }

    async loadSkillsMemory(roleName) {
        return new Promise((resolve) => {
            this.db.all(
                'SELECT skill_name, usage_count, success_rate FROM role_skill_index WHERE role_name = ? ORDER BY usage_count DESC LIMIT 5',
                [roleName],
                (err, rows) => {
                    resolve(rows || []);
                }
            );
        });
    }

    // ============================================================
    // P1级别：目录或详情（60% token占用触发）
    // ============================================================

    /**
     * 加载P1记忆（根据场景区分）
     */
    async loadP1Memory(scene, userInput = '') {
        console.log(`🔄 [P1] 加载${scene === 'dialogue' ? '目录索引' : '按需详情'}...`);

        const memory = {
            level: 'P1',
            scene: scene,
            data: {}
        };

        if (scene === 'dialogue' || scene === 'plan') {
            // 对话/规划场景：仅加载目录
            memory.data = await this.loadCatalogs();

        } else if (scene === 'develop') {
            // 开发场景：按需加载详情
            const neededDetails = this.sceneDetector.detectDetailLoadNeeded(userInput);
            if (neededDetails.need_detail) {
                memory.data = await this.loadDetailsByType(neededDetails.type);
            } else {
                // 开发初期：也先加载目录
                memory.data = await this.loadCatalogs();
            }

        } else if (scene === 'debug' || scene === 'test') {
            // 调试/测试场景：加载经验详情
            memory.data = await this.loadExperiencesDetails(userInput);
        }

        console.log(`✅ [P1] 加载完成`);
        return memory;
    }

    /**
     * 加载目录索引（对话场景）
     * v7.9.4: 添加缓存机制，提升性能
     */
    async loadCatalogs() {
        // 检查缓存是否有效
        const now = Date.now();
        if (this.catalogCache.data &&
            this.catalogCache.timestamp &&
            (now - this.catalogCache.timestamp < this.catalogCache.ttl)) {
            console.log('   ⚡ 使用缓存的目录数据（命中！）');
            return this.catalogCache.data;
        }

        console.log('   📋 加载目录索引（仅名称）...');

        const [features, apis, experiences, tables, tools] = await Promise.all([
            this.loadFeaturesCatalog(),
            this.loadApisCatalog(),
            this.loadExperiencesCatalog(),
            this.loadDatabaseTablesCatalog(),
            this.loadMCPToolsCatalog()
        ]);

        const catalogs = {
            features_catalog: features,
            apis_catalog: apis,
            experiences_catalog: experiences,
            database_tables_catalog: tables,
            mcp_tools_catalog: tools
        };

        // 更新缓存
        this.catalogCache.data = catalogs;
        this.catalogCache.timestamp = now;
        console.log('   ✅ 目录数据已缓存（5分钟）');

        return catalogs;
    }

    async loadFeaturesCatalog() {
        return new Promise((resolve) => {
            this.db.all('SELECT id, name, category, status FROM features_catalog_simple LIMIT 100', (err, rows) => {
                resolve(rows || []);
            });
        });
    }

    async loadApisCatalog() {
        return new Promise((resolve) => {
            this.db.all('SELECT path, method, purpose, category FROM api_catalog_simple LIMIT 100', (err, rows) => {
                resolve(rows || []);
            });
        });
    }

    async loadExperiencesCatalog() {
        return new Promise((resolve) => {
            this.db.all('SELECT id, title, category, solved FROM experiences_catalog_simple ORDER BY id DESC LIMIT 50', (err, rows) => {
                resolve(rows || []);
            });
        });
    }

    async loadDatabaseTablesCatalog() {
        return new Promise((resolve) => {
            this.db.all('SELECT table_name, purpose, category FROM database_tables_catalog_simple ORDER BY category LIMIT 100', (err, rows) => {
                resolve(rows || []);
            });
        });
    }

    async loadMCPToolsCatalog() {
        return new Promise((resolve) => {
            this.db.all('SELECT tool_name, purpose, category FROM mcp_tools_catalog_simple', (err, rows) => {
                resolve(rows || []);
            });
        });
    }

    /**
     * 按类型加载详情（开发场景）
     */
    async loadDetailsByType(type) {
        console.log(`   📖 按需加载详情类型: ${type}...`);

        if (type === 'api_usage') {
            return await this.loadApisDetails();
        } else if (type === 'tool_usage') {
            return await this.loadToolsDetails();
        } else if (type === 'table_structure') {
            return await this.loadTablesDetails();
        }

        return {};
    }

    async loadApisDetails() {
        return new Promise((resolve) => {
            this.db.all('SELECT * FROM api_catalog_full LIMIT 10', (err, rows) => {
                resolve({ apis_details: rows || [] });
            });
        });
    }

    async loadToolsDetails() {
        return new Promise((resolve) => {
            this.db.all('SELECT * FROM mcp_tools_catalog_full', (err, rows) => {
                resolve({ tools_details: rows || [] });
            });
        });
    }

    async loadTablesDetails() {
        return new Promise((resolve) => {
            this.db.all('SELECT * FROM database_tables_catalog_full LIMIT 20', (err, rows) => {
                resolve({ tables_details: rows || [] });
            });
        });
    }

    /**
     * 加载经验详情（调试场景）
     */
    async loadExperiencesDetails(userInput) {
        console.log('   📖 加载相关经验详情...');

        // 提取关键词
        const keywords = this.extractKeywords(userInput);

        return new Promise((resolve) => {
            const searchPattern = `%${keywords[0] || ''}%`;

            this.db.all(
                'SELECT * FROM experiences WHERE title LIKE ? OR content LIKE ? ORDER BY reference_count DESC LIMIT 5',
                [searchPattern, searchPattern],
                (err, rows) => {
                    resolve({ experiences_details: rows || [] });
                }
            );
        });
    }

    extractKeywords(text) {
        const techKeywords = ['MCP', '拦截器', '数据库', 'API', 'WebSocket', '错误', '失效'];
        const found = [];

        techKeywords.forEach(keyword => {
            if (text && text.includes(keyword)) {
                found.push(keyword);
            }
        });

        return found.length > 0 ? found : [''];
    }

    // ============================================================
    // P2级别：补充详情（70% token占用触发）
    // ============================================================

    async loadP2Memory(scene) {
        console.log(`🔄 [P2] 加载补充详情...`);

        // P2仅在开发/调试场景触发
        if (scene !== 'develop' && scene !== 'debug') {
            console.log('   ⏭️  对话场景不触发P2');
            return null;
        }

        return {
            level: 'P2',
            scene: scene,
            data: {
                message: 'P2级别预留（根据具体需求动态加载）'
            }
        };
    }

    // ============================================================
    // P3级别：技术债务（80% token占用触发）
    // ============================================================

    async loadP3Memory(scene) {
        console.log(`🔄 [P3] 加载技术债务...`);

        // P3仅在开发场景触发
        if (scene !== 'develop') {
            console.log('   ⏭️  非开发场景不触发P3');
            return null;
        }

        return new Promise((resolve) => {
            this.db.all(
                'SELECT * FROM technical_debt WHERE status = ? LIMIT 10',
                ['open'],
                (err, rows) => {
                    resolve({
                        level: 'P3',
                        scene: scene,
                        data: {
                            technical_debt: rows || []
                        }
                    });
                }
            );
        });
    }

    // ============================================================
    // 完整加载流程
    // ============================================================

    async loadMemoryByScene(userInput, roleName = '开发工程师-小柳') {
        // 1. 场景识别
        const sceneInfo = this.sceneDetector.detectScene(userInput);
        console.log('\n' + this.sceneDetector.generateSceneReport(sceneInfo));

        // 2. 加载P0
        const p0 = await this.loadP0Memory(sceneInfo.scene, roleName);

        // 3. 加载P1
        const p1 = await this.loadP1Memory(sceneInfo.scene, userInput);

        return {
            scene: sceneInfo,
            memory: {
                P0: p0,
                P1: p1
            },
            summary: this.generateSummary(sceneInfo, p0, p1)
        };
    }

    generateSummary(scene, p0, p1) {
        let summary = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        summary += `📊 加载摘要\n`;
        summary += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        summary += `🎯 场景: ${scene.description}\n`;
        summary += `📋 策略: ${scene.loadStrategy}\n\n`;
        summary += `P0层级:\n`;
        summary += `  - 角色记忆: ✅\n`;
        summary += `  - 项目索引: ✅\n`;
        if (p0.data.skills_memory) {
            summary += `  - 技能记忆: ✅ (${p0.data.skills_memory.length}条)\n`;
        }
        summary += `\nP1层级:\n`;
        if (p1.data.features_catalog) {
            summary += `  - 功能目录: ✅ (${p1.data.features_catalog.length}条)\n`;
            summary += `  - API目录: ✅ (${p1.data.apis_catalog.length}条)\n`;
            summary += `  - 经验目录: ✅ (${p1.data.experiences_catalog.length}条)\n`;
            summary += `  - 数据库表目录: ✅ (${p1.data.database_tables_catalog.length}条)\n`;
            summary += `  - MCP工具目录: ✅ (${p1.data.mcp_tools_catalog.length}条)\n`;
        } else if (p1.data.experiences_details) {
            summary += `  - 经验详情: ✅ (${p1.data.experiences_details.length}条)\n`;
        } else if (p1.data.apis_details) {
            summary += `  - API详情: ✅ (${p1.data.apis_details.length}条)\n`;
        }
        summary += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        return summary;
    }

    close() {
        this.db.close();
    }
}

// ============================================================
// 测试代码
// ============================================================
if (require.main === module) {
    const loader = new FusionMemoryLoader();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 融合记忆加载器测试');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    async function runTests() {
        // 测试1：对话场景
        console.log('\n\n📝 测试1：对话场景 - "系统有哪些统计功能？"');
        const result1 = await loader.loadMemoryByScene('系统有哪些统计功能？');
        console.log(result1.summary);

        // 测试2：开发场景
        console.log('\n\n📝 测试2：开发场景 - "如何调用经验API？"');
        const result2 = await loader.loadMemoryByScene('如何调用经验API？');
        console.log(result2.summary);

        // 测试3：调试场景
        console.log('\n\n📝 测试3：调试场景 - "MCP拦截器失效了"');
        const result3 = await loader.loadMemoryByScene('MCP拦截器失效了');
        console.log(result3.summary);

        loader.close();
        console.log('\n✅ 所有测试完成！\n');
    }

    runTests();
}

module.exports = FusionMemoryLoader;


