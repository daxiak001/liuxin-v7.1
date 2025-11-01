// 柳芯系统配置文件示例
// 复制为 config.js 使用

module.exports = {
    // 服务器配置
    server: {
        port: process.env.PORT || 3002,
        host: process.env.HOST || 'localhost',
        env: process.env.NODE_ENV || 'development'
    },

    // 数据库配置
    database: {
        path: process.env.DB_PATH || './liuxin.db'
    },

    // WebSocket配置
    websocket: {
        port: process.env.WS_PORT || 64784,
        host: process.env.WS_HOST || 'localhost'
    },

    // CORS配置
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true
    },

    // 日志配置
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        dir: process.env.LOG_DIR || './logs'
    },

    // 云端迁移配置（迁移时修改）
    cloud: {
        enabled: false,
        dbPath: '/home/ubuntu/liuxin-system/liuxin.db',
        host: '0.0.0.0',
        wsHost: '43.142.176.53'
    }
};


