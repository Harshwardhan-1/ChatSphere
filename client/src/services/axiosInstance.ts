import axios from "axios";
import { env } from "../configs/env.config";

const baseURL = `${env.backendUrl}/api/v1`;
const axiosInstance = axios.create({
    baseURL,
    withCredentials: true,
});


//automatic added headers to everycall automatically
axiosInstance.interceptors.request.use((config) => {
    const token = localStorage.getItem("accessToken");

    if (token) {
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

        if (
            error.response?.status !== 401 ||
            !originalRequest ||
            originalRequest._retry ||
            //call the refresh token 
            originalRequest.url?.includes("/auth/refresh-token")
        ) {
            return Promise.reject(error);
        }


        //call the same api again 

        if (isRefreshing) {
            return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            }).then((token) => {
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
            processQueue(null, newToken);

            originalRequest.headers.Authorization = `Bearer ${newToken}`;

            return axiosInstance(originalRequest);
        } catch (refreshError) {
            processQueue(refreshError);
            localStorage.removeItem("accessToken");
            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    }
);

export default axiosInstance;