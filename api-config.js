(() => {
    const protocol = window.location.protocol === "http:" || window.location.protocol === "https:"
        ? window.location.protocol
        : "http:";
    const host = window.location.hostname || "localhost";

    const isPrivateIpv4 =
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
    const isLoopbackHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
    const isLocalHost = isLoopbackHost || isPrivateIpv4 || host.endsWith(".local");

    window.HR_API_CONFIG = {
        baseUrl: isLocalHost
            ? `${protocol}//${host}:4000`
            : window.location.origin
    };
})();
