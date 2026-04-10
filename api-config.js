(() => {
    const protocol = window.location.protocol === "http:" || window.location.protocol === "https:"
        ? window.location.protocol
        : "http:";
    const host = window.location.hostname || "localhost";
    const isLocalHost = host === "localhost" || host === "127.0.0.1";

    window.HR_API_CONFIG = {
        baseUrl: isLocalHost
            ? `${protocol}//${host}:4000`
            : window.location.origin
    };
})();
