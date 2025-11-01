/**
 * 数据导出功能模块
 * 项目：测试项目-v7.4验证
 * 版本：1.0.0
 * 作者：柳芯系统-开发工程师-小柳
 * 创建时间：2025-10-24
 * 
 * 依赖：login.js (复用showError和showSuccess函数)
 */

// 导出统计数据
let exportStats = {
    totalExports: 0,
    lastExportTime: null,
    exportHistory: []
};

/**
 * 从表格获取数据
 * @returns {Array} 表格数据数组
 */
function getTableData() {
    const table = document.getElementById('dataTable');
    const headers = [];
    const data = [];

    // 获取表头
    const headerCells = table.querySelectorAll('thead th');
    headerCells.forEach(cell => {
        headers.push(cell.textContent.trim());
    });

    // 获取数据行
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const rowData = {};
        const cells = row.querySelectorAll('td');
        cells.forEach((cell, index) => {
            rowData[headers[index]] = cell.textContent.trim();
        });
        data.push(rowData);
    });

    return { headers, data };
}

/**
 * 导出为CSV格式
 * @param {Array} headers - 表头数组
 * @param {Array} data - 数据数组
 * @returns {string} CSV格式的字符串
 */
function exportToCSV(headers, data) {
    let csv = '';

    // 添加BOM标记，支持中文显示
    csv = '\uFEFF';

    // 添加表头
    csv += headers.join(',') + '\n';

    // 添加数据行
    data.forEach(row => {
        const values = headers.map(header => {
            let value = row[header] || '';
            // 如果值包含逗号、引号或换行符，需要用引号包裹
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                value = '"' + value.replace(/"/g, '""') + '"';
            }
            return value;
        });
        csv += values.join(',') + '\n';
    });

    return csv;
}

/**
 * 导出为JSON格式
 * @param {Array} data - 数据数组
 * @returns {string} JSON格式的字符串（美化格式）
 */
function exportToJSON(data) {
    return JSON.stringify(data, null, 2);
}

/**
 * 下载文件
 * @param {string} content - 文件内容
 * @param {string} filename - 文件名
 * @param {string} mimeType - MIME类型
 * 
 * 修复记录：BUG-001 - 对文件名进行编码处理，避免中文乱码
 */
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    // 修复BUG-001：对文件名进行编码，避免中文乱码
    // 使用encodeURIComponent确保文件名在不同浏览器中正确显示
    link.download = encodeURIComponent(filename);
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();

    // 清理
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * 更新导出统计
 * @param {string} format - 导出格式
 */
function updateExportStats(format) {
    exportStats.totalExports++;
    exportStats.lastExportTime = new Date();
    exportStats.exportHistory.push({
        format: format,
        timestamp: exportStats.lastExportTime,
        recordCount: getTableData().data.length
    });

    // 更新UI显示
    document.getElementById('exportCount').textContent = exportStats.totalExports;

    const lastTime = exportStats.lastExportTime;
    const timeStr = `${lastTime.getHours().toString().padStart(2, '0')}:${lastTime.getMinutes().toString().padStart(2, '0')}`;
    document.getElementById('lastExportTime').textContent = timeStr;

    // 保存到localStorage
    localStorage.setItem('exportStats', JSON.stringify(exportStats));
}

/**
 * 主导出函数
 * @param {string} format - 导出格式 ('csv' 或 'json')
 */
function exportData(format) {
    try {
        // 验证格式
        if (!['csv', 'json'].includes(format)) {
            // 复用login.js中的showError函数
            showError('❌ 不支持的导出格式！');
            return;
        }

        // 获取表格数据
        const { headers, data } = getTableData();

        if (data.length === 0) {
            showError('❌ 没有数据可导出！');
            return;
        }

        let content, filename, mimeType;

        // 根据格式生成文件
        if (format === 'csv') {
            content = exportToCSV(headers, data);
            filename = `数据导出_${getTimestamp()}.csv`;
            mimeType = 'text/csv;charset=utf-8;';
        } else if (format === 'json') {
            content = exportToJSON(data);
            filename = `数据导出_${getTimestamp()}.json`;
            mimeType = 'application/json;charset=utf-8;';
        }

        // 下载文件
        downloadFile(content, filename, mimeType);

        // 更新统计
        updateExportStats(format.toUpperCase());

        // 显示成功消息（复用login.js中的showSuccess函数）
        showSuccess(`✅ 成功导出 ${data.length} 条记录为 ${format.toUpperCase()} 格式！`);

        // 记录日志
        console.log('导出成功', {
            format: format,
            recordCount: data.length,
            filename: filename,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('导出失败', error);
        showError(`❌ 导出失败：${error.message}`);
    }
}

/**
 * 获取时间戳字符串
 * @returns {string} 格式化的时间戳 (YYYYMMDD_HHMMSS)
 */
function getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

/**
 * 页面加载时初始化
 */
window.addEventListener('load', function () {
    // 从localStorage恢复统计数据
    const savedStats = localStorage.getItem('exportStats');
    if (savedStats) {
        try {
            exportStats = JSON.parse(savedStats);
            if (exportStats.totalExports > 0) {
                document.getElementById('exportCount').textContent = exportStats.totalExports;

                const lastTime = new Date(exportStats.lastExportTime);
                const timeStr = `${lastTime.getHours().toString().padStart(2, '0')}:${lastTime.getMinutes().toString().padStart(2, '0')}`;
                document.getElementById('lastExportTime').textContent = timeStr;
            }
        } catch (e) {
            console.error('统计数据解析失败', e);
        }
    }

    console.log('=== 数据导出模块已加载 ===');
    console.log('支持格式: CSV, JSON');
    console.log('记录数量:', getTableData().data.length);
    console.log('========================');
});

// 导出函数供外部使用
window.exportData = exportData;

