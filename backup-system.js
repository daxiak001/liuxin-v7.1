#!/usr/bin/env node

/**
 * 柳芯系统备份脚本
 * 功能：备份核心文件到本地备份目录
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sourceDir = __dirname;
const backupDir = path.join(sourceDir, '备份-2025-11-01');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

console.log('📦 开始备份柳芯系统...\n');
console.log(`源目录: ${sourceDir}`);
console.log(`备份目录: ${backupDir}\n`);

// 确保备份目录存在
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

// 需要备份的文件和目录
const backupItems = [
    // 核心JavaScript文件
    '*.js',
    '!node_modules/**/*.js',
    '!备份-*/**/*.js',
    
    // 配置文件
    '.cursorrules',
    'package.json',
    'package-lock.json',
    
    // 数据库文件
    'liuxin.db',
    
    // 锁定配置
    'locks/',
    
    // 重要文档
    '*.md',
    '!node_modules/**/*.md',
    '!备份-*/**/*.md',
    
    // MCP工具目录
    'mcp_tools/',
    
    // 监控目录
    'monitoring/',
    
    // SQL脚本
    'sql/',
    
    // 脚本目录
    'scripts/',
    
    // 其他重要文件
    'feature-registry.json',
    'monitoring-points-count.json',
    
    // 系统文档
    '📘【柳芯系统完整文档】.json'
];

// 排除的目录和文件
const excludePatterns = [
    'node_modules',
    '备份-*',
    '*.log',
    '*.db-shm',
    '*.db-wal',
    '.git',
    'archives',
    '备份-2025-10-31'
];

// 手动备份核心文件
const coreFiles = [
    'liuxin-mcp-server-unified.js',
    'ResponseInterceptor.js',
    'v7.3-core-logic.js',
    'fusion-phase2-memory-loader.js',
    'ConfigHotReloadManager.js',
    'StatisticsGuardian.js',
    'archive-manager.js',
    'package.json',
    'liuxin.db',
    '.cursorrules'
];

// 核心目录
const coreDirs = [
    'locks',
    'mcp_tools',
    'monitoring',
    'sql',
    'scripts'
];

console.log('📋 开始复制文件...\n');

let copiedCount = 0;
let errorCount = 0;

// 复制单个文件
function copyFile(src, dest) {
    try {
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        fs.copyFileSync(src, dest);
        console.log(`✅ ${path.basename(src)}`);
        copiedCount++;
        return true;
    } catch (err) {
        console.error(`❌ ${path.basename(src)}: ${err.message}`);
        errorCount++;
        return false;
    }
}

// 复制目录
function copyDir(src, dest) {
    try {
        if (!fs.existsSync(src)) {
            console.log(`⚠️ 目录不存在: ${src}`);
            return false;
        }
        
        // 创建目标目录
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        
        const entries = fs.readdirSync(src, { withFileTypes: true });
        let copied = 0;
        
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            
            // 跳过排除项
            if (excludePatterns.some(pattern => {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                return regex.test(entry.name);
            })) {
                continue;
            }
            
            if (entry.isDirectory()) {
                copyDir(srcPath, destPath);
                copied++;
            } else {
                copyFile(srcPath, destPath);
                copied++;
            }
        }
        
        if (copied > 0) {
            console.log(`📁 ${path.basename(src)}/ (${copied} 项)`);
        }
        
        return true;
    } catch (err) {
        console.error(`❌ 目录 ${path.basename(src)}: ${err.message}`);
        errorCount++;
        return false;
    }
}

// 备份核心文件
console.log('📄 备份核心文件...\n');
for (const file of coreFiles) {
    const srcPath = path.join(sourceDir, file);
    if (fs.existsSync(srcPath)) {
        const destPath = path.join(backupDir, file);
        copyFile(srcPath, destPath);
    }
}

// 备份核心目录
console.log('\n📁 备份核心目录...\n');
for (const dir of coreDirs) {
    const srcPath = path.join(sourceDir, dir);
    const destPath = path.join(backupDir, dir);
    copyDir(srcPath, destPath);
}

// 备份所有.md文档（排除node_modules和备份目录）
console.log('\n📝 备份文档文件...\n');
function backupMarkdownFiles(dir, baseDir) {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(baseDir, fullPath);
            
            // 排除不需要的目录
            if (entry.name === 'node_modules' || 
                entry.name.startsWith('备份-') ||
                entry.name === '.git' ||
                entry.name === 'archives') {
                continue;
            }
            
            if (entry.isDirectory()) {
                backupMarkdownFiles(fullPath, baseDir);
            } else if (entry.name.endsWith('.md') || entry.name.endsWith('.json')) {
                const destPath = path.join(backupDir, relativePath);
                const destDir = path.dirname(destPath);
                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true });
                }
                copyFile(fullPath, destPath);
            }
        }
    } catch (err) {
        // 忽略权限错误等
    }
}

backupMarkdownFiles(sourceDir, sourceDir);

// 生成备份清单
console.log('\n📋 生成备份清单...\n');
const manifest = {
    backupTime: timestamp,
    sourceDir: sourceDir,
    backupDir: backupDir,
    copiedFiles: copiedCount,
    errors: errorCount,
    version: 'v8.1.3',
    note: '柳芯系统完整备份'
};

const manifestPath = path.join(backupDir, '备份清单.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
console.log(`✅ 备份清单已生成: ${manifestPath}`);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 备份完成统计');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`✅ 成功复制: ${copiedCount} 项`);
console.log(`❌ 错误: ${errorCount} 项`);
console.log(`📁 备份位置: ${backupDir}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (errorCount === 0) {
    console.log('✅ 本地备份完成！');
    process.exit(0);
} else {
    console.log('⚠️ 备份完成，但有部分错误');
    process.exit(1);
}
