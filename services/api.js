import axios from "axios";

const API = axios.create({
    baseURL: "https://social-backend.parmarketing.co.uk/api",
    // baseURL: "http://localhost:5000/api",
});

export default API;