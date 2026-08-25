import axios from "axios";

const API = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || "https://social-backend.parmarketing.co.uk/api",
});

export default API;