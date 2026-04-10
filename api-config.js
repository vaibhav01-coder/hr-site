(() => {
    const protocol = window.location.protocol === "http:" || window.location.protocol === "https:"
        ? window.location.protocol
        : "http:";
    const host = window.location.hostname || "localhost";

    window.HR_API_CONFIG = {
        baseUrl: `${protocol}//${host}:4000`
    };
})();
