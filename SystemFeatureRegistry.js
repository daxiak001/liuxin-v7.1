/**
 * 🎯 柳芯系统 - 功能注册表 v1.0
 * 功能：记录所有已开发的功能，防止"功能失忆症"
 * 创建时间：2025-10-31
 * 创建原因：解决核心问题 - 开发好的功能不会被调用或者忘记该功能的存在
 */

const fs = require('fs');
const path = require('path');

class SystemFeatureRegistry {
    constructor() {
        this.registryPath = path.join(__dirname, 'feature-registry.json');
        this.features = this.loadRegistry();

        console.error('🎯 [FeatureRegistry] 功能注册表已加载');
    }

    /**
     * 加载功能注册表
     */
    loadRegistry() {
        try {
            if (fs.existsSync(this.registryPath)) {
                const data = fs.readFileSync(this.registryPath, 'utf-8');
                const registry = JSON.parse(data);

                console.error(`🎯 [FeatureRegistry] 已注册功能数: ${Object.keys(registry.features || {}).length}`);

                return registry;
            }
        } catch (err) {
            console.error('⚠️ [FeatureRegistry] 无法加载功能注册表:', err.message);
        }

        // 默认注册表结构
        return {
            version: '1.0',
            last_updated: new Date().toISOString(),
            features: {}
        };
    }

    /**
     * 保存功能注册表
     */
    saveRegistry() {
        try {
            this.features.last_updated = new Date().toISOString();
            fs.writeFileSync(this.registryPath, JSON.stringify(this.features, null, 2), 'utf-8');
        } catch (err) {
            console.error('⚠️ [FeatureRegistry] 无法保存功能注册表:', err.message);
        }
    }

    /**
     * 注册新功能
     */
    register(featureId, featureInfo) {
        this.features.features[featureId] = {
            ...featureInfo,
            registered_at: new Date().toISOString(),
            usage_count: 0,
            last_used: null,
            status: 'active'
        };

        this.saveRegistry();

        console.error(`✅ [FeatureRegistry] 已注册功能: ${featureInfo.name} (${featureId})`);
    }

    /**
     * 记录功能使用
     */
    recordUsage(featureId) {
        if (this.features.features[featureId]) {
            this.features.features[featureId].usage_count++;
            this.features.features[featureId].last_used = new Date().toISOString();
            this.saveRegistry();
        }
    }

    /**
     * 获取未使用的功能（可能被遗忘的功能）
     */
    getUnusedFeatures() {
        const unused = [];
        const now = Date.now();
        const ONE_DAY = 24 * 60 * 60 * 1000;

        for (const [featureId, feature] of Object.entries(this.features.features)) {
            if (feature.status !== 'active') continue;

            // 从未使用过
            if (feature.usage_count === 0) {
                unused.push({ featureId, feature, reason: '从未使用' });
                continue;
            }

            // 超过1天未使用
            if (feature.last_used) {
                const lastUsedTime = new Date(feature.last_used).getTime();
                const daysSinceLastUse = Math.floor((now - lastUsedTime) / ONE_DAY);

                if (daysSinceLastUse > 1) {
                    unused.push({
                        featureId,
                        feature,
                        reason: `${daysSinceLastUse}天未使用`
                    });
                }
            }
        }

        return unused;
    }

