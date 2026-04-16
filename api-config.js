(() => {
    const protocol = window.location.protocol === "http:" || window.location.protocol === "https:"
        ? window.location.protocol
        : "http:";
    const host = window.location.hostname || "localhost";
    const sameOrigin = window.location.origin && window.location.origin !== "null"
        ? window.location.origin
        : `${protocol}//${host}`;

    const isPrivateIpv4 =
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
    const isLoopbackHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
    const isLocalHost = isLoopbackHost || isPrivateIpv4 || host.endsWith(".local");
    const queryBase = new URLSearchParams(window.location.search).get("apiBase");
    let storedBase = "";
    try {
        storedBase = localStorage.getItem("hr_api_base_url") || "";
    } catch {
        storedBase = "";
    }
    const manualBase = String(queryBase || storedBase || "").trim();

    window.HR_API_CONFIG = {
        baseUrl: manualBase || (isLocalHost
            ? `${protocol}//${host}:4000`
            : sameOrigin)
    };
})();
