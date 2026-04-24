const fbClient = require("../utils/fbClient");

const IG_ID = "17841452927493239";

exports.getMedia = async (req, res) => {
    try {
        const response = await fbClient.get(`/v17.0/${IG_ID}/media`, {
            params: {
                fields:
                    "id,caption,media_type,media_url,timestamp,like_count,comments_count",
                access_token: "EAANKDV86S6gBRMrqeSHAtcjZAt9JRcKhfjituzCt9ZCUoobNZCIgRT4bDqkZCpLZCeks83yJtBSxhZBdmNCza1evrqJGkKkWOnLPckLqG01Q5HcHmGxs8ZCFuyKerZAx1jG9W6tPq4RFQsAbU7tjznq4HpFJg0EckvGQnUcZCO23PdOFaq7BYynKbZCZBSYGgwl",
                appsecret_proof: "b4e95a2fbc498da4f06af7f0bcce97f369401e1b87d57d21810867f40f977a77",
            },
        });

        res.json(response.data.data);
    } catch (err) {
        res.status(500).json(err.response?.data);
    }
};

exports.getProfile = async (req, res) => {
    try {
        const response = await fbClient.get(`/v17.0/${IG_ID}`, {
            params: {
                fields: "username,followers_count",
                access_token: "EAANKDV86S6gBRMrqeSHAtcjZAt9JRcKhfjituzCt9ZCUoobNZCIgRT4bDqkZCpLZCeks83yJtBSxhZBdmNCza1evrqJGkKkWOnLPckLqG01Q5HcHmGxs8ZCFuyKerZAx1jG9W6tPq4RFQsAbU7tjznq4HpFJg0EckvGQnUcZCO23PdOFaq7BYynKbZCZBSYGgwl",
                appsecret_proof: "b4e95a2fbc498da4f06af7f0bcce97f369401e1b87d57d21810867f40f977a77",
            },
        });

        res.json(response.data);
    } catch (err) {
        res.status(500).json(err.response?.data);
    }
};

exports.getMediaInsights = async (req, res) => {
    try {
        const { id } = req.params;

        const response = await fbClient.get(`/v22.0/${id}/insights`, {
            params: {
                metric: "reach,likes,comments,saved,shares",
                access_token: "EAANKDV86S6gBRMrqeSHAtcjZAt9JRcKhfjituzCt9ZCUoobNZCIgRT4bDqkZCpLZCeks83yJtBSxhZBdmNCza1evrqJGkKkWOnLPckLqG01Q5HcHmGxs8ZCFuyKerZAx1jG9W6tPq4RFQsAbU7tjznq4HpFJg0EckvGQnUcZCO23PdOFaq7BYynKbZCZBSYGgwl",
                appsecret_proof: "b4e95a2fbc498da4f06af7f0bcce97f369401e1b87d57d21810867f40f977a77",
            },
        });

        res.json(response.data.data);
    } catch (err) {
        res.status(500).json(err.response?.data);
    }
};

exports.getBestPosts = async (req, res) => {
    try {
        const IG_ID = "17841452927493239";

        const ACCESS_TOKEN =
            "EAANKDV86S6gBRMrqeSHAtcjZAt9JRcKhfjituzCt9ZCUoobNZCIgRT4bDqkZCpLZCeks83yJtBSxhZBdmNCza1evrqJGkKkWOnLPckLqG01Q5HcHmGxs8ZCFuyKerZAx1jG9W6tPq4RFQsAbU7tjznq4HpFJg0EckvGQnUcZCO23PdOFaq7BYynKbZCZBSYGgwl";

        const APP_SECRET_PROOF =
            "b4e95a2fbc498da4f06af7f0bcce97f369401e1b87d57d21810867f40f977a77";

        // 1. Get media
        const mediaRes = await fbClient.get(`/v17.0/${IG_ID}/media`, {
            params: {
                fields:
                    "id,caption,media_type,media_url,timestamp,like_count,comments_count",
                access_token: ACCESS_TOKEN,
                appsecret_proof: APP_SECRET_PROOF,
            },
        });

        const mediaList = mediaRes.data.data;

        // 2. Fetch insights (SAFE VERSION)
        const enriched = await Promise.all(
            mediaList.map(async (item) => {
                let reach = 0;
                let saved = 0;
                let shares = 0;

                try {
                    const insightRes = await fbClient.get(
                        `/v22.0/${item.id}/insights`,
                        {
                            params: {
                                metric: "reach,saved,shares",
                                access_token: ACCESS_TOKEN,
                                appsecret_proof: APP_SECRET_PROOF,
                            },
                        }
                    );

                    const insights = insightRes.data.data;

                    reach =
                        insights.find((i) => i.name === "reach")?.values?.[0]?.value || 0;

                    saved =
                        insights.find((i) => i.name === "saved")?.values?.[0]?.value || 0;

                    shares =
                        insights.find((i) => i.name === "shares")?.values?.[0]?.value || 0;
                } catch (err) {
                    console.log("Insight failed for:", item.id);
                }

                // ✅ ALWAYS RETURN DATA (no null)
                const likes = item.like_count || 0;
                const comments = item.comments_count || 0;

                const engagement = likes + comments + saved + shares;

                // ✅ SMART SCORE (stable ranking)
                const score =
                    comments * 2 + likes * 1 + saved * 2 + shares * 3 + reach * 0.01;

                return {
                    ...item,
                    reach,
                    saved,
                    shares,
                    engagement,
                    score,
                };
            })
        );

        // 3. Sort (BEST POSTS FIRST)
        enriched.sort((a, b) => b.score - a.score);

        res.json(enriched.slice(0, 10));
    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json(err.message);
    }
};




