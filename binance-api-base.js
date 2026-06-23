/**
 * 解析“交易执行 API”（Next-k-protocol，默认 8001）的根地址。
 *
 * 它与 api-base.js 必须分开：首页的大部分数据来自策略 API，而账户、实时持仓和信号执行
 * 日志来自 Protocol。混用端口会把业务请求发到错误服务。
 */
function resolveProtocolApiBase() {
    try {
        const ls = localStorage.getItem('PROTOCOL_API_BASE');
        if (ls) return String(ls).replace(/\/$/, '');
    } catch (e) { /* ignore */ }
    const h = window.location.hostname;
    const proto = window.location.protocol;
    if (h === 'localhost' || h === '127.0.0.1') {
        return 'http://127.0.0.1:8001';
    }
    if (proto === 'file:' || !h) {
        return 'http://127.0.0.1:8001';
    }
    return 'http://13.158.69.58:8001';
    //return 'https://next-k-protocol-production.up.railway.app';
}

try {
    // Protocol 令牌同样只允许维护操作临时放入 sessionStorage。
    localStorage.removeItem('PROTOCOL_MAINTENANCE_TOKEN');
} catch (e) { /* ignore */ }
