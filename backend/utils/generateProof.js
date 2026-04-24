const crypto = require("crypto");

const APP_SECRET = "6233b84135fd2b65555dbf52ca98d70f";

const generateProof = (accessToken) => {
    return crypto
        .createHmac("sha256", APP_SECRET)
        .update(accessToken)
        .digest("hex");
};

module.exports = generateProof;