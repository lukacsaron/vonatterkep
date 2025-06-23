"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = exports.ApiError = exports.queryClient = void 0;
exports.fetcher = fetcher;
const react_query_1 = require("@tanstack/react-query");
exports.queryClient = new react_query_1.QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30 * 1000, // 30 seconds
            gcTime: 5 * 60 * 1000, // 5 minutes
            retry: 3,
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        },
    },
});
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = 'ApiError';
    }
}
exports.ApiError = ApiError;
async function fetcher(endpoint, options) {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, Object.assign(Object.assign({}, options), { headers: Object.assign({ 'Content-Type': 'application/json' }, options === null || options === void 0 ? void 0 : options.headers) }));
    if (!response.ok) {
        throw new ApiError(response.status, await response.text());
    }
    return response.json();
}
exports.api = {
    get: (endpoint) => fetcher(endpoint),
    post: (endpoint, data) => fetcher(endpoint, {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    put: (endpoint, data) => fetcher(endpoint, {
        method: 'PUT',
        body: JSON.stringify(data),
    }),
    delete: (endpoint) => fetcher(endpoint, {
        method: 'DELETE',
    }),
};
