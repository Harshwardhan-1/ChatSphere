import axios from "axios";
import { env } from "../configs/env.config";

const baseURL = `${env.backendUrl}/api/v1`;
const axiosInstance = axios.create({
    baseURL,
    withCredentials: true,
});

axiosInstance.interceptors.request.use((config) => {
    const token = localStorage.getItem("accessToken");
    if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

let isRefreshing = false;

let failedQueue: {
    resolve: (token: string) => void;
    reject: (error: unknown) => void;
}[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
    failedQueue.forEach((promise) => {
        if (error) {
            promise.reject(error);
        } else {
            promise.resolve(token!);
        }
    });
    failedQueue = [];
};

axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        const isAuthEndpoint =
            originalRequest?.url?.includes("/auth/refresh-token") ||
            originalRequest?.url?.includes("/auth/login") ||
            originalRequest?.url?.includes("/auth/register") ||
            originalRequest?.url?.includes("/auth/google");

        // Trigger refresh if status is 401 or backend sends token expired
        const isTokenExpired =
            error.response?.status === 401 ||
            error.response?.data?.message === "jwt expired" ||
            error.response?.data?.message === "Access token expired or invalid";

        if (!isTokenExpired || !originalRequest || originalRequest._retry || isAuthEndpoint) {
            return Promise.reject(error);
        }

        if (isRefreshing) {
            return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            }).then((token) => {
                originalRequest.headers = originalRequest.headers || {};
                originalRequest.headers.Authorization = `Bearer ${token}`;
                return axiosInstance(originalRequest);
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
            const response = await axios.post(
                `${baseURL}/auth/refresh-token`,
                {},
                { withCredentials: true }
            );

            const newToken = response.data.accessToken;

            localStorage.setItem("accessToken", newToken);
            axiosInstance.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
            processQueue(null, newToken);

            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${newToken}`;

            return axiosInstance(originalRequest);
        } catch (refreshError) {
            processQueue(refreshError, null);
            localStorage.removeItem("accessToken");
            if (window.location.pathname !== "/login" && window.location.pathname !== "/signup") {
                window.location.href = "/login";
            }
            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    }
);

export default axiosInstance;