    /**
     * 显示功能提醒（每次MCP服务器启动时调用）
     */
    showFeatureReminders() {
        const unused = this.getUnusedFeatures();

        if (unused.length === 0) {
            console.error('✅ [FeatureRegistry] 所有功能都在使用中');
            return;
        }

        console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('⚠️ [功能提醒] 以下功能可能被遗忘：');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        unused.forEach(({ featureId, feature, reason }) => {
            console.error(`\n📌 ${feature.name} (${featureId})`);
            console.error(`   状态: ${reason}`);
            console.error(`   描述: ${feature.description}`);
            console.error(`   用途: ${feature.use_case}`);
            if (feature.how_to_use) {
                console.error(`   使用方法: ${feature.how_to_use}`);
            }
        });

        console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    /**
     * 获取所有功能列表
     */
    getAllFeatures() {
        return this.features.features;
    }

    /**
     * 获取功能详情
     */
    getFeature(featureId) {
        return this.features.features[featureId] || null;
    }

    /**
     * 禁用功能
     */
    disableFeature(featureId, reason = '') {
        if (this.features.features[featureId]) {
            this.features.features[featureId].status = 'disabled';
            this.features.features[featureId].disabled_reason = reason;
            this.features.features[featureId].disabled_at = new Date().toISOString();
            this.saveRegistry();

            console.error(`🚫 [FeatureRegistry] 已禁用功能: ${featureId}`);
        }
    }

    /**
     * 启用功能
     */
    enableFeature(featureId) {
        if (this.features.features[featureId]) {
            this.features.features[featureId].status = 'active';
            this.features.features[featureId].enabled_at = new Date().toISOString();
            this.saveRegistry();

            console.error(`✅ [FeatureRegistry] 已启用功能: ${featureId}`);
        }
    }
}

// 初始化并注册所有已知功能
function initializeDefaultFeatures(registry) {
    // 1. 热重载功能
    if (!registry.getFeature('hot-reload')) {
        registry.register('hot-reload', {
            name: '全局热重载',
            description: '监听代码文件变更，自动清除模块缓存，无需重启Cursor',
            use_case: '修改MCP服务器代码后，自动生效',
            how_to_use: '修改代码后自动触发，也可手动调用 HotReloadManager.manualReload()',
            related_files: [
                'HotReloadManager.js',
                'liuxin-mcp-server-unified.js'
            ],
            importance: 'CRITICAL',
            tags: ['开发效率', '自动化']
        });
    }

    // 2. 锁管理器热重载
    if (!registry.getFeature('lock-config-hot-reload')) {
        registry.register('lock-config-hot-reload', {
            name: '锁配置热重载',
            description: '监听lock-config.json变更，自动重新加载配置',
            use_case: '修改模块锁定状态后立即生效',
            how_to_use: '修改lock-config.json文件即可，300ms防抖',
            related_files: [
                'locks/LockManager.js',
                'locks/lock-config.json'
            ],
            importance: 'HIGH',
            tags: ['配置管理', '自动化']
        });
    }

    // 3. 智能预加载器
    if (!registry.getFeature('smart-preloader')) {
        registry.register('smart-preloader', {
            name: '团队模式智能预加载器',
            description: '根据用户输入自动分配AI角色，预加载相关数据',
            use_case: '每次对话开始时自动调用，分配合适的角色',
            how_to_use: '调用 liuxin_smart_preloader 工具',
            related_files: [
                'v7.3-core-logic.js'
            ],
            importance: 'HIGH',
            tags: ['AI角色', '智能分配']
        });
    }

    // 4. 三阶段拦截器
    if (!registry.getFeature('three-phase-interceptor')) {
        registry.register('three-phase-interceptor', {
            name: '三阶段拦截器',
            description: 'Pre/Mid/Post三阶段拦截工具调用，强制执行规则',
            use_case: '拦截所有MCP工具调用，检查是否违反规则',
            how_to_use: '自动在每次工具调用时执行',
            related_files: [
                'liuxin-mcp-server-unified.js (ThreePhaseInterceptor类)'
            ],
            importance: 'CRITICAL',
            tags: ['规则执行', '拦截器']
        });
    }

    // 5. Response拦截器
    if (!registry.getFeature('response-interceptor')) {
        registry.register('response-interceptor', {
            name: 'Response输出拦截器',
            description: '检查AI回复内容，自动添加模板（仅限liuxin_工具）',
            use_case: '确保AI回复符合规范，添加角色标识和统计信息',
            how_to_use: '自动在工具输出时执行（v7.11.0后仅限liuxin_工具）',
            related_files: [
                'ResponseInterceptor.js',
                'liuxin-mcp-server-unified.js'
            ],
            importance: 'HIGH',
            tags: ['输出规范', '模板注入'],
            notes: 'v7.11.0: 已修复过度拦截问题，现在只拦截liuxin_工具'
        });
    }

    // 6. 违规检测器
    if (!registry.getFeature('violation-detector')) {
        registry.register('violation-detector', {
            name: '违规检测器v2.0',
            description: '基于正则引擎的违规检测，准确率100%',
            use_case: '检测AI回复是否违反规则',
            how_to_use: '调用 liuxin_violation_detector 工具',
            related_files: [
                'mcp_tools/violation_detector.js'
            ],
            importance: 'HIGH',
            tags: ['规则检测', '违规检测']
        });
    }
}

// 导出单例
let instance = null;

module.exports = {
    getInstance: function () {
        if (!instance) {
            instance = new SystemFeatureRegistry();
            initializeDefaultFeatures(instance);
        }
        return instance;
    },
    SystemFeatureRegistry: SystemFeatureRegistry
};

