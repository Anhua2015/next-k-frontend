function resolveApiBase() {
    try {
        const ls = localStorage.getItem('NEXT_K_API_BASE');
        if (ls) return String(ls).replace(/\/$/, '');
    } catch (e) { /* ignore */ }
    const h = window.location.hostname;
    const proto = window.location.protocol;
    if (h === 'localhost' || h === '127.0.0.1') {
        return 'http://127.0.0.1:8000';
    }
    if (proto === 'file:' || !h) {
        return 'http://127.0.0.1:8000';
    }
    //return 'http://43.167.241.153:8000'; 
    return 'https://next-k-api-production.up.railway.app';
}

/** Bitget 网格执行层：Next-k-protocol（不经 next-k-api） */
function resolveProtocolBase() {
    try {
        const ls = localStorage.getItem('NEXT_K_PROTOCOL_BASE');
        if (ls) return String(ls).replace(/\/$/, '');
    } catch (e) { /* ignore */ }
    const h = window.location.hostname;
    const proto = window.location.protocol;
    if (h === 'localhost' || h === '127.0.0.1' || proto === 'file:' || !h) {
        return 'http://127.0.0.1:8001';
    }
    // 若 Railway 域名不同：localStorage.setItem('NEXT_K_PROTOCOL_BASE', 'https://...')
    return 'https://next-k-protocol-production.up.railway.app';
}

try {
    localStorage.removeItem('NEXT_K_MAINTENANCE_TOKEN');
} catch (e) { /* ignore */ }
