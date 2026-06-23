/**
 * 解析“策略与数据 API”（next-k-api，默认 8000）的根地址。
 *
 * 优先允许开发者通过 localStorage 临时覆盖；这样无需重新部署静态站点，就能让同一份
 * 前端连接本地、测试或生产 API。返回值统一移除末尾斜杠，调用处可安全拼接 `/api/...`。
 */
function resolveApiBase() {
    try {
        const ls = localStorage.getItem('NEXT_K_API_BASE');
        if (ls) return String(ls).replace(/\/$/, '');
    } catch (e) { /* ignore */ }
    const h = window.location.hostname;
    const proto = window.location.protocol;
    // 静态页面在本机运行时，默认连接本机 API，而不是生产服务。
    if (h === 'localhost' || h === '127.0.0.1') {
        return 'http://127.0.0.1:8000';
    }
    if (proto === 'file:' || !h) {
        return 'http://127.0.0.1:8000';
    }
    return 'http://13.158.69.58:8000';
    //return 'https://next-k-api-production.up.railway.app';
}

try {
    // 不在 localStorage 长期保存维护令牌；敏感操作只使用当前标签页 sessionStorage。
    localStorage.removeItem('NEXT_K_MAINTENANCE_TOKEN');
} catch (e) { /* ignore */ }
