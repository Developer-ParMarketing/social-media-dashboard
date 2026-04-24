const axios = require("axios");

const BASE_URL = "https://graph.facebook.com";

const fbClient = axios.create({
    baseURL: BASE_URL,
});

module.exports = fbClient;